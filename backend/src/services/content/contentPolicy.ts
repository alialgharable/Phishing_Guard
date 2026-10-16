import { ContentPolicyConfig, ContentPolicyOptions } from "./types";

const DEFAULTS: ContentPolicyConfig = {
  maxBytes: Number.parseInt(process.env.CONTENT_MAX_BYTES ?? "2097152", 10),
  timeoutMs: Number.parseInt(process.env.CONTENT_TIMEOUT_MS ?? "5000", 10),
  maxHtmlNodes: Number.parseInt(
    process.env.CONTENT_MAX_HTML_NODES ?? "10000",
    10,
  ),
  maxTextLength: Number.parseInt(
    process.env.CONTENT_MAX_TEXT_LENGTH ?? "100000",
    10,
  ),
};

export class ContentPolicy {
  public readonly config: ContentPolicyConfig;

  constructor(options: ContentPolicyOptions = {}) {
    this.config = {
      maxBytes: clamp(
        options.config?.maxBytes ?? DEFAULTS.maxBytes,
        1_024,
        20 * 1024 * 1024,
      ),
      timeoutMs: clamp(
        options.config?.timeoutMs ?? DEFAULTS.timeoutMs,
        100,
        30_000,
      ),
      maxHtmlNodes: clamp(
        options.config?.maxHtmlNodes ?? DEFAULTS.maxHtmlNodes,
        100,
        100_000,
      ),
      maxTextLength: clamp(
        options.config?.maxTextLength ?? DEFAULTS.maxTextLength,
        1_000,
        1_000_000,
      ),
    };
  }

  public acceptsContentType(contentType: string | null): boolean {
    if (!contentType) return false;
    const normalized = contentType.split(";", 1)[0].trim().toLowerCase();
    return normalized === "text/html" || normalized === "application/xhtml+xml";
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value)
    ? Math.min(Math.max(Math.floor(value), minimum), maximum)
    : minimum;
}
