PhishGuard

PhishGuard is a defensive, evidence-first URL analysis system. It preserves uncertainty and contradictory observations rather than treating one suspicious characteristic, HTTPS, age, hosting, brand similarity, or model probability as a final verdict.

## Architecture

```text
Frontend
	|
Backend API
	|
Scan Orchestrator
	|
URL / Threat Intel / Domain / Redirect / Content / Brand / Features / ML
	|
Evidence Fusion
	|
RiskAssessment
```

The backend analysis layers never execute remote JavaScript, submit forms, forward cookies or authentication headers, or access local files. Redirect and content policies block local, private, link-local, internal, and metadata destinations and enforce size/time/hop limits.

## Project areas

- `backend/` TypeScript analyzers, Phase 10 fusion, and the local scan API
- `frontend/` Next.js dashboard consuming the backend API
- `ml/` leakage-safe dataset, baseline, OOF, calibration, and evaluation pipeline
- `docs/` architecture, evidence fusion, evaluation, API, and ML documentation

## Development

Backend:

```text
cd backend
npm install
npm test -- --run
npm run build
npm start
```

ML:

```text
python -m pip install -r ml/requirements.txt
python -m pytest ml/tests -q
```

Frontend:

```text
cd frontend
npm install
npm run dev
```

Set runtime values from `backend/.env.example` and `frontend/.env.example`; do not commit provider keys or other secrets.

## API

The local backend exposes `GET /health` and `POST /api/scan`. See [docs/api.md](docs/api.md) for request validation, limits, errors, and security behavior.

## Evaluation and limitations

See [docs/evaluation.md](docs/evaluation.md), [docs/evidence-fusion.md](docs/evidence-fusion.md), and [docs/ml-training.md](docs/ml-training.md). Repository tests use deterministic synthetic/sample cases and do not establish real-world accuracy. `UNKNOWN` is not malicious, `LOW_RISK` is not guaranteed safe, not-listed is not safe, and ML probability is evidence rather than a final verdict.

## Deployment

`Dockerfile` provides a backend container build. `.github/workflows/ci.yml` runs backend tests/build, ML tests, and frontend lint/build. Deployment is intentionally not automated.
