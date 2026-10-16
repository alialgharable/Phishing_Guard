export interface LogContext {
  requestId?: string;
  scanId?: string;
  durationMs?: number;
  stage?: string;
  errorType?: string;
}

export function logEvent(event: string, context: LogContext = {}): void {
  // Structured logs deliberately exclude request bodies, credentials, cookies, headers, and full URLs.
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...context })}\n`,
  );
}
