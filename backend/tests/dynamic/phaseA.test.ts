import { describe, expect, it } from "vitest";
import { generateCanary, findCanary } from "../../src/services/dynamic/canary";
import { behaviorEvidence } from "../../src/services/dynamic/behaviorEvidence";
import { isPrivateIp, registrableOfUrl } from "../../src/services/dynamic/util";
import type { DetonationResult } from "../../src/services/dynamic/types";

const base = (overrides: Partial<DetonationResult> = {}): DetonationResult => ({
  inputUrl: "https://shop.example.com/login",
  landingUrl: "https://shop.example.com/login",
  finalUrl: "https://shop.example.com/login",
  title: "",
  html: "",
  screenshot: null,
  faviconUrl: null,
  faviconBytes: null,
  redirectChain: [],
  requests: [],
  apiEvents: [],
  downloads: [],
  scripts: [],
  forms: [],
  typing: null,
  bitb: false,
  submitted: false,
  postSubmit: null,
  blockedRequests: [],
  errors: [],
  durationMs: 0,
  ...overrides,
});

describe("dynamic phase A passive primitives", () => {
  it("generates unique canaries without sending them", () => {
    expect(generateCanary().password).not.toBe(generateCanary().password);
  });

  it("finds encoded canary values in captured request text", () => {
    const canary = generateCanary();
    expect(
      findCanary(`e=${encodeURIComponent(canary.email)}`, canary)[0].encoding,
    ).toBe("url");
  });

  it("blocks private and metadata addresses", () => {
    for (const ip of [
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "192.168.1.5",
      "::1",
      "fd00::1",
    ])
      expect(isPrivateIp(ip)).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });

  it("computes registrable domains", () => {
    expect(registrableOfUrl("https://a.b.example.co.uk/x")).toBe(
      "example.co.uk",
    );
  });

  it("records passive behavior without requiring a form submission", () => {
    const evidence = behaviorEvidence(
      base({
        apiEvents: [{ api: "geolocation", t: 1, gesture: false, stack: "" }],
      }),
      null,
    );
    expect(evidence.map((item) => item.id)).toContain("beh.geolocation");
  });
});
