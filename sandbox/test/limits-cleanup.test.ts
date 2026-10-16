import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { runWithCleanup } from "../src/cleanup.js";

describe("limits and cleanup", () => {
  it("loads strict positive resource limits", () => {
    const config = loadConfig();
    expect(config.navigationTimeoutMs).toBeGreaterThan(0);
    expect(config.overallTimeoutMs).toBeGreaterThan(0);
    expect(config.maxRedirects).toBeGreaterThan(0);
    expect(config.maxRequests).toBeGreaterThan(0);
    expect(config.maxDownloadBytes).toBeGreaterThan(0);
    expect(config.maxScreenshotBytes).toBeGreaterThan(0);
    expect(config.maxResponseBodyBytes).toBeGreaterThan(0);
  });

  it.each([
    ["success", async () => "ok"],
    ["timeout", async () => { throw new Error("timeout"); }],
    ["navigation failure", async () => { throw new Error("navigation failed"); }],
    ["exception", async () => { throw new Error("unexpected"); }],
  ])("runs cleanup after %s", async (_name, operation) => {
    let cleaned = false;
    try {
      await runWithCleanup(operation, async () => { cleaned = true; });
    } catch {
      // expected for failure cases
    }
    expect(cleaned).toBe(true);
  });
});
