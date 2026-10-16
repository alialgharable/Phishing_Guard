import { describe, expect, it } from "vitest";
import { hostsDiffer, isBlockedAddress, isParsableAddress, validateDestination, type Resolver } from "../src/network-policy.js";
import { validateRedirectTarget } from "../src/redirect-policy.js";

const resolver: Resolver = async (hostname) => {
  const table: Record<string, string> = {
    "example.com": "93.184.216.34",
    "public.test": "93.184.216.34",
    "next.test": "93.184.216.35",
    "private.test": "10.0.0.5",
    "metadata.test": "169.254.169.254",
  };
  const address = table[hostname] ?? hostname;
  return [{ address, family: address.includes(":") ? 6 : 4 }];
};

describe("destination validation", () => {
  it.each([
    "https://example.com",
    "http://example.com",
  ])("allows public HTTP(S) URL %s", async (url) => {
    await expect(validateDestination(new URL(url), { resolver })).resolves.toMatchObject({ allowed: true });
  });

  it.each([
    "http://127.0.0.1",
    "http://localhost",
    "http://192.168.1.1",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "http://169.254.169.254",
    "http://[::1]",
    "http://[fc00::1]",
  ])("blocks private/internal URL %s", async (url) => {
    await expect(validateDestination(new URL(url), { resolver })).resolves.toMatchObject({ allowed: false });
  });

  it("applies the same policy to subresource-style request URLs", async () => {
    await expect(validateDestination(new URL("https://example.com/script.js"), { resolver })).resolves.toMatchObject({ allowed: true });
    await expect(validateDestination(new URL("http://169.254.169.254/latest/meta-data"), { resolver })).resolves.toMatchObject({ allowed: false });
    await expect(validateDestination(new URL("http://localhost/pixel.png"), { resolver })).resolves.toMatchObject({ allowed: false });
  });
});

describe("redirect validation", () => {
  it("allows public to public redirects", async () => {
    await expect(validateRedirectTarget("https://public.test", "https://next.test/path", { resolver })).resolves.toMatchObject({ allowed: true });
  });

  it.each([
    ["private", "http://private.test/admin"],
    ["localhost", "http://localhost:8080"],
    ["metadata", "http://metadata.test/latest/meta-data"],
  ])("blocks public to %s redirects", async (_name, location) => {
    await expect(validateRedirectTarget("https://public.test", location, { resolver })).resolves.toMatchObject({ allowed: false });
  });
});

const publicResolver: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];

describe("host canonicalization", () => {
  it("blocks localhost written with a root label dot", async () => {
    // Regression: "localhost." is the same DNS name as "localhost" but did not match
    // the name rule, so the block depended on DNS refusing to resolve it.
    await expect(validateDestination(new URL("http://localhost./"), { resolver: publicResolver })).resolves.toMatchObject({
      allowed: false,
      reason: "localhost is blocked",
      hostname: "localhost",
    });
    await expect(validateDestination(new URL("http://LOCALHOST.:8080/x"), { resolver: publicResolver })).resolves.toMatchObject({ allowed: false });
    await expect(validateDestination(new URL("http://api.localhost./"), { resolver: publicResolver })).resolves.toMatchObject({ allowed: false });
  });

  it("reports the canonical host for an otherwise public dotted domain", async () => {
    await expect(validateDestination(new URL("https://example.com./path"), { resolver })).resolves.toMatchObject({
      allowed: true,
      hostname: "example.com",
    });
  });

  it("treats bracketed IPv6 forms consistently", async () => {
    await expect(validateDestination(new URL("http://[::1]/"), { resolver })).resolves.toMatchObject({ allowed: false });
    await expect(validateDestination(new URL("http://[0:0:0:0:0:0:0:1]/"), { resolver })).resolves.toMatchObject({ allowed: false });
    await expect(validateDestination(new URL("http://[::ffff:7f00:1]/"), { resolver })).resolves.toMatchObject({ allowed: false });
  });
});

describe("reserved internal names", () => {
  it.each([
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://metadata.google.INTERNAL./x",
    "http://host.docker.internal:2375/",
    "http://printer.local./",
    "http://a.in-addr.arpa/",
  ])("blocks %s before any resolver is consulted", async (url) => {
    const result = await validateDestination(new URL(url), { resolver: publicResolver });
    expect(result.allowed).toBe(false);
    expect(result.addresses).toEqual([]);
  });

  it("does not treat a public domain that merely contains such a label as internal", async () => {
    await expect(validateDestination(new URL("http://not.internal.example.com./"), { resolver: publicResolver })).resolves.toMatchObject({ allowed: true });
  });
});

describe("fail-closed address evaluation", () => {
  it.each(["0177.0.0.1", "127.0.0.1.", "[::1]", "2130706433", "", "not-an-ip"])(
    "blocks the address form %s that cannot be evaluated against the policy",
    async (address) => {
      const resolverReturning: Resolver = async () => [{ address: address as never, family: 4 }];
      const result = await validateDestination(new URL("http://public.test/"), { resolver: resolverReturning });
      expect(result.allowed).toBe(false);
    },
  );

  it("does not report an unparseable address as allowed", () => {
    expect(isParsableAddress("127.0.0.1")).toBe(true);
    expect(isParsableAddress("0177.0.0.1")).toBe(false);
    expect(isBlockedAddress("0177.0.0.1")).toBe(true);
    expect(isBlockedAddress("127.0.0.1.")).toBe(true);
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
  });
});

describe("host comparison for behavioral evidence", () => {
  it("does not invent a domain change for equivalent spellings", () => {
    expect(hostsDiffer("example.com.", "example.com")).toBe(false);
    expect(hostsDiffer("EXAMPLE.COM", "example.com.")).toBe(false);
    expect(hostsDiffer("[::1]", "::1.")).toBe(false);
  });

  it("does not claim a domain change when one side has no host", () => {
    expect(hostsDiffer("example.com", "")).toBe(false);
    expect(hostsDiffer("example.com", undefined)).toBe(false);
  });

  it("reports a real cross-host navigation", () => {
    expect(hostsDiffer("a.test", "b.test")).toBe(true);
    expect(hostsDiffer("a.test", "sub.a.test")).toBe(true);
  });
});
