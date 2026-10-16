# PhishGuard

PhishGuard is a conservative, evidence-first URL analysis UI and server-side analysis pipeline. Evidence is evidence—not a verdict. Missing providers and absent matches are never presented as proof of safety.

## Run locally

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. The built-in same-origin `POST /api/scan` route performs URL/resource classification and configured threat-intelligence lookups. It does **not** browse the submitted destination, execute scripts, submit forms, or download content.

## Threat-intelligence configuration

Set keys only in server-side environment configuration (for local development, `.env.local`, which is gitignored):

```dotenv
GOOGLE_WEB_RISK_API_KEY=...
PHISHTANK_API_KEY=...
URLHAUS_AUTH_KEY=...
SANDBOX_API_URL=http://127.0.0.1:4001
SANDBOX_API_TOKEN=replace-with-internal-token
```

Each missing key produces an `UNAVAILABLE` provider state. Request failures produce `ERROR`; completed checks produce `NO_MATCH` or `MATCH`. Keys are read only by the server route and are not exposed through `NEXT_PUBLIC_*` variables.

`NEXT_PUBLIC_API_URL` is optional and intended only when intentionally using an external compatible API. Without it, the UI uses the same-origin route.

For host-based sandbox development use `SANDBOX_API_URL=http://127.0.0.1:4001`. For Docker Compose use `SANDBOX_API_URL=http://sandbox:4001`. `SANDBOX_API_TOKEN` must remain server-side and must never be configured with a `NEXT_PUBLIC_` prefix.

## Analysis architecture

Server analyzers live in `src/lib/analyzers`:

- `resource.ts` — static resource classification
- `threat-intelligence.ts` — Google Web Risk, PhishTank, and URLhaus adapters
- `assessment.ts` — conservative assessment policy
- `evidence.ts` — duplicate display-evidence aggregation with raw items retained
- `sandbox.ts` — sandbox contract adapter for the internal `sandbox/` service
- `contracts.ts` — interfaces for static, content, ML, threat-intelligence, and sandbox analyzers

### URL intake

`src/lib/url` normalizes the submitted string before anything is fetched or queried:

- `normalizer.ts` — WHATWG parsing with strict intake, credential handling, and canonical host form
- `unicodeAnalyzer.ts` — control, invisible, bidi, and IDNA-relevant character detection
- `types.ts` — issue and analysis types shared with the API response

Rules that matter for interpretation:

- Input containing control characters (including tab and newline, which the URL parser
  deletes), non-standard spaces (which `String.trim()` deletes but the parser does not),
  or invisible characters inside the host is **rejected**. Those characters change which
  host is analyzed, and the analysis must not silently describe a different URL.
- An empty authority is rejected instead of being parsed as a host: `http:///path` would
  otherwise be analyzed as the host `path`.
- Host rewrites the parser performs for other reasons (numeric forms such as
  `http://2130706433/`, percent-encoded dots, full stop look-alikes, IDNA punycode) are
  analyzed but reported as `urlNormalization` issues and context evidence, so the
  displayed result always names the host that was actually analyzed.
- User information in a URL is never forwarded to threat-intelligence providers or to the
  sandbox, and the sandbox strips it before navigating. It is recorded as an ambiguity,
  not treated as a verdict.
- Normalization findings are `context` evidence only. A URL that parses cleanly is not
  evidence that it is safe, and an unusual one is not evidence that it is malicious.

The sandbox integrates through `SandboxAnalyzer`. If `SANDBOX_API_URL` and `SANDBOX_API_TOKEN` are unset it truthfully reports `status: "unavailable"`. When configured, `HttpSandboxAnalyzer` calls the separate internal sandbox service in `sandbox/`, which performs passive Playwright/Chromium analysis in a fresh execution context and returns actual redirects, contacted domains, request metadata, download metadata, screenshots, and behavioral observations.

## Validation

```bash
npm test
npm run lint
npm run build
```
