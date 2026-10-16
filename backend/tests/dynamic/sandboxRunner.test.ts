import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSandboxArgs,
  parseSandboxOutput,
  requireRecentSelfTest,
  runInSandbox,
  SandboxUnavailableError,
  validateSandboxUrl,
} from "../../src/services/dynamic/runInSandbox";

describe("sandbox runner safety", () => {
  it("requires explicit enablement", async () => {
    await expect(
      validateSandboxUrl("https://example.com"),
    ).resolves.toBeUndefined();
    expect(new SandboxUnavailableError("x").code).toBe(
      "DYNAMIC_ANALYSIS_UNAVAILABLE",
    );
  });

  it("constructs hardened arguments without a shell command", () => {
    const args = buildSandboxArgs(
      "https://example.com",
      { submitCanary: false },
      {
        image: "pg:test",
        runtime: "runsc",
        network: "pg-sandbox",
        seccompProfile: "profile.json",
      },
    );
    expect(args).toEqual(
      expect.arrayContaining([
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt",
        "no-new-privileges",
        "--tmpfs",
        "/profile:rw,size=128m",
        "--runtime=runsc",
        "--security-opt",
        "seccomp=profile.json",
      ]),
    );
    expect(args).toContain("pg:test");
  });

  it("defaults to the isolated sandbox network", () => {
    const args = buildSandboxArgs(
      "https://example.com",
      { submitCanary: false },
      { image: "pg:test", runtime: "runsc" },
    );

    expect(args).toContain("--network=pg-sandbox-isolated");
  });

  it("rejects unsupported and credential-bearing URLs", async () => {
    await expect(validateSandboxUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(
      validateSandboxUrl("https://user:pass@example.com"),
    ).rejects.toThrow();
  });

  it("requires a recent successful self-test marker", async () => {
    const directory = await mkdtemp(join(tmpdir(), "phishguard-sandbox-"));
    const marker = join(directory, "selftest.json");
    await expect(requireRecentSelfTest(marker)).rejects.toThrow("self-test");
    await writeFile(
      marker,
      JSON.stringify({ ok: true, passedAt: new Date().toISOString() }),
    );
    await expect(requireRecentSelfTest(marker)).resolves.toBeUndefined();
    await writeFile(
      marker,
      JSON.stringify({
        ok: true,
        passedAt: new Date(Date.now() - 3_600_000).toISOString(),
      }),
    );
    await expect(requireRecentSelfTest(marker, 1000)).rejects.toThrow(
      "self-test",
    );
  });

  it("fails closed from the public runner when disabled or unready", async () => {
    await expect(runInSandbox("https://example.com")).rejects.toThrow(
      "disabled",
    );
    await expect(
      runInSandbox(
        "https://example.com",
        {},
        {
          enabled: true,
          hostValidator: async () => true,
          selfTestMarker: "missing-selftest.json",
        },
      ),
    ).rejects.toThrow("self-test");
  });

  it("fails closed on malformed container JSON", () => {
    expect(() => parseSandboxOutput("not-json")).toThrow(
      SandboxUnavailableError,
    );
  });

  it("keeps the detonator free of credential-entry and submit calls", async () => {
    const source = await readFile("src/services/dynamic/detonator.ts", "utf8");
    expect(source).not.toMatch(/\.(fill|type|press|check|click)\s*\(/);
    expect(source).not.toMatch(/(?:form|document)\.submit\s*\(/);
  });
});
