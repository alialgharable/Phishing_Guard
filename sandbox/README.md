# PhishGuard Sandbox Service

A separately deployable internal service for passive, controlled hostile-URL analysis with Playwright and Chromium.

## API

`POST /analyze`

Headers:

```http
Authorization: Bearer <SANDBOX_API_TOKEN>
Content-Type: application/json
```

Body:

```json
{ "url": "https://example.com", "requestId": "optional-correlation-id" }
```

The response preserves the existing PhishGuard `SandboxAnalyzer` contract (`status`, `finalUrl`, `redirects`, `domainsContacted`, `networkRequests`, `downloads`, `screenshots`, `behaviorObservations`, `message`) and adds operational metadata (`durationMs`, `terminationReason`, `limitsReached`). Sandbox observations are evidence only. The service does not issue a malicious/safe verdict.

## Threat model

The service treats every target URL, redirect, resource, iframe, script-generated request, download, DNS result, and response header as hostile. Its primary goal is to prevent the sandbox from becoming an SSRF bridge into localhost, private networks, cloud metadata services, container infrastructure, Kubernetes services, or PhishGuard internals while collecting passive behavioral metadata.

## Isolation model

In this milestone the deployment target is Docker Compose on a standalone Linux VM. The sandbox service runs separately from the PhishGuard web app. Every request creates a fresh Chromium browser process and fresh browser context, then closes both in a guaranteed cleanup path. Contexts are never reused between scans, and no persistent user profile is used.

The Compose configuration hardens the sandbox container with:

- non-root `pwuser`
- `read_only: true`
- temporary writable `tmpfs` locations only
- no host filesystem mounts
- no Docker socket mount
- `no-new-privileges:true`
- dropped Linux capabilities
- PID, memory, and CPU limits
- no application secrets except `SANDBOX_API_TOKEN`

Do not run this service with `--privileged`. Do not mount `/var/run/docker.sock`. Do not mount host credential directories, cloud credentials, SSH keys, source trees, or PhishGuard filesystem paths into the sandbox.

### Production isolation warning

Ordinary Docker is **not** considered a complete hostile-code security boundary for production browser exploitation scenarios. This implementation deliberately uses an isolation backend abstraction so the browser execution layer can later be replaced or strengthened with:

- gVisor
- Kata Containers
- Firecracker microVMs

without changing the PhishGuard `SandboxAnalyzer` API contract.

## Network policy

The sandbox validates destinations before navigation and before every intercepted browser request. Validation is:

```text
hostname -> DNS resolution -> validate every resolved IP -> allow or block
```

Blocked ranges include localhost, loopback, RFC1918 private IPv4, link-local IPv4, multicast/reserved IPv4, IPv6 loopback, IPv6 link-local, IPv6 unique-local/private ranges, cloud metadata addresses, common Docker networks, common Kubernetes service ranges, and any extra CIDRs configured in `SANDBOX_BLOCKED_CIDRS`.

Examples blocked by default:

