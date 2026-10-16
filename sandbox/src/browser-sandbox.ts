import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Request as PlaywrightRequest, type Response as PlaywrightResponse } from "playwright";
import type { SandboxConfig } from "./config.js";
import { chromiumLaunchArgs } from "./diagnostics.js";
import { canonicalHost, hostsDiffer, validateDestination, type Resolver } from "./network-policy.js";
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
    let blockedReason: string | undefined;
    let requestCount = 0;
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
      ...(blockedReason ? { message: blockedReason } : {}),
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
      const validation = await validateDestination(target, this.validationOptions());
      if (!validation.allowed) {
        status = "blocked";
        terminationReason = "destination_blocked";
        blockedReason = validation.reason ?? "destination blocked by policy";
        behaviorObservations.push(evidence("sandbox_destination_blocked", "context", "Sandbox blocked destination", blockedReason));
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
          requestCount += 1;
          if (requestCount > this.config.maxRequests) {
            limitsReached.add("max_requests");
            await route.abort("blockedbyclient");
            return;
          }
          let requestUrl: URL;
          try {
            requestUrl = new URL(request.url());
          } catch {
            await route.abort("blockedbyclient");
            return;
          }
          const destination = await validateDestination(requestUrl, this.validationOptions());
          if (!destination.allowed) {
            blockedReason = destination.reason ?? "destination blocked by policy";
            behaviorObservations.push(evidence(
              "sandbox_request_blocked",
              "context",
              "Sandbox blocked a network request",
              `${request.method()} ${request.url()} blocked: ${blockedReason}`,
              [{ url: request.url(), method: request.method(), reason: blockedReason }],
            ));
            await route.abort("blockedbyclient");
            return;
          }
          contactedDomains.add(destination.hostname);
          await route.continue();
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
          networkRequests.push({
            method: request.method(),
            url: request.url(),
            ...(domain ? { domain } : {}),
            resourceType: request.resourceType(),
            ...(initiator ? { initiator } : {}),
          });
        });
        page.on("response", (response: PlaywrightResponse) => {
          const request = response.request();
          const headers = response.headers();
          const existing = [...networkRequests].reverse().find((item) => item.url === request.url() && item.method === request.method());
          if (existing) {
            existing.status = response.status();
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
          if (limitsReached.has("max_redirects")) throw new LimitReachedError("max_redirects", "redirect limit exceeded");
          throw error;
        }
        finalUrl = page.url();
        const finalValidation = await validateDestination(new URL(finalUrl), this.validationOptions());
        if (!finalValidation.allowed) {
          status = "blocked";
          terminationReason = "final_destination_blocked";
          blockedReason = finalValidation.reason ?? "final destination blocked by policy";
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
        terminationReason = error.message;
        blockedReason = error.message;
      } else {
        status = "error";
        terminationReason = "error";
        blockedReason = error instanceof Error ? error.message : "sandbox analysis failed";
      }
    } finally {
      await page?.close().catch(() => undefined);
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }

    if (limitsReached.has("max_requests") && status === "available") {
      terminationReason = "request limit reached";
    }
    return finish();
  }
}
