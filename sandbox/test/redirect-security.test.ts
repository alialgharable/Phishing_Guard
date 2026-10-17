import http from "node:http";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Resolver } from "../src/network-policy.js";
import { classifyNavigationFailure, createRequestGate, type RequestGate } from "../src/request-gate.js";

/**
 * Deterministic policy-enforcement tests for navigation redirects.
 *
 * The servers here are real and issue real 3xx responses, so the redirect chain, the
 * `Location` handling and the "was the prohibited host actually contacted" assertion
 * are genuine rather than mocked. `browser-sandbox.ts` delegates its route handler to
 * the same gate exercised below; the browser-level proof of that wiring lives in
 * `e2e-redirect-security.test.ts`, which needs a real Chromium.
 */

/** DNS stub: any unused `*.public` name resolves to a public address; the names in the
 *  table encode the prohibited address the test is about. */
const resolver: Resolver = async (hostname) => {
  const table: Record<string, string> = {
    "private.public": "10.0.0.5",
    "loopback.public": "127.0.0.1",
    "metadata.public": "169.254.169.254",
    "v6.public": "::1",
    "ambiguous.public": "not-an-address",
  };
  const address = table[hostname];
  if (address !== undefined) return [{ address, family: address.includes(":") ? 6 : 4 }];
  if (hostname.endsWith(".public")) return [{ address: "93.184.216.34", family: 4 }];
  throw new Error(`test resolver has no record for ${hostname}`);
};

/** A public answer that also contains loopback - the shape of a DNS-rebinding record. */
const rebindingResolver: Resolver = async () => [
  { address: "93.184.216.34", family: 4 },
  { address: "127.0.0.1", family: 4 },
];

const failingResolver: Resolver = async () => {
  throw new Error("dns failure");
};

const servers: http.Server[] = [];
const hitCounts = new Map<string, number>();

