import { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import {
  runInSandbox,
  SandboxUnavailableError,
} from "../../src/services/dynamic/runInSandbox";

function child() {
  const process = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  process.stdout = new EventEmitter();
  process.stderr = new EventEmitter();
  return process;
}

async function marker(): Promise<string> {
  const directory = await mkdtemp(
    join(tmpdir(), "phishguard-sandbox-process-"),
  );
  const path = join(directory, "selftest.json");
  await writeFile(
    path,
    JSON.stringify({ ok: true, passedAt: new Date().toISOString() }),
  );
  return path;
}

describe("sandbox process failure modes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("kills the container on timeout", async () => {
    const first = child();
    vi.mocked(spawn)
      .mockReturnValueOnce(first as never)
      .mockReturnValue(child() as never);
    const result = runInSandbox(
      "https://example.com",
      {},
      {
        enabled: true,
        timeoutMs: 10,
        selfTestMarker: await marker(),
        hostValidator: async () => true,
      },
    );
    await expect(result).rejects.toThrow("timeout");
    expect(vi.mocked(spawn).mock.calls[1]).toEqual([
      "docker",
      ["kill", expect.any(String)],
      { windowsHide: true },
    ]);
  });

  it("fails closed when Docker is unavailable", async () => {
    const process = child();
    vi.mocked(spawn).mockReturnValue(process as never);
    const result = runInSandbox(
      "https://example.com",
      {},
      {
        enabled: true,
        selfTestMarker: await marker(),
        hostValidator: async () => true,
      },
    );
    setTimeout(() => process.emit("error", new Error("docker missing")), 10);
    await expect(result).rejects.toBeInstanceOf(SandboxUnavailableError);
  });
});
