import { canonicalHost, validateDestination, type Resolver } from "./network-policy.js";
import { validateRedirectTarget } from "./redirect-policy.js";

/**
 * Why a request was refused. `policy` covers every address and name rule; the limit
 * causes are operational budgets and must stay distinguishable from a security block,
 * so a scan that merely hit its request cap is not reported as an attack.
 */
export type BlockCause = "policy" | "request_limit" | "redirect_limit" | "unparseable_url";

export interface PolicyBlock {
  url: string;
  method: string;
  resourceType: string;
  hostname: string;
  reason: string;
  cause: BlockCause;
  /**
   * True when the browser reached this URL by following a redirect rather than by
   * navigating to the submitted target. This is the difference between a direct scan
   * of a prohibited host and a redirect-based bypass attempt, and it is what selects
   * the termination reason reported to the caller.
   */
  viaRedirect: boolean;
  /** True for the top-level frame's own navigation. */
  isMainFrame: boolean;
  /**
   * A blocked request is an attempt, never a response. The literal `false` makes it
   * impossible to read a blocked entry as though the destination had answered.
   */
  responded: false;
  attemptedAt: string;
}

export interface GateRequest {
  url: string;
  method: string;
  resourceType: string;
  /**
   * Whether the request is the top-level frame's navigation. Only those may turn a
   * scan into a `blocked` result; a refused iframe is still blocked, but it is
   * reported as evidence on a page that loaded.
   */
  isMainFrame?: boolean;
}

export type GateDecision = { action: "continue" } | { action: "abort"; block: PolicyBlock };

export interface RequestGateOptions {
  resolver?: Resolver;
  extraBlockedCidrs?: string[];
  allowedProtocols?: Set<string>;
  maxRequests: number;
  maxRedirects: number;
  /** Called for every allowed request so the caller can keep its own domain tally. */
  onAllowed?: (hostname: string) => void;
}

export interface RequestGate {
  inspect(request: GateRequest): Promise<GateDecision>;
  inspectRedirect(fromUrl: string, status: number, location: string | undefined): Promise<PolicyBlock | undefined>;
  readonly blocks: readonly PolicyBlock[];
  readonly documentBlocks: readonly PolicyBlock[];
  readonly limitsReached: ReadonlySet<string>;
  readonly requestCount: number;
}

/**
 * The single decision point for every browser request, including the hops the browser
 * follows on its own after a 3xx response.
 *
 * The Playwright route handler is the only place able to stop a navigation redirect
 * before the request leaves the sandbox: validating the URL after `page.goto()`
 * resolves is too late, because the browser has already spoken to the prohibited host.
 * Everything needing a decision - documents, scripts, images, stylesheets, XHR,
 * websockets, fonts - goes through here, and each refusal is recorded so the caller can
 * report it as a block instead of a generic navigation error.
 */
export function createRequestGate(options: RequestGateOptions): RequestGate {
  const validationOptions = {
    ...(options.resolver ? { resolver: options.resolver } : {}),
    extraBlockedCidrs: options.extraBlockedCidrs ?? [],
    ...(options.allowedProtocols ? { allowedProtocols: options.allowedProtocols } : {}),
  };
  const blocks: PolicyBlock[] = [];
  const limitsReached = new Set<string>();
  let requestCount = 0;
  let documentRequests = 0;
  let redirectHops = 0;

  const record = (
    partial: Omit<PolicyBlock, "responded" | "attemptedAt" | "isMainFrame"> & { isMainFrame?: boolean },
  ): PolicyBlock => {
    // The redirect observer and the route handler can describe the same refused hop.
    // Recording it twice would double-count one block in the evidence.
    const existing = blocks.find(
      (block) => block.url === partial.url && block.resourceType === partial.resourceType && block.cause === partial.cause,
    );
    if (existing) return existing;
    const block: PolicyBlock = { isMainFrame: false, ...partial, responded: false, attemptedAt: new Date().toISOString() };
    blocks.push(block);
    return block;
  };

  async function inspect(request: GateRequest): Promise<GateDecision> {
    requestCount += 1;
    const isMainFrame = request.isMainFrame !== false;
    // Only the top frame's navigation counts against the hop budget: a page with
    // embeds issues several document requests without being a redirect chain.
    const isDocument = request.resourceType === "document" && isMainFrame;

    if (requestCount > options.maxRequests) {
      limitsReached.add("max_requests");
      return {
        action: "abort",
        block: record({
          url: request.url,
          method: request.method,
          resourceType: request.resourceType,
          hostname: hostnameOf(request.url),
          reason: `request budget of ${options.maxRequests} was exhausted`,
          cause: "request_limit",
          viaRedirect: false,
          isMainFrame,
        }),
      };
    }

    if (isDocument) {
      documentRequests += 1;
      // Chromium issues one document request per navigation hop, so the redirect
      // budget is enforced here instead of only being noticed after the fact. The
      // submitted URL is the first hop and is always allowed.
      if (documentRequests > options.maxRedirects + 1) {
        limitsReached.add("max_redirects");
        return {
          action: "abort",
          block: record({
            url: request.url,
            method: request.method,
            resourceType: request.resourceType,
            hostname: hostnameOf(request.url),
            reason: `redirect chain exceeded the configured limit of ${options.maxRedirects}`,
            cause: "redirect_limit",
            viaRedirect: true,
            isMainFrame,
          }),
        };
      }
    }

    let target: URL;
    try {
      target = new URL(request.url);
    } catch {
      // Fail closed: a destination this service cannot parse is a destination it
      // cannot prove is public.
      return {
        action: "abort",
        block: record({
          url: request.url,
          method: request.method,
          resourceType: request.resourceType,
          hostname: "",
          reason: "request URL could not be parsed",
          cause: "unparseable_url",
          viaRedirect: false,
          isMainFrame,
        }),
      };
    }

    const validation = await validateDestination(target, validationOptions);
    if (!validation.allowed) {
      return {
        action: "abort",
        block: record({
          url: request.url,
          method: request.method,
          resourceType: request.resourceType,
          hostname: validation.hostname,
          reason: validation.reason ?? "destination blocked by policy",
          cause: "policy",
          viaRedirect: isDocument && (documentRequests > 1 || redirectHops > 0),
          isMainFrame,
        }),
      };
    }

    options.onAllowed?.(validation.hostname);
    return { action: "continue" };
  }

  /**
   * Evaluate a `Location` header as soon as the redirect response is seen. The route
   * handler still does the enforcing; this records the reason - and the fact that the
   * hop was reached through a redirect - while the response is in hand, so the outcome
   * does not depend on Chromium's wording for the abort that follows.
   */
  async function inspectRedirect(fromUrl: string, status: number, location: string | undefined): Promise<PolicyBlock | undefined> {
    redirectHops += 1;
    if (!location) return undefined;
    const result = await validateRedirectTarget(fromUrl, location, validationOptions);
    if (result.allowed) return undefined;
    return record({
      url: result.targetUrl ?? location,
      method: "GET",
      resourceType: "document",
      hostname: result.hostname,
      reason: `${status} redirect target refused: ${result.reason ?? "destination blocked by policy"}`,
      cause: "policy",
      viaRedirect: true,
      isMainFrame: true,
    });
  }

  return {
    inspect,
    inspectRedirect,
    get blocks() {
      return blocks;
    },
    get documentBlocks() {
      return blocks.filter((block) => block.resourceType === "document" && block.isMainFrame);
    },
    get limitsReached() {
      return limitsReached;
    },
    get requestCount() {
      return requestCount;
    },
  };
}