- `127.0.0.0/8`
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`
- `169.254.0.0/16`
- `169.254.169.254`
- `::1/128`
- `fc00::/7`
- `fe80::/10`

The service blocks `localhost` and `*.localhost` by name and blocks non-HTTP(S) protocols.

### DNS rebinding and redirect validation

The initial hostname is resolved and validated before navigation. Browser request interception applies the same DNS-and-IP policy to redirects, iframe URLs, image/script/style/font/media/API requests, and JavaScript-triggered requests. Redirects are recorded as ordered `{ url, status, location }` evidence. The maximum redirect count is enforced and reported as a limit condition.

Known limitation: application-layer validation reduces SSRF risk but is not equivalent to a kernel/network-level egress firewall. Production deployments should add VM/firewall/eBPF/proxy enforcement that denies private/internal CIDRs regardless of browser DNS behavior.

## Passive browser policy

Allowed:

- navigation
- resource loading
- request/response metadata collection
- redirect observation
- console/security-relevant event recording where available
- screenshots with a fixed viewport
- download metadata collection

Not allowed and not implemented:

- arbitrary clicking
- form submission
- credential entry
- authentication-flow interaction
- purchases
- uploads
- messages
- execution/opening of downloaded files

Chromium is launched headless with a fresh non-persistent context. Microphone, camera, geolocation, notifications, clipboard, persistent profile, and broad permissions are not granted.

## Resource limits

Configurable environment variables:

| Variable | Default |
| --- | ---: |
| `SANDBOX_NAVIGATION_TIMEOUT_MS` | `15000` |
| `SANDBOX_OVERALL_TIMEOUT_MS` | `30000` |
| `SANDBOX_MAX_REDIRECTS` | `8` |
| `SANDBOX_MAX_REQUESTS` | `200` |
| `SANDBOX_MAX_DOWNLOAD_BYTES` | `5242880` |
| `SANDBOX_MAX_SCREENSHOT_BYTES` | `2097152` |
| `SANDBOX_MAX_RESPONSE_BODY_BYTES` | `131072` |

Container-level Compose limits include CPU, memory, and PID caps.

## Download quarantine

Downloads are never executed, installed, or opened. The service records controlled metadata only: filename, URL, size, SHA-256 when within the size limit, timestamp, and whether the download-size limit was exceeded. Downloaded temporary files are deleted after metadata collection.

## Screenshots

The service captures one PNG screenshot after navigation settles using a fixed viewport. Screenshots larger than `SANDBOX_MAX_SCREENSHOT_BYTES` are discarded and reported as a limit. Returned screenshot values are `sandbox://screenshots/<id>.png` artifact identifiers, not arbitrary filesystem paths.

## Cleanup

Cleanup runs in `finally` paths and closes the page, browser context, browser process, and temporary scan directory after success, timeout, navigation failure, blocked destination, download limit, or unexpected exception.

## Authentication

The service refuses to start without `SANDBOX_API_TOKEN`. `/analyze` requires `Authorization: Bearer <token>` and compares tokens with Node's constant-time comparison primitive. The token is only used server-to-server and must never be exposed through `NEXT_PUBLIC_*` variables or browser code.

## Local development

For host-based development the PhishGuard server should call the sandbox on localhost:

```dotenv
SANDBOX_API_URL=http://127.0.0.1:4001
SANDBOX_API_TOKEN=dev-internal-token
```

From the repository root:

```bash
npm ci
npm --workspace @phishguard/sandbox-service exec -- playwright install chromium
SANDBOX_API_TOKEN=dev-internal-token npm --workspace @phishguard/sandbox-service run dev
```

In another terminal:

```bash
curl -sS \
  -H 'Authorization: Bearer dev-internal-token' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","requestId":"local-test"}' \
  http://127.0.0.1:4001/analyze | jq
```

Check diagnostics:

```bash
curl http://127.0.0.1:4001/health
curl http://127.0.0.1:4001/ready
```

Connect PhishGuard to the service:

```bash
SANDBOX_API_URL=http://127.0.0.1:4001 \
SANDBOX_API_TOKEN=dev-internal-token \
npm run dev
```

Run the real browser integration test after Chromium is installed:

```bash
RUN_SANDBOX_E2E=1 SANDBOX_API_TOKEN=dev-internal-token npm --workspace @phishguard/sandbox-service run test:e2e
```

## Docker Compose

Inside Compose, PhishGuard must use the service name, not localhost:

```dotenv
SANDBOX_API_URL=http://sandbox:4001
```

`SANDBOX_API_TOKEN` remains server-side and is never exposed through `NEXT_PUBLIC_*` browser variables.

```bash
export SANDBOX_API_TOKEN='replace-with-long-random-token'
docker compose up --build
```

PhishGuard listens on `http://localhost:3000`. The sandbox service is attached to an internal network for PhishGuard-to-sandbox traffic and a separate egress network for public web access.

## Known limitations

- Docker alone is not a complete hostile-browser exploit boundary.
- Application-layer request interception should be complemented by VM or host firewall rules blocking private/internal CIDRs.
- Response bodies are intentionally not retained in this first version.
- Screenshots are identified by internal artifact IDs; no public artifact download API is exposed.
- Behavioral observations are evidence, not verdicts or scores.
