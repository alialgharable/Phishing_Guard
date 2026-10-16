# Dynamic Analysis

PhishGuard contains a passive dynamic-analysis foundation under `backend/src/services/dynamic/`.

## Safety boundary

Dynamic detonation is observation-only. It may record requests, redirects, downloads, browser API observations, static script responses, DOM structure, and screenshots inside the configured sandbox. It never types credentials, generates credentials for remote pages, submits forms, forwards cookies or authentication headers, or executes page actions on behalf of a user.

The existing `runInSandbox` path is the only supported host-side entry point for a live detonation. The sandbox must provide the container, network policy, resource limits, and DNS/IP restrictions. Direct `detonate()` use is intended for controlled local fixtures and unit tests.

## Sandbox setup

From `backend/`, compile first and build the pinned Playwright image:

```text
npm run build
docker build -f sandbox/Dockerfile -t phishguard-sandbox .
```

Create a dedicated Docker network and apply deny-by-default egress rules for private, localhost, link-local, metadata, and Docker host ranges before enabling the runtime. On Windows, apply those rules inside WSL2 or use a controlled proxy container; Docker Desktop host networking is not an adequate substitute for a self-test.

Run the compiled sandbox self-test inside the image and require its JSON `ok: true` result before setting `PHISHGUARD_DYNAMIC_ENABLED=1`:

```text
docker run --rm --network pg-sandbox --entrypoint node phishguard-sandbox dist/src/services/dynamic/sandboxSelftest.js
```

The host runner also validates HTTP/HTTPS URLs, rejects credentials, uses an argument array rather than shell interpolation, enforces a wall-clock timeout, and always asks Docker to remove the container.

The default is disabled. Missing Docker, image, runtime, network, firewall, or self-test readiness must remain `DYNAMIC_ANALYSIS_UNAVAILABLE`; the backend must never fall back to unsandboxed browser execution.

Canary generation and matching remain available for offline captured-request analysis, but the live detonation path does not submit canaries. A canary hit in an already-captured request can still be classified as dynamic evidence without sending a new request.

## Phase coverage

- Phase A: passive Playwright observation hooks, SSRF checks, request/download capture, behavior evidence, and canary matching for offline fixtures.
- Phase B: deterministic DOM fingerprints and bounded visual/hash utility foundations.
- Phase C: bounded JavaScript-obfuscation, known exfiltration-endpoint, and infrastructure feature utilities.
- Phase D: dynamic feature extraction with explicit nulls for unavailable measurements.

Dynamic evidence is an evidence source, not a separate verdict system. It must be mapped into the existing evidence-fusion contract and remain subject to correlation caps and availability/uncertainty rules.

## Limitations

The dynamic utilities do not establish that a page is malicious by themselves. Modern legitimate sites can use third-party scripts, redirects, browser APIs, and complex JavaScript. A failed or unavailable detonation is uncertainty, not safety. A sandbox image, browser binaries, network firewall, and controlled deployment are prerequisites for live detonation; they are not silently installed or assumed by the static API.