function hostnameOf(url: string): string {
  try {
    return canonicalHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

export interface NavigationFailureInput {
  error: unknown;
  documentBlocks: readonly PolicyBlock[];
  limitsReached: ReadonlySet<string>;
}

export type NavigationClassification =
  | { kind: "blocked"; terminationReason: string; message: string; block: PolicyBlock }
  | { kind: "limit"; terminationReason: string; message: string; block?: PolicyBlock }
  | { kind: "navigation_timeout"; terminationReason: string; message: string }
  | { kind: "error"; terminationReason: string; message: string };

const NAVIGATION_TIMEOUT_PATTERN = /Timeout \d+ms exceeded|net::ERR_(?:TIMED_OUT|CONNECTION_TIMED_OUT)/i;

/**
 * Turn a rejected `page.goto()` into the right outcome.
 *
 * A policy abort raised inside the route handler surfaces to the caller as
 * `net::ERR_BLOCKED_BY_CLIENT`, which otherwise looks like any other navigation
 * failure. Deciding from the block recorded during interception - not from Chromium's
 * message - is what makes "blocked by policy" report as `blocked` while a refused
 * connection, a DNS failure or a dead socket still report as `error`.
 */
export function classifyNavigationFailure(input: NavigationFailureInput): NavigationClassification {
  const rawMessage =
    input.error instanceof Error
      ? input.error.message
      : typeof input.error === "string" && input.error.length > 0
        ? input.error
        : "navigation failed before the page could be observed";

  const policyBlock = input.documentBlocks.find((block) => block.cause === "policy");
  if (policyBlock) {
    return {
      kind: "blocked",
      terminationReason: policyBlock.viaRedirect ? "redirect_destination_blocked" : "destination_blocked",
      message: `${policyBlock.method} ${policyBlock.url} was blocked by sandbox policy: ${policyBlock.reason}`,
      block: policyBlock,
    };
  }

  const limitBlock = input.documentBlocks.find((block) => block.cause === "request_limit" || block.cause === "redirect_limit");
  if (limitBlock) {
    return {
      kind: "limit",
      terminationReason: limitBlock.cause === "redirect_limit" ? "max_redirects" : "max_requests",
      message: `navigation stopped by a sandbox limit: ${limitBlock.reason}`,
      block: limitBlock,
    };
  }
  if (input.limitsReached.has("max_redirects")) {
    return { kind: "limit", terminationReason: "max_redirects", message: "the redirect limit was reached before the page settled" };
  }
  if (input.limitsReached.has("max_requests")) {
    return { kind: "limit", terminationReason: "max_requests", message: "the request budget was exhausted before the page settled" };
  }
  if (NAVIGATION_TIMEOUT_PATTERN.test(rawMessage)) {
    return { kind: "navigation_timeout", terminationReason: "navigation_timeout", message: rawMessage };
  }
  return { kind: "error", terminationReason: "navigation_failed", message: rawMessage };
}
