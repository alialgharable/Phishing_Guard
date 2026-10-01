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
```

Each missing key produces an `UNAVAILABLE` provider state. Request failures produce `ERROR`; completed checks produce `NO_MATCH` or `MATCH`. Keys are read only by the server route and are not exposed through `NEXT_PUBLIC_*` variables.

`NEXT_PUBLIC_API_URL` is optional and intended only when intentionally using an external compatible API. Without it, the UI uses the same-origin route.

## Analysis architecture

Server analyzers live in `src/lib/analyzers`:

- `resource.ts` — static resource classification
- `threat-intelligence.ts` — Google Web Risk, PhishTank, and URLhaus adapters
- `assessment.ts` — conservative assessment policy
- `evidence.ts` — duplicate display-evidence aggregation with raw items retained
- `sandbox.ts` — sandbox contract implementation that currently reports unavailable
- `contracts.ts` — interfaces for static, content, ML, threat-intelligence, and sandbox analyzers

The sandbox is deliberately not connected. Its response truthfully reports `status: "unavailable"` with empty result collections. A future isolated service can implement `SandboxAnalyzer`; it must supply actual redirects, contacted domains, requests, downloads, screenshots, and behavior observations rather than placeholders.

## Validation

```bash
npm test
npm run lint
npm run build
```
