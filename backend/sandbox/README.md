# PhishGuard sandbox

Build from `backend/` after compiling:

```text
docker build -f sandbox/Dockerfile -t phishguard-sandbox .
```

Run the network readiness gate before enabling the host runner:

```text
docker run --rm --network pg-sandbox --entrypoint node phishguard-sandbox dist/src/services/dynamic/sandboxSelftest.js
```

Proceed only when the JSON output contains `"ok":true`.

Create and configure the dedicated network before enabling dynamic analysis. Run `selftest.ts` inside the image and require its JSON `ok: true` result. On Windows Docker Desktop, apply network/firewall rules inside WSL2 or use a controlled proxy that performs DNS/IP checks at connect time.

The sandbox is opt-in through `PHISHGUARD_DYNAMIC_ENABLED=1`. The regular `/api/scan` path does not call it. A container is not a VM; gVisor or a separate VM provides stronger kernel isolation.
