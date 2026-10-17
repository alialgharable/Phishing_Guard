import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Request as PlaywrightRequest, type Response as PlaywrightResponse } from "playwright";
import type { SandboxConfig } from "./config.js";
import { chromiumLaunchArgs } from "./diagnostics.js";
import { canonicalHost, hostsDiffer, validateDestination, type Resolver } from "./network-policy.js";
import { classifyNavigationFailure, createRequestGate, type PolicyBlock } from "./request-gate.js";
import type { AnalyzeRequest, DownloadObservation, EvidenceItem, NetworkRequestObservation, RedirectObservation, SandboxResult } from "./types.js";

export interface IsolationBackend {
  analyze(input: AnalyzeRequest): Promise<SandboxResult>;
}

class LimitReachedError extends Error {
  constructor(public readonly limit: string, message: string) {
    super(message);
  }
}

function evidence(type: string, severity: string, title: string, description: string, rawEvidence?: unknown[]): EvidenceItem {
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

function headerNumber(headers: Record<string, string>, name: string): number | undefined {
  const value = headers[name.toLowerCase()];
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function timeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new LimitReachedError("overall_timeout", "overall scan timeout exceeded"));
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
    // `policyMessage`/`blockedUrl` describe why navigation itself was refused. They
    // are deliberately separate from subresource blocks: a tracker image being
    // blocked must not put a sentence in the message of a scan that completed.
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
        // Embedded credentials would be replayed to the visited host as HTTP Basic
        // authentication. Strip them before navigation and say so.
        target.username = "";
        target.password = "";
        behaviorObservations.push(evidence(
          "sandbox_credentials_stripped",
          "context",
          "Credential text removed before navigation",
          "The submitted URL embedded user information. It was not sent to the destination host.",
        ));
      }
      // One decision point for every request the browser makes, including the hops it
      // follows on its own after a 3xx response. The route handler below enforces it;
      // the recorded decisions are what let a refused navigation report as `blocked`
      // rather than as an opaque Chromium network error.
      const gate = createRequestGate({
        ...(this.resolver ? { resolver: this.resolver } : {}),
        extraBlockedCidrs: this.config.extraBlockedCidrs,
        allowedProtocols: this.config.allowedProtocols,
        maxRequests: this.config.maxRequests,
        maxRedirects: this.config.maxRedirects,
        onAllowed: (hostname) => contactedDomains.add(hostname),
      });
      const requestKey = (method: string, url: string) => `${method} ${url}`;
      const blockedRequestKeys = new Map<string, PolicyBlock>();

      const validation = await validateDestination(target, this.validationOptions());
      if (!validation.allowed) {
        status = "blocked";
        terminationReason = "destination_blocked";
        policyMessage = validation.reason ?? "destination blocked by policy";
        blockedUrl = target.href;
        behaviorObservations.push(evidence(
          "sandbox_destination_blocked",
          "context",
          "Sandbox blocked destination",
          `${target.href} was refused before navigation: ${policyMessage}`,
          [{ blockedUrl: target.href, reason: policyMessage, responded: false }],
        ));
        return finish();
      }
      contactedDomains.add(validation.hostname);

      await fs.mkdir(this.config.artifactDir, { recursive: true });
      await fs.mkdir(path.join(tempDir, "downloads"), { recursive: true });

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
          // Every resource type is judged by the same policy, so a redirect cannot reach a
          // prohibited host through a subresource, a fetch, or a nested navigation.
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

          // Fail closed: a request whose policy outcome could not be established is not a
          // request that was proven allowed, and the browser must not guess on our behalf.
          if (!decision) {
            behaviorObservations.push(evidence(
              "sandbox_request_blocked",
              "context",
              "Sandbox refused a request it could not evaluate",
              `${request.method()} ${request.url()} could not be evaluated against the destination policy and was not sent.`,
              [{ url: request.url(), method: request.method(), reason: "policy evaluation failed", responded: false }],
            ));
            await route.abort("blockedbyclient").catch(() => undefined);
            return;
          }

          const block = decision.block;
          if (block.cause === "request_limit") limitsReached.add("max_requests");
          if (block.cause === "redirect_limit") limitsReached.add("max_redirects");
          blockedRequestKeys.set(requestKey(request.method(), request.url()), block);
          // The request observer usually records first; patch it so an attempted, refused
          // request can never be read as one that received a response.
          const observed = [...networkRequests].reverse().find((item) => item.url === request.url() && item.method === request.method());
          if (observed) {
            observed.outcome = "attempted";
            observed.blockedReason = block.reason;
          }
          const isNavigation = block.resourceType === "document" && block.isMainFrame;
          behaviorObservations.push(evidence(
            "sandbox_request_blocked",
            isNavigation ? "medium" : "context",
            isNavigation ? "Sandbox blocked a navigation request" : "Sandbox blocked a network request",
            `${block.method} ${block.url} blocked before it left the browser: ${block.reason}`,
            [{ url: block.url, method: block.method, resourceType: block.resourceType, reason: block.reason, viaRedirect: block.viaRedirect, responded: false }],
          ));
          await route.abort("blockedbyclient").catch(() => undefined);
        });

        page = await context.newPage();
        page.on("console", (message) => {
          if (["error", "warning"].includes(message.type())) {
            behaviorObservations.push(evidence("browser_console_event", "context", "Browser console event", `${message.type()}: ${message.text().slice(0, 300)}`));
          }
        });
        page.on("request", (request) => {
          const initiator = requestInitiator(request);
          const domain = domainFromUrl(request.url());
          const block = blockedRequestKeys.get(requestKey(request.method(), request.url()));
          networkRequests.push({
            method: request.method(),
            url: request.url(),
            ...(domain ? { domain } : {}),
            resourceType: request.resourceType(),
            ...(initiator ? { initiator } : {}),
            // Requests are logged as attempts. `outcome` only becomes "responded" if a
            // response actually arrived, which keeps blocked and failed requests from
            // looking like observed traffic.
            outcome: "attempted",
            ...(block ? { blockedReason: block.reason } : {}),
          });
        });
        page.on("response", (response: PlaywrightResponse) => {
          const request = response.request();
          const headers = response.headers();
          const existing = [...networkRequests].reverse().find((item) => item.url === request.url() && item.method === request.method());
          if (existing) {
            existing.status = response.status();
            existing.outcome = "responded";
            delete existing.blockedReason;
            const contentType = headers["content-type"];
            const contentLength = headerNumber(headers, "content-length");
            if (contentType) existing.contentType = contentType;
            if (contentLength !== undefined) {
              existing.contentLength = contentLength;
              if (contentLength > this.config.maxResponseBodyBytes) {
                limitsReached.add("max_response_body_bytes");
                behaviorObservations.push(evidence(
                  "sandbox_response_size_limit",
                  "context",
                  "Response size limit observed",
                  `Response metadata reported ${contentLength} bytes for ${response.url()}, above the configured metadata body-size limit. Body content was not stored.`,
                  [{ url: response.url(), contentLength }],
                ));
              }
            }
          }
          if (response.status() >= 300 && response.status() < 400 && request.resourceType() === "document") {
            const redirect = { url: response.url(), status: response.status(), ...(headers.location ? { location: headers.location } : {}) };
            redirects.push(redirect);
            behaviorObservations.push(evidence("sandbox_redirect", "context", "Redirect observed", `${response.status()} redirect from ${response.url()}${headers.location ? ` to ${headers.location}` : ""}`, [redirect]));
            if (request.frame() === page?.mainFrame()) {
              // Evaluate the hop the browser is about to follow while the redirect is
              // still in hand. Enforcement stays in the route handler; this records the
              // policy reason for the refused target instead of inferring it later.
              void gate
                .inspectRedirect(response.url(), response.status(), headers["location"])
                .then((block) => {
                  if (!block) return;
                  behaviorObservations.push(evidence(
                    "sandbox_redirect_blocked",
                    "medium",
                    "Redirect target blocked by sandbox policy",
                    `${redirect.status} redirect from ${redirect.url} targets ${block.url}, which the sandbox refused: ${block.reason}`,
                    [{ blockedUrl: block.url, reason: block.reason, fromUrl: redirect.url, viaRedirect: true, responded: false }],
                  ));
                })
                .catch(() => undefined);
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
                  observed.sha256 = crypto.createHash("sha256").update(file).digest("hex");
                }
                await fs.rm(downloadPath, { force: true });
              }
            } catch {
              // Best-effort metadata. Do not execute or open downloads.
            }
            downloads.push(observed);
            behaviorObservations.push(evidence("sandbox_download_observed", observed.limitExceeded ? "medium" : "context", "Download observed", `Download triggered from ${observed.url}`, [observed]));
          })();
          downloadTasks.push(task);
        });

        try {
          const mainResponse = await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: this.config.navigationTimeoutMs });
          finalHttpStatus = mainResponse?.status();
          await page.waitForLoadState("networkidle", { timeout: Math.min(5_000, this.config.navigationTimeoutMs) }).catch(() => undefined);
        } catch (error) {
          // `page.goto()` rejects with net::ERR_BLOCKED_BY_CLIENT when the route gate
          // aborted the document request. Classify from the recorded decision so a
          // policy block is not reported as a generic navigation error, while genuine
          // failures (refused connection, DNS failure, timeout) stay `error`.
          const outcome = classifyNavigationFailure({ error, documentBlocks: gate.documentBlocks, limitsReached });
          if (outcome.kind === "blocked") {
            status = "blocked";
            terminationReason = outcome.terminationReason;
            policyMessage = outcome.message;
            blockedUrl = outcome.block.url;
            behaviorObservations.push(evidence(
              "sandbox_navigation_blocked",
              "medium",
              outcome.block.viaRedirect ? "Redirect blocked by sandbox policy" : "Navigation blocked by sandbox policy",
              outcome.message,
              [{
                blockedUrl: outcome.block.url,
                initialUrl: target.href,
                reason: outcome.block.reason,
                viaRedirect: outcome.block.viaRedirect,
                browserError: error instanceof Error ? error.message : String(error),
                responded: false,
              }],
            ));
            await Promise.allSettled(downloadTasks);
            return;
          }
          if (outcome.kind === "limit") throw new LimitReachedError(outcome.terminationReason, outcome.message);
          // A genuine failure - refused connection, DNS failure, TLS failure, timeout -
          // stays `error` with Chromium's own message. It is uncertainty about the scan,
          // never a verdict about the URL, and it is never relabelled as a block.
          status = "error";
          terminationReason = outcome.terminationReason;
          policyMessage = outcome.message;
          await Promise.allSettled(downloadTasks);
          return;
        }
        finalUrl = page.url();
        const finalValidation = await validateDestination(new URL(finalUrl), this.validationOptions());
        if (!finalValidation.allowed) {
          // Reached only if the engine completed a navigation the policy refused, which
          // should not happen while the route gate is armed. Report it as a block with
          // its reason rather than letting an unexpected engine path look like a
          // successful scan.
          status = "blocked";
          terminationReason = "final_destination_blocked";
          policyMessage = finalValidation.reason ?? "final destination blocked by policy";
          blockedUrl = finalUrl;
          behaviorObservations.push(evidence(
            "sandbox_navigation_blocked",
            "medium",
            "Navigation reached a blocked destination",
            `${finalUrl} was reached despite the request policy: ${policyMessage}`,
            [{ blockedUrl: finalUrl, reason: policyMessage, initialUrl: target.href }],
          ));
          await Promise.allSettled(downloadTasks);
          return;
        }
        await Promise.allSettled(downloadTasks);
        behaviorObservations.push(evidence(
          "sandbox_page_loaded",
          "context",
          "Page loaded successfully",
          `Sandbox loaded ${finalUrl}${finalHttpStatus !== undefined ? ` with HTTP status ${finalHttpStatus}` : ""}.`,
          [{ initialUrl: target.href, finalUrl, httpStatus: finalHttpStatus ?? null }],
        ));
        behaviorObservations.push(evidence(
          "sandbox_network_requests_observed",
          "context",
          "Network requests observed",
          `${networkRequests.length} network request${networkRequests.length === 1 ? "" : "s"} observed during passive navigation.`,
          [{ count: networkRequests.length }],
        ));
        behaviorObservations.push(evidence(
          "sandbox_domains_contacted",
          "context",
          "Contacted domains observed",
          `${contactedDomains.size} unique domain${contactedDomains.size === 1 ? "" : "s"} contacted: ${[...contactedDomains].sort().join(", ")}.`,
          [{ domains: [...contactedDomains].sort() }],
        ));
        if (downloads.length === 0) {
          behaviorObservations.push(evidence("sandbox_no_downloads", "context", "No downloads detected", "Passive navigation did not trigger a browser download."));
        }
        const initialDomain = canonicalHost(target.hostname);
        const finalDomain = canonicalHost(finalUrlHost(finalUrl));
        if (hostsDiffer(initialDomain, finalDomain)) {
          behaviorObservations.push(evidence(
            "sandbox_cross_domain_navigation",
            "medium",
            "Navigation ended on a different domain",
            `Initial domain ${initialDomain} redirected or navigated to ${finalDomain}.`,
            [{ initialDomain, finalDomain }],
          ));
        }
        if (contactedDomains.size >= 5) {
          behaviorObservations.push(evidence(
            "sandbox_multiple_external_domains",
            "context",
            "Multiple domains contacted",
            `Passive page load contacted ${contactedDomains.size} unique domains.`,
            [{ domains: [...contactedDomains].sort() }],
          ));
        }
        if (networkRequests.length >= Math.floor(this.config.maxRequests * 0.8)) {
          behaviorObservations.push(evidence(
            "sandbox_many_requests",
            "context",
            "Large number of requests observed",
            `${networkRequests.length} requests approached the configured request limit of ${this.config.maxRequests}.`,
            [{ requestCount: networkRequests.length, maxRequests: this.config.maxRequests }],
          ));
        }
        const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false, animations: "disabled", caret: "hide" });
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
          screenshots.push({ artifactId: `sandbox://screenshots/${artifactId}`, format: "png", width: 1365, height: 768, bytes: screenshotBuffer.byteLength, timestamp: new Date().toISOString() });
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
        // The limit name in `terminationReason`, the sentence in `message`: a limit is
        // an operational outcome with an explanation, not a verdict about the URL.
        terminationReason = error.limit;
        policyMessage = error.message;
      } else {
        status = "error";
        terminationReason = "sandbox_failure";
        policyMessage = error instanceof Error ? error.message : "sandbox analysis failed";
      }
    } finally {
      await page?.close().catch(() => undefined);
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }

    if (limitsReached.has("max_requests") && status === "available") {
      terminationReason = "max_requests";
    }
    return finish();
  }
}
