import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Request as PlaywrightRequest,
  type Response as PlaywrightResponse,
} from "playwright";
import type { SandboxConfig } from "./config.js";
import { chromiumLaunchArgs } from "./diagnostics.js";
import {
  canonicalHost,
  hostsDiffer,
  validateDestination,
  type Resolver,
} from "./network-policy.js";
import {
  classifyNavigationFailure,
  createRequestGate,
  type PolicyBlock,
} from "./request-gate.js";
import type {
  AnalyzeRequest,
  DownloadObservation,
  EvidenceItem,
  NetworkRequestObservation,
  RedirectObservation,
  SandboxResult,
} from "./types.js";

export interface IsolationBackend {
  analyze(input: AnalyzeRequest): Promise<SandboxResult>;
}

class LimitReachedError extends Error {
  constructor(
    public readonly limit: string,
    message: string,
  ) {
    super(message);
  }
}

function evidence(
  type: string,
  severity: string,
  title: string,
  description: string,
  rawEvidence?: unknown[],
): EvidenceItem {
  return {
    type,
    severity,
    title,
    description,
    source: "sandbox",
    category: "behavior",
    ...(rawEvidence ? { rawEvidence } : {}),
  };
}

function requestInitiator(request: PlaywrightRequest): string | undefined {
  const frameUrl = request.frame()?.url();
  return frameUrl && frameUrl !== "about:blank" ? frameUrl : undefined;
}

function domainFromUrl(url: string): string | undefined {
  try {
    const hostname = canonicalHost(new URL(url).hostname);
    return hostname.length > 0 ? hostname : undefined;
  } catch {
    return undefined;
  }
}

