import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import type { SandboxConfig } from "./config.js";
import { isBlockedAddress } from "./network-policy.js";

export interface BrowserDiagnostic {
  ok: boolean;
  browser: "chromium";
  version?: string;
  error?: string;
}

export interface ReadyDiagnostic {
  status: "ok" | "error";
  browser: BrowserDiagnostic;
  configuration: { ok: boolean; errors: string[] };
  directories: { ok: boolean; artifactDir: string; error?: string };
  networkPolicy: { ok: boolean; error?: string };
  sandbox: "ready" | "not_ready";
}

export function chromiumLaunchArgs(): string[] {
  return [
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-notifications",
    "--disable-features=Translate,MediaRouter,AutofillServerCommunication,OptimizationHints",
    "--no-first-run",
    "--no-default-browser-check",
    // Docker supplies the primary isolation boundary in this milestone. The
    // Playwright Chromium sandbox is frequently unavailable inside hardened
    // containers with dropped capabilities/user namespaces.
    "--no-sandbox",
  ];
}

export async function checkChromium(): Promise<BrowserDiagnostic> {
  try {
    const browser = await chromium.launch({ headless: true, args: chromiumLaunchArgs() });
    try {
      return { ok: true, browser: "chromium", version: browser.version() };
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch (error) {
    return {
      ok: false,
      browser: "chromium",
      error: error instanceof Error ? error.message : "Chromium launch failed",
    };
  }
}

export async function checkReady(config: SandboxConfig): Promise<ReadyDiagnostic> {
  const configurationErrors: string[] = [];
  if (!config.apiToken) configurationErrors.push("SANDBOX_API_TOKEN is required");
  if (config.maxRequests <= 0) configurationErrors.push("SANDBOX_MAX_REQUESTS must be positive");
  if (config.maxRedirects <= 0) configurationErrors.push("SANDBOX_MAX_REDIRECTS must be positive");

  let directories: ReadyDiagnostic["directories"];
  try {
    await fs.mkdir(config.artifactDir, { recursive: true });
    const probe = path.join(config.artifactDir, `.ready-${process.pid}-${Date.now()}`);
    await fs.writeFile(probe, "ok");
    await fs.rm(probe, { force: true });
    directories = { ok: true, artifactDir: config.artifactDir };
  } catch (error) {
    directories = {
      ok: false,
      artifactDir: config.artifactDir,
      error: error instanceof Error ? error.message : "artifact directory is not writable",
    };
  }

  let networkPolicy: ReadyDiagnostic["networkPolicy"];
  try {
    const expected = ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.169.254", "::1", "fc00::1"];
    const failed = expected.filter((address) => !isBlockedAddress(address, config.extraBlockedCidrs));
    networkPolicy = failed.length
      ? { ok: false, error: `network policy failed to block: ${failed.join(", ")}` }
      : { ok: true };
  } catch (error) {
    networkPolicy = { ok: false, error: error instanceof Error ? error.message : "network policy initialization failed" };
  }

  const browser = await checkChromium();
  const ok = browser.ok && configurationErrors.length === 0 && directories.ok && networkPolicy.ok;
  return {
    status: ok ? "ok" : "error",
    browser,
    configuration: { ok: configurationErrors.length === 0, errors: configurationErrors },
    directories,
    networkPolicy,
    sandbox: ok ? "ready" : "not_ready",
  };
}
