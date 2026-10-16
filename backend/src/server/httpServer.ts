import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { loadServerConfig, ServerConfig } from "./config";
import { validateScanRequest } from "./validation";
import { ScanOrchestrator } from "../services/scan/scanOrchestrator";

export function createHttpServer(
  orchestrator = new ScanOrchestrator(),
  config: ServerConfig = loadServerConfig(),
): Server {
  let activeScans = 0;
  const requestTimes = new Map<string, number[]>();
  return createServer(async (request, response) => {
    const requestId = randomUUID();
    response.setHeader(
      "Access-Control-Allow-Origin",
      process.env.PHISHGUARD_CORS_ORIGIN ?? "http://localhost:3000",
    );
    response.setHeader("Access-Control-Allow-Headers", "content-type");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (request.method === "GET" && request.url === "/health") {
      writeJson(response, 200, { status: "ok", requestId });
      return;
    }
    if (request.method !== "POST" || request.url !== "/api/scan") {
      writeJson(response, 404, { error: "NOT_FOUND", requestId });
      return;
    }
    const client = request.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const recent = (requestTimes.get(client) ?? []).filter(
      (time) => now - time < 60_000,
    );
    if (recent.length >= config.rateLimitPerMinute) {
      writeJson(response, 429, { error: "RATE_LIMITED", requestId });
      return;
    }
    recent.push(now);
    requestTimes.set(client, recent);
    if (activeScans >= config.maxConcurrentScans) {
      writeJson(response, 429, { error: "SCAN_CAPACITY", requestId });
      return;
    }
    let counted = false;
    try {
      const body = await readBody(request, config.maxBodyBytes);
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        writeJson(response, 400, {
          error: "INVALID_URL",
          message: "Request body must be valid JSON.",
          requestId,
        });
        return;
      }
      const validation = await validateScanRequest(
        payload,
        config.maxUrlLength,
      );
      if (!validation.ok) {
        writeJson(response, 400, {
          error: validation.code,
          message: validation.message,
          requestId,
        });
        return;
      }
      activeScans += 1;
      counted = true;
      const result = await withTimeout(
        orchestrator.scan(validation.value.url),
        config.scanTimeoutMs,
      );
      writeJson(response, 200, { requestId, ...result });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Analysis failed.";
      const timeout = /timeout/i.test(message);
      writeJson(response, timeout ? 504 : 502, {
        error: timeout ? "SCAN_TIMEOUT" : "ANALYSIS_ERROR",
        message: timeout
          ? "Scan timed out; analysis availability is incomplete."
          : "Scan could not be completed.",
        requestId,
      });
    } finally {
      if (counted) activeScans -= 1;
    }
  });
}

function readBody(request: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("request body too large"));
        request.resume();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("scan timeout")), timeoutMs),
    ),
  ]);
}

function writeJson(
  response: ServerResponse,
  status: number,
  payload: object,
): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}
