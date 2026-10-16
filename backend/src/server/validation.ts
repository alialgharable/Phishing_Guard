import { RedirectPolicy } from "../services/redirects/redirectPolicy";
import { stripParserEdgeCharacters } from "../services/url/normalizer";

export type ScanValidationError =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "CREDENTIAL_URL"
  | "URL_TOO_LONG"
  | "PRIVATE_DESTINATION";

export interface ValidatedScanRequest {
  url: string;
}

export async function validateScanRequest(
  payload: unknown,
  maxUrlLength = 2048,
  policy = new RedirectPolicy(),
): Promise<
  | { ok: true; value: ValidatedScanRequest }
  | { ok: false; code: ScanValidationError; message: string }
> {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { url?: unknown }).url !== "string"
  )
    return {
      ok: false,
      code: "INVALID_URL",
      message: "Request must contain a URL string.",
    };
  // The URL parser's own edge rule is used rather than String.trim(): trimming Unicode
  // spaces can rescue a host the parser would reject, and intake must not disagree
  // with the analyzers about what the submitted destination is.
  const url = stripParserEdgeCharacters((payload as { url: string }).url);
  if (!url || url.length > maxUrlLength)
    return {
      ok: false,
      code: url ? "URL_TOO_LONG" : "INVALID_URL",
      message: url
        ? "URL exceeds the configured length limit."
        : "URL is required.",
    };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, code: "INVALID_URL", message: "URL is malformed." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    return {
      ok: false,
      code: "UNSUPPORTED_PROTOCOL",
      message: "Only HTTP and HTTPS URLs are supported.",
    };
  if (parsed.username || parsed.password)
    return {
      ok: false,
      code: "CREDENTIAL_URL",
      message: "URLs containing credentials are not accepted.",
    };
  const validation = await policy.validate(url);
  if (!validation.allowed)
    return {
      ok: false,
      code: "PRIVATE_DESTINATION",
      message:
        validation.reason ?? "Destination is blocked by the SSRF policy.",
    };
  return { ok: true, value: { url } };
}