/** Host of a navigation result, or "" for non-host URLs such as about:blank. */
function finalUrlHost(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function headerNumber(
  headers: Record<string, string>,
  name: string,
): number | undefined {
  const value = headers[name.toLowerCase()];
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function timeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(
        new LimitReachedError(
          "overall_timeout",
          "overall scan timeout exceeded",
        ),
      );
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class PlaywrightIsolationBackend implements IsolationBackend {
  constructor(
    private readonly config: SandboxConfig,
    private readonly resolver?: Resolver,
  ) {}

  private validationOptions() {
    return {
      ...(this.resolver ? { resolver: this.resolver } : {}),
      extraBlockedCidrs: this.config.extraBlockedCidrs,
      allowedProtocols: this.config.allowedProtocols,
    };
  }

  async analyze(input: AnalyzeRequest): Promise<SandboxResult> {
    const started = Date.now();
    const limitsReached = new Set<string>();
    const behaviorObservations: EvidenceItem[] = [];
    const redirects: RedirectObservation[] = [];
    const networkRequests: NetworkRequestObservation[] = [];
    const downloads: DownloadObservation[] = [];
    const screenshots: SandboxResult["screenshots"] = [];
    const downloadTasks: Promise<void>[] = [];
    const contactedDomains = new Set<string>();

    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    let finalUrl: string | undefined;
    let status: SandboxResult["status"] = "available";
    let finalHttpStatus: number | undefined;
    let terminationReason = "completed";

    let policyMessage: string | undefined;
    let blockedUrl: string | undefined;

    const tempDir = await fs.mkdtemp(path.join("/tmp", "phishguard-scan-"));

    const finish = (overrides: Partial<SandboxResult> = {}): SandboxResult => ({
      status,
      ...(finalUrl ? { finalUrl } : {}),
      ...(finalHttpStatus !== undefined ? { httpStatus: finalHttpStatus } : {}),
      redirects,
      domainsContacted: [...contactedDomains].sort(),
      networkRequests,
      downloads,
      screenshots,
      behaviorObservations,
      durationMs: Date.now() - started,
      terminationReason,
      limitsReached: [...limitsReached],
      ...(policyMessage ? { message: policyMessage } : {}),
      ...(blockedUrl ? { blockedUrl } : {}),
      ...overrides,
    });

    try {
      const target = new URL(input.url);

      if (target.username.length > 0 || target.password.length > 0) {
        target.username = "";
        target.password = "";

        behaviorObservations.push(
          evidence(
            "sandbox_credentials_stripped",
            "context",
            "Credential text removed before navigation",
            "The submitted URL embedded user information. It was not sent to the destination host.",
          ),
        );
      }

      const gate = createRequestGate({
        ...(this.resolver ? { resolver: this.resolver } : {}),
        extraBlockedCidrs: this.config.extraBlockedCidrs,
        allowedProtocols: this.config.allowedProtocols,
        maxRequests: this.config.maxRequests,
        maxRedirects: this.config.maxRedirects,
        onAllowed: (hostname) => contactedDomains.add(hostname),
      });

      const blockedRequests = new WeakMap<object, PolicyBlock>();
      const requestRecords = new WeakMap<object, NetworkRequestObservation>();

      const validation = await validateDestination(
        target,
        this.validationOptions(),
      );

      if (!validation.allowed) {
        if (validation.reason?.startsWith("DNS resolution failed:")) {
          status = "error";
          terminationReason = "navigation_failed";
          policyMessage = validation.reason;
          return finish();
        }

        status = "blocked";
        terminationReason = "destination_blocked";
        policyMessage = validation.reason ?? "destination blocked by policy";
        blockedUrl = target.href;

        behaviorObservations.push(
          evidence(
            "sandbox_destination_blocked",
            "context",
            "Sandbox blocked destination",
            `${target.href} was refused before navigation: ${policyMessage}`,
            [
              {
                blockedUrl: target.href,
                reason: policyMessage,
                responded: false,
              },
            ],
          ),
        );

        return finish();
      }

      contactedDomains.add(validation.hostname);

      await fs.mkdir(this.config.artifactDir, { recursive: true });
      await fs.mkdir(path.join(tempDir, "downloads"), {
        recursive: true,
      });

      const run = async () => {
        browser = await chromium.launch({
          headless: true,
          downloadsPath: path.join(tempDir, "downloads"),
          args: chromiumLaunchArgs(),
        });

        context = await browser.newContext({
          acceptDownloads: true,
          viewport: { width: 1365, height: 768 },
          javaScriptEnabled: true,
          bypassCSP: false,
          permissions: [],
          serviceWorkers: "block",
          userAgent: "PhishGuardSandbox/0.1 (+passive-security-analysis)",
        });

        context.setDefaultTimeout(this.config.navigationTimeoutMs);
        context.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);

        await context.route("**/*", async (route, request) => {
          const decision = await gate
            .inspect({
              url: request.url(),
              method: request.method(),
              resourceType: request.resourceType(),
              isMainFrame: request.frame() === page?.mainFrame(),
            })
            .catch(() => undefined);

          if (decision?.action === "continue") {
            await route.continue().catch(() => undefined);
            return;
          }

          if (!decision) {
            behaviorObservations.push(
              evidence(
                "sandbox_request_blocked",
                "context",
                "Sandbox refused a request it could not evaluate",
                `${request.method()} ${request.url()} could not be evaluated against the destination policy and was not sent.`,
                [
                  {
                    url: request.url(),
                    method: request.method(),
                    reason: "policy evaluation failed",
                    responded: false,
                  },
                ],
              ),
            );

            await route.abort("blockedbyclient").catch(() => undefined);
            return;
          }

          const block = decision.block;

          if (block.cause === "request_limit") {
            limitsReached.add("max_requests");
          }

          if (block.cause === "redirect_limit") {
            limitsReached.add("max_redirects");
          }

          blockedRequests.set(request, block);

          const observed = requestRecords.get(request);

          if (observed) {
            observed.outcome = "attempted";
            observed.blockedReason = block.reason;
            delete observed.status;
          }

          const isNavigation =
            block.resourceType === "document" && block.isMainFrame;

          behaviorObservations.push(
            evidence(
              "sandbox_request_blocked",
              isNavigation ? "medium" : "context",
              isNavigation
                ? "Sandbox blocked a navigation request"
                : "Sandbox blocked a network request",
              `${block.method} ${block.url} blocked before it left the browser: ${block.reason}`,
              [
                {
                  url: block.url,
                  method: block.method,
                  resourceType: block.resourceType,
                  reason: block.reason,
                  viaRedirect: block.viaRedirect,
                  responded: false,
                },
              ],
            ),
          );

          await route.abort("blockedbyclient").catch(() => undefined);
        });

        page = await context.newPage();

        // Intercept redirect responses before Chromium can follow their
        // Location header to a prohibited destination.
        const cdp = await context.newCDPSession(page);

        await cdp.send("Fetch.enable", {
          patterns: [{ urlPattern: "*", requestStage: "Response" }],
        });

        cdp.on("Fetch.requestPaused", async (event) => {
          const responseStatus = event.responseStatusCode;
          const isRedirect =
            responseStatus !== undefined &&
            responseStatus >= 300 &&
            responseStatus < 400;

          const location = event.responseHeaders?.find(
            (header) => header.name.toLowerCase() === "location",
          )?.value;

          if (!isRedirect || !location) {
            await cdp
              .send("Fetch.continueRequest", { requestId: event.requestId })
              .catch(() => undefined);
            return;
          }

          let destination: string;

          try {
            destination = new URL(location, event.request.url).href;
          } catch {
            await cdp
              .send("Fetch.failRequest", {
                requestId: event.requestId,
                errorReason: "BlockedByClient",
              })
              .catch(() => undefined);
            return;
          }

          let block: PolicyBlock | undefined;

          try {
            block = await gate.inspectRedirect(
              event.request.url,
              responseStatus,
              location,
            );
          } catch {
            await cdp
              .send("Fetch.failRequest", {
                requestId: event.requestId,
                errorReason: "BlockedByClient",
              })
              .catch(() => undefined);
            return;
          }

          if (!block) {
            await cdp
              .send("Fetch.continueRequest", { requestId: event.requestId })
              .catch(() => undefined);
            return;
          }

          if (block.cause === "request_limit") {
            limitsReached.add("max_requests");
          }

          if (block.cause === "redirect_limit") {
            limitsReached.add("max_redirects");
          }

          // Record the redirect response before aborting the redirect hop.
          // The Playwright response event may not fire for this response.
          const redirectAlreadyRecorded = redirects.some(
            (item) =>
              item.url === event.request.url &&
              item.status === responseStatus &&
              item.location === location,
          );

          if (!redirectAlreadyRecorded) {
            const redirect: RedirectObservation = {
              url: event.request.url,
              status: responseStatus,
              location,
            };

            redirects.push(redirect);

            behaviorObservations.push(
              evidence(
                "sandbox_redirect",
                "context",
                "Redirect observed",
                `${responseStatus} redirect from ${event.request.url} to ${destination}`,
                [redirect],
              ),
            );
          }

          // Record the prohibited destination as an attempt, not a response.
          if (!networkRequests.some((item) => item.url === block.url)) {
            const blockedDomain = domainFromUrl(block.url);

            networkRequests.push({
              method: block.method,
              url: block.url,
              ...(blockedDomain ? { domain: blockedDomain } : {}),
              resourceType: block.resourceType,
              outcome: "attempted",
              blockedReason: block.reason,
            });
          }

          behaviorObservations.push(
            evidence(
              "sandbox_redirect_blocked",
              "medium",
              "Redirect target blocked by sandbox policy",
              `Redirect from ${event.request.url} to ${destination} was stopped before the destination was contacted: ${block.reason}`,
              [
                {
                  fromUrl: event.request.url,
                  blockedUrl: block.url,
                  reason: block.reason,
                  viaRedirect: true,
                  responded: false,
                },
              ],
            ),
          );

          await cdp
            .send("Fetch.failRequest", {
              requestId: event.requestId,
              errorReason: "BlockedByClient",
            })
            .catch(() => undefined);
        });

        page.on("console", (message) => {
          if (["error", "warning"].includes(message.type())) {
            behaviorObservations.push(
              evidence(
                "browser_console_event",
                "context",
                "Browser console event",
                `${message.type()}: ${message.text().slice(0, 300)}`,
              ),
            );
          }
        });

        page.on("request", (request) => {
          const initiator = requestInitiator(request);
          const domain = domainFromUrl(request.url());
          const block = blockedRequests.get(request);

          const observation: NetworkRequestObservation = {
            method: request.method(),
            url: request.url(),
            ...(domain ? { domain } : {}),
            resourceType: request.resourceType(),
            ...(initiator ? { initiator } : {}),
            outcome: "attempted",
            ...(block ? { blockedReason: block.reason } : {}),
          };

          requestRecords.set(request, observation);
          networkRequests.push(observation);
        });

        page.on("response", (response: PlaywrightResponse) => {
          const request = response.request();
          const headers = response.headers();

          const existing = requestRecords.get(request);

          if (existing) {
            existing.status = response.status();
            existing.outcome = "responded";
            delete existing.blockedReason;

            const contentType = headers["content-type"];
            const contentLength = headerNumber(headers, "content-length");

            if (contentType) {
              existing.contentType = contentType;
            }

            if (contentLength !== undefined) {
              existing.contentLength = contentLength;

              if (contentLength > this.config.maxResponseBodyBytes) {
                limitsReached.add("max_response_body_bytes");

                behaviorObservations.push(
                  evidence(
                    "sandbox_response_size_limit",
                    "context",
                    "Response size limit observed",
                    `Response metadata reported ${contentLength} bytes for ${response.url()}, above the configured metadata body-size limit. Body content was not stored.`,
                    [{ url: response.url(), contentLength }],
                  ),
                );
              }
            }
          }

          if (
            response.status() >= 300 &&
            response.status() < 400 &&
            request.resourceType() === "document"
          ) {
            const location = headers.location;
            const redirectAlreadyRecorded = redirects.some(
              (item) =>
                item.url === response.url() &&
                item.status === response.status() &&
                item.location === location,
            );

            if (!redirectAlreadyRecorded) {
              const redirect: RedirectObservation = {
                url: response.url(),
                status: response.status(),
                ...(location ? { location } : {}),
              };

              redirects.push(redirect);

              behaviorObservations.push(
                evidence(
                  "sandbox_redirect",
                  "context",
                  "Redirect observed",
                  `${response.status()} redirect from ${response.url()}${location ? ` to ${location}` : ""}`,
                  [redirect],
                ),
              );
            }

            if (redirects.length > this.config.maxRedirects) {
              limitsReached.add("max_redirects");
              void page?.close().catch(() => undefined);
            }
          }
        });

        page.on("download", (download) => {
          const task = (async () => {
            const observed: DownloadObservation = {
              filename: download.suggestedFilename(),
              url: download.url(),
              timestamp: new Date().toISOString(),
            };

            try {
              const downloadPath = await download.path();

              if (downloadPath) {
                const stat = await fs.stat(downloadPath);
                observed.size = stat.size;

                if (stat.size > this.config.maxDownloadBytes) {
                  observed.limitExceeded = true;
                  limitsReached.add("max_download_bytes");
                } else {
                  const file = await fs.readFile(downloadPath);
                  observed.sha256 = crypto
                    .createHash("sha256")
                    .update(file)
                    .digest("hex");
                }

                await fs.rm(downloadPath, { force: true });
              }
            } catch {
              // Best-effort metadata. Do not execute or open downloads.
            }

            downloads.push(observed);

            behaviorObservations.push(
              evidence(
                "sandbox_download_observed",
                observed.limitExceeded ? "medium" : "context",
                "Download observed",
                `Download triggered from ${observed.url}`,
                [observed],
              ),
            );
          })();

          downloadTasks.push(task);
        });

        try {
          const mainResponse = await page.goto(target.href, {
            waitUntil: "domcontentloaded",
            timeout: this.config.navigationTimeoutMs,
          });

          finalHttpStatus = mainResponse?.status();

          await page
            .waitForLoadState("networkidle", {
              timeout: Math.min(5_000, this.config.navigationTimeoutMs),
            })
            .catch(() => undefined);
        } catch (error) {
          const outcome = classifyNavigationFailure({
            error,
            documentBlocks: gate.documentBlocks,
            limitsReached,
          });

          if (outcome.kind === "blocked") {
            status = "blocked";
            terminationReason = outcome.terminationReason;
            policyMessage = outcome.message;
            blockedUrl = outcome.block.url;

            behaviorObservations.push(
              evidence(
                "sandbox_navigation_blocked",
                "medium",
                outcome.block.viaRedirect
                  ? "Redirect blocked by sandbox policy"
                  : "Navigation blocked by sandbox policy",
                outcome.message,
                [
                  {
                    blockedUrl: outcome.block.url,
                    initialUrl: target.href,
                    reason: outcome.block.reason,
                    viaRedirect: outcome.block.viaRedirect,
                    browserError:
                      error instanceof Error ? error.message : String(error),
                    responded: false,
                  },
                ],
              ),
            );

            await Promise.allSettled(downloadTasks);
            return;
          }

          if (outcome.kind === "limit") {
            throw new LimitReachedError(
              outcome.terminationReason,
              outcome.message,
            );
          }

          status = "error";
          terminationReason = outcome.terminationReason;
          policyMessage = outcome.message;

          await Promise.allSettled(downloadTasks);
          return;
        }

        finalUrl = page.url();

        const finalValidation = await validateDestination(
          new URL(finalUrl),
          this.validationOptions(),
        );

        if (!finalValidation.allowed) {
          const redirectBlock = gate.blocks.find(
            (block) =>
              block.cause === "policy" &&
              block.resourceType === "document" &&
              block.viaRedirect &&
              redirects.some((redirect) => {
                if (!redirect.location) return false;

                try {
                  return (
                    new URL(redirect.location, redirect.url).href ===
                    new URL(block.url).href
                  );
                } catch {
                  return false;
                }
              }),
          );

          if (redirectBlock) {
            status = "blocked";
            terminationReason = "redirect_destination_blocked";
            policyMessage = `${redirectBlock.method} ${redirectBlock.url} was blocked by sandbox policy: ${redirectBlock.reason}`;
            blockedUrl = redirectBlock.url;

            behaviorObservations.push(
              evidence(
                "sandbox_redirect_blocked",
                "medium",
                "Redirect target blocked by sandbox policy",
                policyMessage,
                [
                  {
                    blockedUrl: redirectBlock.url,
                    reason: redirectBlock.reason,
                    viaRedirect: true,
                    responded: false,
                  },
                ],
              ),
            );

            await Promise.allSettled(downloadTasks);
            return;
          }

          status = "blocked";
          terminationReason = "final_destination_blocked";
          policyMessage =
            finalValidation.reason ?? "final destination blocked by policy";
          blockedUrl = finalUrl;

          behaviorObservations.push(
            evidence(
              "sandbox_navigation_blocked",
              "medium",
              "Navigation reached a blocked destination",
              `${finalUrl} was reached despite the request policy: ${policyMessage}`,
              [
                {
                  blockedUrl: finalUrl,
                  reason: policyMessage,
                  initialUrl: target.href,
                },
              ],
            ),
          );

          await Promise.allSettled(downloadTasks);
          return;
        }

        await Promise.allSettled(downloadTasks);

        behaviorObservations.push(
          evidence(
            "sandbox_page_loaded",
            "context",
            "Page loaded successfully",
            `Sandbox loaded ${finalUrl}${finalHttpStatus !== undefined ? ` with HTTP status ${finalHttpStatus}` : ""}.`,
            [
              {
                initialUrl: target.href,
                finalUrl,
                httpStatus: finalHttpStatus ?? null,
              },
            ],
          ),
        );

        behaviorObservations.push(
          evidence(
            "sandbox_network_requests_observed",
            "context",
            "Network requests observed",
            `${networkRequests.length} network request${networkRequests.length === 1 ? "" : "s"} observed during passive navigation.`,
            [{ count: networkRequests.length }],
          ),
        );

        behaviorObservations.push(
          evidence(
            "sandbox_domains_contacted",
            "context",
            "Contacted domains observed",
            `${contactedDomains.size} unique domain${contactedDomains.size === 1 ? "" : "s"} contacted: ${[...contactedDomains].sort().join(", ")}.`,
            [{ domains: [...contactedDomains].sort() }],
          ),
        );

        if (downloads.length === 0) {
          behaviorObservations.push(
            evidence(
              "sandbox_no_downloads",
              "context",
              "No downloads detected",
              "Passive navigation did not trigger a browser download.",
            ),
          );
        }

        const initialDomain = canonicalHost(target.hostname);
        const finalDomain = canonicalHost(finalUrlHost(finalUrl));

        if (hostsDiffer(initialDomain, finalDomain)) {
          behaviorObservations.push(
            evidence(
              "sandbox_cross_domain_navigation",
              "medium",
              "Navigation ended on a different domain",
              `Initial domain ${initialDomain} redirected or navigated to ${finalDomain}.`,
              [{ initialDomain, finalDomain }],
            ),
          );
        }

        if (contactedDomains.size >= 5) {
          behaviorObservations.push(
            evidence(
              "sandbox_multiple_external_domains",
              "context",
              "Multiple domains contacted",
              `Passive page load contacted ${contactedDomains.size} unique domains.`,
              [{ domains: [...contactedDomains].sort() }],
            ),
          );
        }

        if (
          networkRequests.length >= Math.floor(this.config.maxRequests * 0.8)
        ) {
          behaviorObservations.push(
            evidence(
              "sandbox_many_requests",
              "context",
              "Large number of requests observed",
              `${networkRequests.length} requests approached the configured request limit of ${this.config.maxRequests}.`,
              [
                {
                  requestCount: networkRequests.length,
                  maxRequests: this.config.maxRequests,
                },
              ],
            ),
          );
        }

        const screenshotBuffer = await page.screenshot({
          type: "png",
          fullPage: false,
          animations: "disabled",
          caret: "hide",
        });

        if (screenshotBuffer.byteLength > this.config.maxScreenshotBytes) {
          limitsReached.add("max_screenshot_bytes");
        } else {
          const artifactId = `${input.requestId ?? crypto.randomUUID()}-${crypto.randomUUID()}.png`;
          const artifactPath = path.join(this.config.artifactDir, artifactId);

          await fs.writeFile(artifactPath, screenshotBuffer);

          const deletionTimer = setTimeout(() => {
            void fs.rm(artifactPath, { force: true }).catch(() => undefined);
          }, this.config.artifactRetentionMs);

          deletionTimer.unref();

          screenshots.push({
            artifactId: `sandbox://screenshots/${artifactId}`,
            format: "png",
            width: 1365,
            height: 768,
            bytes: screenshotBuffer.byteLength,
            timestamp: new Date().toISOString(),
          });
        }
      };

      await timeout(run(), this.config.overallTimeoutMs, () => {
        limitsReached.add("overall_timeout");
        void page?.close().catch(() => undefined);
        void context?.close().catch(() => undefined);
        void browser?.close().catch(() => undefined);
      });
    } catch (error) {
      if (error instanceof LimitReachedError) {
        limitsReached.add(error.limit);
        status = error.limit.includes("timeout") ? "timeout" : "blocked";
        terminationReason = error.limit;
        policyMessage = error.message;
      } else {
        status = "error";
        terminationReason = "sandbox_failure";
        policyMessage =
          error instanceof Error ? error.message : "sandbox analysis failed";
      }
    } finally {
      await page?.close().catch(() => undefined);
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);

      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
    }

    if (limitsReached.has("max_requests") && status === "available") {
      terminationReason = "max_requests";
    }

    return finish();
  }
}
