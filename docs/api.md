# PhishGuard Scan API

The backend exposes a local defensive scan API. It does not execute remote JavaScript, submit forms, forward cookies or authentication headers, or expose secrets.

## Endpoints

### `GET /health`

Returns:

```json
{ "status": "ok", "requestId": "..." }
```

### `POST /api/scan`

Request:

```json
{ "url": "https://example.com" }
```

The response contains the normalized URL, existing analysis outputs, and the Phase 10 `RiskAssessment`, including risk state, summary, evidence, category summaries, direct threat evidence, ML metadata, availability, and uncertainty.

The API does not create a second risk model. It calls `ScanOrchestrator`, which invokes the existing URL, threat-intelligence, domain, redirect, content, brand, and fusion services.

## Validation and errors

The request accepts only HTTP and HTTPS URLs. Empty, malformed, oversized, credential-bearing, local, private, link-local, metadata, unsupported-protocol, and DNS-resolving-to-private destinations are rejected. Local files are never fetched.

Errors use explicit categories such as:

- `INVALID_URL`
- `URL_TOO_LONG`
- `UNSUPPORTED_PROTOCOL`
- `CREDENTIAL_URL`
- `PRIVATE_DESTINATION`
- `SCAN_TIMEOUT`
- `ANALYSIS_ERROR`
- `RATE_LIMITED`
- `SCAN_CAPACITY`

An error never means the URL is safe. The analysis layers and fusion assessment preserve incomplete availability where an analysis result exists.

## Limits and security

Configuration is controlled through environment variables: `PHISHGUARD_HOST`, `PHISHGUARD_PORT`, `PHISHGUARD_MAX_BODY_BYTES`, `PHISHGUARD_MAX_URL_LENGTH`, `PHISHGUARD_SCAN_TIMEOUT_MS`, `PHISHGUARD_MAX_CONCURRENT_SCANS`, `PHISHGUARD_RATE_LIMIT_PER_MINUTE`, and `PHISHGUARD_CORS_ORIGIN`.

The existing redirect policy blocks localhost, private IPv4/IPv6, link-local, internal, and cloud metadata destinations and enforces redirect and response-size limits. The API adds body, URL, timeout, concurrency, and in-memory per-client rate limits. The current rate limiter is intended for controlled local deployment, not public multi-instance production use.
