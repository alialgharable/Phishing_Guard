import http from "node:http";
import { extractBearerToken, constantTimeEquals } from "./auth.js";
import type { AnalyzeRequest, SandboxResult } from "./types.js";

export type AnalyzeHandler = (input: AnalyzeRequest) => Promise<SandboxResult>;
export type DiagnosticHandler = () => Promise<unknown>;

function jsonResponse(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request: http.IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error("request body too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isDiagnosticOk(payload: unknown): boolean {
  return typeof payload === "object" && payload !== null && "status" in payload && (payload as { status?: unknown }).status === "ok";
}

export function createServer(options: {
  token: string | undefined;
  analyze: AnalyzeHandler;
  health: DiagnosticHandler;
  ready: DiagnosticHandler;
}): http.Server {
  return http.createServer(async (request, response) => {
    if (request.method === "GET" && (request.url === "/health" || request.url === "/healthz")) {
      const result = await options.health();
      jsonResponse(response, isDiagnosticOk(result) ? 200 : 503, result);
      return;
    }
    if (request.method === "GET" && request.url === "/ready") {
      const result = await options.ready();
      jsonResponse(response, isDiagnosticOk(result) ? 200 : 503, result);
      return;
    }
    if (request.method !== "POST" || request.url !== "/analyze") {
      jsonResponse(response, 404, { error: "not found" });
      return;
    }
    const providedToken = extractBearerToken(request.headers.authorization);
    if (!constantTimeEquals(providedToken, options.token)) {
      jsonResponse(response, 401, { error: "unauthorized" });
      return;
    }
    let input: unknown;
    try {
      input = await readJson(request);
    } catch {
      jsonResponse(response, 400, { error: "valid JSON body required" });
      return;
    }
    if (typeof input !== "object" || input === null || typeof (input as AnalyzeRequest).url !== "string") {
      jsonResponse(response, 400, { error: "url is required" });
      return;
    }
    try {
      const result = await options.analyze(input as AnalyzeRequest);
      jsonResponse(response, 200, result);
    } catch (error) {
      jsonResponse(response, 500, {
        status: "error",
        redirects: [],
        domainsContacted: [],
        networkRequests: [],
        downloads: [],
        screenshots: [],
        behaviorObservations: [],
        message: error instanceof Error ? error.message : "sandbox analysis failed",
      });
    }
  });
}
