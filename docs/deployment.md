# Controlled Deployment

PhishGuard is currently prepared for controlled local or private-network deployment, not automatic public exposure.

## Configuration

Backend settings are centralized in `backend/src/server/config.ts` and documented in `backend/.env.example`. Frontend API routing uses `NEXT_PUBLIC_API_URL` from `frontend/.env.example`. Provider credentials remain runtime-only environment values.

## Security controls

The API has HTTP/HTTPS validation, credential-bearing URL rejection, redirect-policy SSRF protection, local/private/link-local/metadata blocking, request body and URL limits, scan timeouts, redirect/content limits from the existing analyzers, concurrency limits, in-memory rate limiting, CORS configuration, and a health endpoint. It never executes analyzed JavaScript, submits forms, forwards cookies or authentication headers, or reads local files.

The current in-memory rate limiter is appropriate for a single controlled instance. A public multi-instance deployment would need an external rate-limit store and an explicit authentication boundary; neither is introduced automatically.

## Logging and secrets

Structured logging is available through `backend/src/server/logger.ts`. Logs must not include request bodies, credentials, cookies, authorization headers, API keys, passwords, or unnecessary page content. Search results should be reviewed before deployment. `.env.example` files contain names only, never secrets.

## Container and CI

`Dockerfile` builds a non-root backend container. `.github/workflows/ci.yml` runs backend tests/build, ML tests, and frontend lint/build. Deployment is not automated.

The frontend dependency install and build must be run after sufficient disk space is available; the current development machine reported `ENOSPC` during npm installation.