async function startServer(name: string, handler: http.RequestListener): Promise<{ port: number }> {
  const server = http.createServer((request, response) => {
    const key = `${name} ${request.url ?? ""}`;
    hitCounts.set(key, (hitCounts.get(key) ?? 0) + 1);
    handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fixture server did not bind a TCP port");
  servers.push(server);
  return { port: address.port };
}

function hits(name: string, path: string): number {
  return hitCounts.get(`${name} ${path}`) ?? 0;
}

function gateFor(overrides: Partial<Parameters<typeof createRequestGate>[0]> = {}): RequestGate {
  return createRequestGate({
    resolver,
    extraBlockedCidrs: [],
    maxRequests: 200,
    maxRedirects: 8,
    ...overrides,
  });
}

/**
 * Fetch `url` through an explicit socket. The fixture listens on loopback while the URL
 * keeps its public hostname, so the policy sees what the browser would see. Only the
 * transport is pointed at the local listener; the validated address is untouched.
 */
function requestThroughSocket(url: string, port: number): Promise<{ status: number; location?: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = http.request(
      {
        host: target.hostname,
        port,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        createConnection: () => net.connect({ host: "127.0.0.1", port }),
      },
      (response) => {
        response.resume();
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            ...(typeof response.headers.location === "string" ? { location: response.headers.location } : {}),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

interface RequestLogEntry {
  url: string;
  outcome: "attempted" | "responded";
  status?: number;
  blockedReason?: string;
}

interface SimulatedNavigation {
  outcome: "loaded" | "blocked";
  requests: RequestLogEntry[];
  finalUrl?: string;
  status?: number;
  blockedUrl?: string;
  blockedReason?: string;
  viaRedirect?: boolean;
}

/**
 * Drive the sequence `browser-sandbox.ts` uses: validate the hop, request it, evaluate
 * the `Location` of a 3xx, validate the next hop. A refused hop stops the walk the way
 * `route.abort()` stops the browser, so the prohibited destination is never contacted.
 */
async function followNavigation(gate: RequestGate, startUrl: string, transportPort: number, maxHops = 12): Promise<SimulatedNavigation> {
  const requests: RequestLogEntry[] = [];
  let currentUrl = startUrl;
  for (let hop = 0; hop < maxHops; hop += 1) {
    const decision = await gate.inspect({ url: currentUrl, method: "GET", resourceType: "document", isMainFrame: true });
    const entry: RequestLogEntry = { url: currentUrl, outcome: "attempted" };
    requests.push(entry);
    if (decision.action === "abort") {
      entry.blockedReason = decision.block.reason;
      return { outcome: "blocked", requests, blockedUrl: decision.block.url, blockedReason: decision.block.reason, viaRedirect: decision.block.viaRedirect };
    }
    const response = await requestThroughSocket(currentUrl, transportPort);
    entry.outcome = "responded";
    entry.status = response.status;
    if (response.status >= 300 && response.status < 400 && response.location !== undefined) {
      // The response observer evaluates the target while the redirect is in hand, then
      // the request policy decides again at the hop itself. Both must agree.
      const redirectBlock = await gate.inspectRedirect(currentUrl, response.status, response.location);
      const nextUrl = new URL(response.location, currentUrl).href;
      const nextDecision = await gate.inspect({ url: nextUrl, method: "GET", resourceType: "document", isMainFrame: true });
      if (redirectBlock !== undefined || nextDecision.action === "abort") {
        const reason = redirectBlock?.reason ?? (nextDecision.action === "abort" ? nextDecision.block.reason : undefined);
        requests.push({ url: nextUrl, outcome: "attempted", ...(reason !== undefined ? { blockedReason: reason } : {}) });
        return {
          outcome: "blocked",
          requests,
          blockedUrl: redirectBlock?.url ?? (nextDecision.action === "abort" ? nextDecision.block.url : nextUrl),
          ...(reason !== undefined ? { blockedReason: reason } : {}),
          viaRedirect: true,
        };
      }
      currentUrl = nextUrl;
      continue;
    }
    return { outcome: "loaded", requests, finalUrl: currentUrl, status: response.status };
  }
  return { outcome: "blocked", requests, blockedReason: "redirect chain exceeded the simulated hop limit" };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  hitCounts.clear();
});

describe("redirect policy enforcement", () => {
  it("blocks a direct navigation to loopback before any request is made", async () => {
    const { port } = await startServer("internal-admin", (_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("admin panel");
    });
    const gate = gateFor();
    const decision = await gate.inspect({ url: `http://127.0.0.1:${port}/admin`, method: "GET", resourceType: "document", isMainFrame: true });
    expect(decision.action).toBe("abort");
    if (decision.action === "abort") {
      expect(decision.block.cause).toBe("policy");
      expect(decision.block.viaRedirect).toBe(false);
      expect(decision.block.responded).toBe(false);
    }
    // The prohibited listener is real and running; nothing ever connected to it.
    expect(hits("internal-admin", "/admin")).toBe(0);
  });

  it.each([
    ["loopback by address", "http://127.0.0.1/secret"],
    ["loopback by name", "http://localhost:8080/secret"],
    ["private space", "http://10.0.0.1/secret"],
    ["docker bridge", "http://172.17.0.2:2375/secret"],
    ["link-local metadata", "http://169.254.169.254/latest/meta-data/"],
    ["IPv6 loopback", "http://[::1]/secret"],
    ["unique-local address", "http://[fc00::1]/secret"],
    ["name resolving to loopback", "http://loopback.public/secret"],
    ["name resolving to private space", "http://private.public/secret"],
    ["obfuscated decimal loopback", "http://2130706433/secret"],
  ])("blocks a public page that redirects to %s", async (_label, location) => {
    const redirector = await startServer("public-redirector", (_request, response) => {
      response.writeHead(302, { location });
      response.end();
    });
    const gate = gateFor();
    const navigation = await followNavigation(gate, "http://start.public/landing", redirector.port);
    expect(navigation.outcome).toBe("blocked");
    expect(navigation.viaRedirect).toBe(true);
    expect(navigation.blockedReason).toMatch(/refused|blocked|loopback|private|reserved|link-local/i);
    // The redirector answered; the hop it pointed at did not.
    expect(navigation.requests[0]?.outcome).toBe("responded");
    expect(navigation.requests.at(-1)?.outcome).toBe("attempted");
  });

  it("never receives a successful response from the prohibited destination", async () => {
    const internal = await startServer("internal-service", (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"session":"leaked"}');
    });
    const publicPage = await startServer("public-page", (_request, response) => {
      response.writeHead(302, { location: `http://127.0.0.1:${internal.port}/credentials` });
      response.end();
    });
    const gate = gateFor();
    const navigation = await followNavigation(gate, "http://page.public/offer", publicPage.port);
    expect(navigation.outcome).toBe("blocked");
    expect(navigation.blockedUrl).toBe(`http://127.0.0.1:${internal.port}/credentials`);
    expect(hits("internal-service", "/credentials")).toBe(0);
    expect(hits("public-page", "/offer")).toBe(1);
  });

  it("still follows a legitimate public-to-public redirect and loads the page", async () => {
    const { port } = await startServer("public-site", (request, response) => {
      if ((request.url ?? "").startsWith("/offer")) {
        response.writeHead(302, { location: "http://cdn.public/landing.html" });
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html><body>ok</body></html>");
    });
    const gate = gateFor();
    const navigation = await followNavigation(gate, "http://shop.public/offer", port);
    expect(navigation.outcome).toBe("loaded");
    expect(navigation.finalUrl).toBe("http://cdn.public/landing.html");
    expect(navigation.status).toBe(200);
    expect(navigation.requests.map((entry) => entry.outcome)).toEqual(["responded", "responded"]);
    expect(gate.documentBlocks).toHaveLength(0);
    expect(gate.limitsReached.size).toBe(0);
  });

  it("applies the same policy to every resource type, not only to documents", async () => {
    const gate = gateFor();
    const prohibited = [
      "http://169.254.169.254/latest/meta-data",
      "http://127.0.0.1:6379/",
      "http://localhost/pixel.png",
      "ws://10.0.0.9:8080/socket",
      "http://192.168.0.1/config.xml",
    ];
    for (const url of prohibited) {
      for (const resourceType of ["script", "image", "stylesheet", "fetch", "xhr", "websocket", "font", "media"]) {
        const decision = await gate.inspect({ url, method: "GET", resourceType, isMainFrame: false });
        expect(decision.action, `${url} as ${resourceType}`).toBe("abort");
      }
    }
    // Refused subresources are evidence, never the verdict of the navigation.
    expect(gate.documentBlocks).toHaveLength(0);
    expect(gate.blocks.length).toBeGreaterThan(0);
  });

  it("stops a redirect chain that exceeds the configured hop budget", async () => {
    const gate = gateFor({ maxRedirects: 2 });
    for (let hop = 0; hop < 5; hop += 1) {
      const decision = await gate.inspect({ url: `http://hop${hop}.public/`, method: "GET", resourceType: "document", isMainFrame: true });
      expect(decision.action, `hop ${hop}`).toBe(hop <= 2 ? "continue" : "abort");
    }
    expect(gate.limitsReached.has("max_redirects")).toBe(true);
    const classification = classifyNavigationFailure({
      error: new Error("page.goto: net::ERR_BLOCKED_BY_CLIENT at http://hop3.public/"),
      documentBlocks: gate.documentBlocks,
      limitsReached: gate.limitsReached,
    });
    // A budget hit is an operational outcome, not a security block.
    expect(classification.kind).toBe("limit");
    expect(classification.terminationReason).toBe("max_redirects");
  });

  it("enforces the request budget without mislabelling it as a policy block", async () => {
    const gate = gateFor({ maxRequests: 3 });
    for (const url of ["http://sub0.public/a.js", "http://sub1.public/a.js", "http://sub2.public/a.js"]) {
      await expect(gate.inspect({ url, method: "GET", resourceType: "script", isMainFrame: false })).resolves.toMatchObject({ action: "continue" });
    }
    const overflow = await gate.inspect({ url: "http://sub3.public/a.js", method: "GET", resourceType: "script", isMainFrame: false });
    expect(overflow.action).toBe("abort");
    if (overflow.action === "abort") expect(overflow.block.cause).toBe("request_limit");
    expect(gate.limitsReached.has("max_requests")).toBe(true);
  });

  it("keeps a subresource block from rewriting the reason of a finished scan", async () => {
    const gate = gateFor();
    await gate.inspect({ url: "http://page.public/", method: "GET", resourceType: "document", isMainFrame: true });
    await gate.inspect({ url: "http://169.254.169.254/tracker.js", method: "GET", resourceType: "script", isMainFrame: false });
    expect(gate.documentBlocks).toHaveLength(0);
    const outcome = classifyNavigationFailure({
      // The main document loaded, so no navigation error reaches the classifier; if an
      // unrelated request later failed, it must read as a failure and not as a block.
      error: new Error("net::ERR_CONNECTION_RESET"),
      documentBlocks: gate.documentBlocks,
      limitsReached: gate.limitsReached,
    });
    expect(outcome.kind).toBe("error");
  });
});

describe("fail-closed destinations", () => {
  it("blocks a hostname whose DNS answer also contains a loopback address", async () => {
    const gate = gateFor({ resolver: rebindingResolver });
    const decision = await gate.inspect({ url: "http://rebind.public/", method: "GET", resourceType: "document", isMainFrame: true });
    expect(decision.action).toBe("abort");
    expect(gate.documentBlocks[0]?.reason).toMatch(/loopback|blocked|private/i);
  });

  it("blocks the destination when DNS fails or answers with an address it cannot evaluate", async () => {
    await expect(gateFor({ resolver: failingResolver }).inspect({ url: "http://no-record.public/", method: "GET", resourceType: "document" })).resolves.toMatchObject({ action: "abort" });
    await expect(gateFor().inspect({ url: "http://ambiguous.public/", method: "GET", resourceType: "document" })).resolves.toMatchObject({ action: "abort", block: { cause: "policy" } });
  });

  it.each([
    ["obfuscated decimal loopback", "http://2130706433/"],
    ["obfuscated hex loopback", "http://0x7f000001/"],
    ["unparseable URL", "http://[::1"],
    ["file scheme", "file:///etc/passwd"],
    ["gopher scheme", "gopher://127.0.0.1:4000/"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="],
  ])("blocks %s (%s)", async (_label, url) => {
    const decision = await gateFor().inspect({ url, method: "GET", resourceType: "document", isMainFrame: true });
    expect(decision.action).toBe("abort");
  });

  it.each([
    ["an absolute loopback URL", "http://127.0.0.1/admin"],
    ["a protocol-relative loopback URL", "//127.0.0.1/admin"],
    ["an obfuscated loopback form", "http://0x7f000001/admin"],
    ["a cloud metadata endpoint", "http://[fd00:ec2::254]/latest/meta-data"],
    ["a non-http scheme", "file:///etc/passwd"],
    ["an unparseable value", "http://[::1"],
  ])("refuses a Location header that is %s", async (_label, location) => {
    const block = await gateFor().inspectRedirect("http://page.public/redirect", 302, location);
    expect(block).toBeDefined();
    expect(block?.viaRedirect).toBe(true);
    expect(block?.isMainFrame).toBe(true);
    expect(block?.responded).toBe(false);
    expect(block?.reason).toMatch(/redirect target refused/);
  });

  it("records one block per refused hop even when two observers describe it", async () => {
    const gate = gateFor();
    const first = await gate.inspectRedirect("http://page.public/redirect", 302, "http://127.0.0.1/admin");
    const second = await gate.inspectRedirect("http://page.public/redirect", 301, "http://127.0.0.1/admin");
    expect(second).toBe(first);
    expect(gate.blocks).toHaveLength(1);
  });

  it("allows a well-formed public Location and records nothing", async () => {
    await expect(gateFor().inspectRedirect("http://page.public/redirect", 302, "https://cdn.public/next")).resolves.toBeUndefined();
    expect(gateFor().blocks).toHaveLength(0);
  });
});

describe("navigation outcome classification", () => {
  it("reports a policy-aborted redirect as blocked, not as an error", async () => {
    const gate = gateFor();
    await gate.inspect({ url: "http://start.public/", method: "GET", resourceType: "document", isMainFrame: true });
    await gate.inspectRedirect("http://start.public/", 302, "http://127.0.0.1/admin");
    const outcome = classifyNavigationFailure({
      error: new Error("page.goto: net::ERR_BLOCKED_BY_CLIENT at http://127.0.0.1/admin"),
      documentBlocks: gate.documentBlocks,
      limitsReached: gate.limitsReached,
    });
    expect(outcome.kind).toBe("blocked");
    expect(outcome.terminationReason).toBe("redirect_destination_blocked");
    expect(outcome.message).toContain("http://127.0.0.1/admin");
    if (outcome.kind === "blocked") {
      expect(outcome.block.viaRedirect).toBe(true);
      expect(outcome.block.reason).toMatch(/redirect target refused/);
    }
  });

  it("uses a distinct reason for a directly blocked submitted URL", async () => {
    const gate = gateFor();
    await gate.inspect({ url: "http://127.0.0.1/admin", method: "GET", resourceType: "document", isMainFrame: true });
    const outcome = classifyNavigationFailure({
      error: new Error("page.goto: net::ERR_BLOCKED_BY_CLIENT at http://127.0.0.1/admin"),
      documentBlocks: gate.documentBlocks,
      limitsReached: gate.limitsReached,
    });
    expect(outcome.kind).toBe("blocked");
    expect(outcome.terminationReason).toBe("destination_blocked");
  });

  it.each([
    "page.goto: net::ERR_CONNECTION_REFUSED at http://shop.public/",
    "page.goto: net::ERR_NAME_NOT_RESOLVED at http://gone.public/",
    "page.goto: net::ERR_EMPTY_RESPONSE at http://shop.public/",
    "page.goto: net::ERR_CERT_AUTHORITY_INVALID at https://shop.public/",
    "page.goto: net::ERR_CONNECTION_RESET at http://shop.public/",
  ])("keeps the genuine failure %s an error", async (message) => {
    const gate = gateFor();
    const outcome = classifyNavigationFailure({ error: new Error(message), documentBlocks: gate.documentBlocks, limitsReached: gate.limitsReached });
    expect(outcome.kind).toBe("error");
    expect(outcome.terminationReason).toBe("navigation_failed");
    expect(outcome.message).toBe(message);
  });

  it("reports a slow navigation as a timeout without inventing a cause", () => {
    const outcome = classifyNavigationFailure({
      error: new Error("page.goto: Timeout 15000ms exceeded."),
      documentBlocks: [],
      limitsReached: new Set<string>(),
    });
    expect(outcome.kind).toBe("navigation_timeout");
    expect(outcome.terminationReason).toBe("navigation_timeout");
  });

  it("does not claim a policy block just because Chromium said ERR_BLOCKED_BY_CLIENT", () => {
    // Nothing was recorded by this service: some other component refused the request,
    // and that must not be dressed up as a sandbox security verdict.
    const outcome = classifyNavigationFailure({
      error: new Error("page.goto: net::ERR_BLOCKED_BY_CLIENT at http://shop.public/"),
      documentBlocks: [],
      limitsReached: new Set<string>(),
    });
    expect(outcome.kind).toBe("error");
    expect(outcome.message).toContain("ERR_BLOCKED_BY_CLIENT");
  });

  it("maps each classification onto the result fields the API exposes", async () => {
    const gate = gateFor();
    await gate.inspect({ url: "http://start.public/", method: "GET", resourceType: "document", isMainFrame: true });
    await gate.inspect({ url: "http://page.public/pixel.png", method: "GET", resourceType: "image", isMainFrame: false });
    const cases: Array<[unknown, string, string]> = [
      [new Error("net::ERR_BLOCKED_BY_CLIENT at http://127.0.0.1/x"), "error", "navigation_failed"],
      [new Error("page.goto: Timeout 15000ms exceeded."), "error", "navigation_timeout"],
      [new Error("net::ERR_CONNECTION_CLOSED"), "error", "navigation_failed"],
    ];
    for (const [error, status, terminationReason] of cases) {
      const outcome = classifyNavigationFailure({ error, documentBlocks: gate.documentBlocks, limitsReached: gate.limitsReached });
      expect(outcome.kind === "blocked" ? "blocked" : status, String(error)).toBe(status);
      expect(outcome.terminationReason).toBe(terminationReason);
      // Genuine failures keep the browser's own diagnostic instead of a policy sentence.
      expect(outcome.message).toContain(String((error as Error).message).slice(-12));
    }
  });

  it("treats a refused iframe navigation as evidence, not as the scan verdict", async () => {
    const gate = gateFor();
    const decision = await gate.inspect({ url: "http://127.0.0.1/frame", method: "GET", resourceType: "document", isMainFrame: false });
    expect(decision.action).toBe("abort");
    expect(gate.documentBlocks).toHaveLength(0);
    expect(gate.blocks[0]?.isMainFrame).toBe(false);
  });

  it("keeps the reason and the blocked URL together in every recorded block", async () => {
    const gate = gateFor();
    await gate.inspect({ url: "http://metadata.public/latest/meta-data", method: "GET", resourceType: "document", isMainFrame: true });
    const block = gate.blocks[0];
    expect(block?.url).toBe("http://metadata.public/latest/meta-data");
    expect(block?.hostname).toBe("metadata.public");
    expect(block?.reason && block.reason.length > 0).toBe(true);
    expect(block?.attemptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

