import { RedirectFetcher } from "../redirects/redirectFetcher";
import { RedirectPolicy } from "../redirects/redirectPolicy";
import { ContentFetchResult, ContentFetcherOptions } from "./types";
import { ContentPolicy } from "./contentPolicy";

export class ContentFetcher {
  private readonly policy: ContentPolicy;
  private readonly redirectFetcher: RedirectFetcher;

  constructor(options: ContentFetcherOptions = {}) {
    this.policy = options.policy ?? new ContentPolicy();
    const redirectPolicy =
      options.redirectPolicy ??
      new RedirectPolicy({
        config: {
          timeoutMs: this.policy.config.timeoutMs,
          maxResponseBytes: this.policy.config.maxBytes,
        },
      });
    this.redirectFetcher =
      options.redirectFetcher ??
      new RedirectFetcher({
        policy: redirectPolicy,
        fetcher: options.fetcher,
        consumeBody: false,
      });
  }

  public async fetch(url: string): Promise<ContentFetchResult> {
    const fetched = await this.redirectFetcher.fetch(url);
    const contentType = fetched.response.headers.get("content-type");
    if (!this.policy.acceptsContentType(contentType)) {
      await fetched.response.body?.cancel();
      throw new Error(
        "Unsupported content type. Only HTML content is supported.",
      );
    }
    const declaredLength = Number.parseInt(
      fetched.response.headers.get("content-length") ?? "",
      10,
    );
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > this.policy.config.maxBytes
    ) {
      await fetched.response.body?.cancel();
      throw new Error("Content response exceeded the configured size limit.");
    }
    const body = await readBody(fetched.response, this.policy.config.maxBytes);
    return {
      response: fetched.response,
      finalUrl: url,
      body,
      contentLength: new TextEncoder().encode(body).byteLength,
    };
  }
}

async function readBody(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return body + decoder.decode();
      total += chunk.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("Content response exceeded the configured size limit.");
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
