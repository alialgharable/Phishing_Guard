import { afterEach, describe, expect, it, vi } from "vitest";

const { runInSandbox } = vi.hoisted(() => ({
  runInSandbox: vi.fn(),
}));

vi.mock("../runInSandbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../runInSandbox")>();
  return { ...actual, runInSandbox };
});

import { ConnectedSandboxAnalyzer } from "../connectedSandboxAnalyzer";
import { SandboxUnavailableError } from "../runInSandbox";

describe("ConnectedSandboxAnalyzer", () => {
  afterEach(() => vi.clearAllMocks());

  it("maps a successful browser result to the scan contract", async () => {
    runInSandbox.mockResolvedValue({
      inputUrl: "https://example.com",
      landingUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      title: "Example",
      html: "<html></html>",
      screenshot: null,
      faviconUrl: null,
      faviconBytes: null,
      redirectChain: ["https://example.com/"],
      requests: [
        {
          url: "https://example.com/",
          method: "GET",
          resourceType: "document",
          postData: null,
          t: 1,
          frameUrl: "https://example.com/",
        },
      ],
      apiEvents: [
        { api: "dialog", t: 1, gesture: false, stack: "" },
      ],
      downloads: [
        {
          suggestedName: "sample.bin",
          sha256: "abc123",
          bytes: 42,
        },
      ],
      scripts: [],
      forms: [],
      typing: null,
      bitb: false,
      submitted: false,
      postSubmit: null,
      blockedRequests: [],
      errors: [],
      durationMs: 100,
    });

    const result = await new ConnectedSandboxAnalyzer().analyze(
      "https://example.com/",
    );

    expect(result.status).toBe("available");
    expect(result.finalUrl).toBe("https://example.com/");
    expect(result.domainsContacted).toEqual(["example.com"]);
    expect(result.networkRequests).toEqual(["GET https://example.com/"]);
    expect(result.downloads[0]).toContain("sample.bin");
    expect(result.behaviorObservations).toContain("Browser event: dialog");
  });

  it("reports unavailable when the runner refuses to start", async () => {
    runInSandbox.mockRejectedValue(
      new SandboxUnavailableError("Dynamic analysis is disabled by configuration."),
    );

    const result = await new ConnectedSandboxAnalyzer().analyze(
      "https://example.com/",
    );

    expect(result.status).toBe("unavailable");
    expect(result.reason).toContain("disabled");
    expect(result.networkRequests).toEqual([]);
  });

  it("reports unexpected runner failures without throwing", async () => {
    runInSandbox.mockRejectedValue(new Error("unexpected failure"));

    const result = await new ConnectedSandboxAnalyzer().analyze(
      "https://example.com/",
    );

    expect(result.status).toBe("error");
    expect(result.reason).toBe("unexpected failure");
  });
});
