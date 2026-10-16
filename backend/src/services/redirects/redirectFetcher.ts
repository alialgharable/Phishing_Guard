import { RedirectFetchResult, RedirectFetcherOptions } from "./types";
import { RedirectPolicy } from "./redirectPolicy";

export class RedirectFetcher {
  private readonly policy: RedirectPolicy;
  private readonly fetcher: typeof fetch;
  private readonly consumeBody: boolean;

  constructor(options: RedirectFetcherOptions = {}) {
    this.policy = options.policy ?? new RedirectPolicy();
    this.fetcher = options.fetcher ?? fetch;
    this.consumeBody = options.consumeBody ?? true;
  }

  public async fetch(url: string): Promise<RedirectFetchResult> {
    const validation = await this.policy.validate(url);
    if (!validation.allowed)
      throw new Error(
        validation.reason ?? "Destination blocked by redirect policy.",
      );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.policy.config.timeoutMs,
    );
    const started = Date.now();
    try {
      const response = await this.fetcher(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html, application/xhtml+xml, text/plain;q=0.8",
        },
      });
      const contentLength = Number.parseInt(
        response.headers.get("content-length") ?? "",
        10,
      );
      if (
        Number.isFinite(contentLength) &&
        contentLength > this.policy.config.maxResponseBytes
      ) {
        await response.body?.cancel();
        throw new Error("Response exceeded the configured size limit.");
      }
      if (this.consumeBody) {
        await consumeResponse(response, this.policy.config.maxResponseBytes);
      }
      return { response, durationMs: Date.now() - started };
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error("Redirect request timed out.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function consumeResponse(
  response: Response,
  maximumBytes: number,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return;
      total += chunk.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("Response exceeded the configured size limit.");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
