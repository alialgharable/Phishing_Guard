// runInSandbox.ts — runs on the HOST.
// The host never touches the suspicious URL itself; it only spawns a container.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { isAllowedHost } from "./util";
import type { DetonationOptions, DetonationResult } from "./types";

export interface SandboxConfig {
  image?: string;
  runtime?: string;
  network?: string;
  timeoutMs?: number;
  enabled?: boolean;
  seccompProfile?: string;
  selfTestMarker?: string;
  selfTestMaxAgeMs?: number;
  hostValidator?: (host: string) => Promise<boolean>;
}

export class SandboxUnavailableError extends Error {
  public readonly code = "DYNAMIC_ANALYSIS_UNAVAILABLE";
}

export interface SandboxSelfTestMarker {
  ok: true;
  passedAt: string;
}

export async function requireRecentSelfTest(
  markerPath = process.env["PHISHGUARD_SANDBOX_SELFTEST_MARKER"] ??
    "sandbox/selftest-pass.json",
  maxAgeMs = Number(
    process.env["PHISHGUARD_SANDBOX_SELFTEST_MAX_AGE_MS"] ?? 900_000,
  ),
): Promise<void> {
  try {
    const marker = JSON.parse(
      await fs.readFile(markerPath, "utf8"),
    ) as Partial<SandboxSelfTestMarker>;
    const passedAt = Date.parse(marker.passedAt ?? "");
    if (
      marker.ok !== true ||
      !Number.isFinite(passedAt) ||
      passedAt > Date.now() ||
      Date.now() - passedAt > maxAgeMs
    )
      throw new Error("stale self-test");
  } catch {
    throw new SandboxUnavailableError(
      "Sandbox self-test has not passed recently.",
    );
  }
}

export function parseSandboxOutput(output: string): DetonationResult {
  try {
    const payload = JSON.parse(output) as DetonationResult & {
      screenshot?: string | null;
      faviconBytes?: string | null;
    };
    return {
      ...payload,
      screenshot: payload.screenshot
        ? Buffer.from(payload.screenshot, "base64")
        : null,
      faviconBytes: payload.faviconBytes
        ? Buffer.from(payload.faviconBytes, "base64")
        : null,
    };
  } catch (error) {
    throw new SandboxUnavailableError(
      `Sandbox returned invalid JSON: ${String(error)}`,
    );
  }
}

export async function validateSandboxUrl(
  url: string,
  hostValidator = isAllowedHost,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SandboxUnavailableError("Dynamic URL is malformed.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new SandboxUnavailableError(
      "Dynamic analysis only accepts HTTP and HTTPS URLs.",
    );
  if (parsed.username || parsed.password)
    throw new SandboxUnavailableError(
      "Dynamic analysis rejects credential-bearing URLs.",
    );
  if (!(await hostValidator(parsed.hostname))) {
    throw new SandboxUnavailableError(
      "Dynamic destination failed the SSRF/DNS safety check.",
    );
  }
}

export function buildSandboxArgs(
  url: string,
  opts: DetonationOptions,
  cfg: SandboxConfig,
): string[] {
  const args = [
    "run",
    "--rm",
    "--name",
    `pg-${randomBytes(6).toString("hex")}`,
    ...(cfg.runtime ? [`--runtime=${cfg.runtime}`] : []),
    `--network=${cfg.network ?? "pg-sandbox-isolated"}`,
    "--read-only",
    "--tmpfs",
    "/tmp:rw,size=256m",
    "--tmpfs",
    "/profile:rw,size=128m",
    "--cap-drop=ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "256",
    "--memory",
    "1g",
    "--cpus",
    "1",
    ...(cfg.seccompProfile
      ? ["--security-opt", `seccomp=${cfg.seccompProfile}`]
      : []),
    "-e",
    "PG_IN_SANDBOX=1",
    cfg.image!,
    url,
    JSON.stringify({ ...opts, submitCanary: false }),
  ];
  return args;
}

export function runInSandbox(
  url: string,
  opts: DetonationOptions = {},
  cfg: SandboxConfig = {},
): Promise<DetonationResult> {
  if (
    cfg.enabled !== true &&
    process.env["PHISHGUARD_DYNAMIC_ENABLED"] !== "1"
  ) {
    return Promise.reject(
      new SandboxUnavailableError(
        "Dynamic analysis is disabled by configuration.",
      ),
    );
  }
  const {
    image = process.env["PHISHGUARD_SANDBOX_IMAGE"] ?? "phishguard-sandbox",
    runtime = process.env["PHISHGUARD_SANDBOX_RUNTIME"] ?? "runsc",
    network = process.env["PHISHGUARD_SANDBOX_NETWORK"] ??
      "pg-sandbox-isolated",
    timeoutMs = 120_000,
    enabled = cfg.enabled,
    seccompProfile = process.env["PHISHGUARD_SECCOMP_PROFILE"],
    selfTestMarker = process.env["PHISHGUARD_SANDBOX_SELFTEST_MARKER"] ??
      "sandbox/selftest-pass.json",
    selfTestMaxAgeMs = Number(
      process.env["PHISHGUARD_SANDBOX_SELFTEST_MAX_AGE_MS"] ?? 900_000,
    ),
    hostValidator = isAllowedHost,
  } = cfg;
  void enabled;
  const args = buildSandboxArgs(url, opts, {
    image,
    runtime,
    network,
    timeoutMs,
    enabled,
    seccompProfile,
  });
  const name = args[3];

  return requireRecentSelfTest(selfTestMarker, selfTestMaxAgeMs)
    .then(() => validateSandboxUrl(url, hostValidator))
    .then(
      () =>
        new Promise((resolve, reject) => {
          const child = spawn("docker", args, { windowsHide: true });
          let output = "";
          let errorOutput = "";
          const timer = setTimeout(() => {
            spawn("docker", ["kill", name], { windowsHide: true });
            reject(new SandboxUnavailableError("Sandbox timeout."));
          }, timeoutMs);
          child.on("error", (error) => {
            clearTimeout(timer);
            reject(
              new SandboxUnavailableError(
                `Sandbox runtime unavailable: ${error.message}`,
              ),
            );
          });
          child.stdout.on("data", (data: Buffer) => {
            output += data;
          });
          child.stderr.on("data", (data: Buffer) => {
            errorOutput += data;
          });
          child.on("close", (code) => {
            clearTimeout(timer);
            if (code !== 0) {
              reject(
                new SandboxUnavailableError(
                  `Sandbox exited with code ${code}: ${errorOutput.slice(0, 300)}`,
                ),
              );
              return;
            }
            try {
              resolve(parseSandboxOutput(output));
            } catch (error) {
              reject(error);
            }
          });
        }),
    );
}
