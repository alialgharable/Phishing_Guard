"use client";

import { FormEvent, useEffect, useState } from "react";
import { RiskAssessment, RiskState, ScanResponse, scanUrl } from "../lib/scan";

const stateLabels: Record<RiskState, string> = {
  KNOWN_MALWARE: "Known malware",
  KNOWN_PHISHING: "Known phishing",
  HIGH_RISK: "High risk",
  SUSPICIOUS: "Suspicious",
  LOW_RISK: "Low risk",
  UNKNOWN: "Unknown",
};
const layerLabels: Record<string, string> = {
  url: "URL analysis",
  threatIntel: "Threat intelligence",
  domain: "Domain analysis",
  redirects: "Redirect analysis",
  content: "Content analysis",
  brand: "Brand analysis",
  ml: "Machine learning",
};
type HistoryItem = Pick<ScanResponse, "url" | "requestId"> & {
  state: RiskState;
  at: string;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  useEffect(() => {
    try {
      setHistory(
        JSON.parse(localStorage.getItem("phishguard-history") ?? "[]"),
      );
    } catch {
      setHistory([]);
    }
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) {
      setStatus("error");
      setError("Enter a URL to begin the analysis.");
      return;
    }
    setStatus("loading");
    setError("");
    setResult(null);
    try {
      const response = await scanUrl(url.trim());
      setResult(response);
      setStatus("idle");
      const next = [
        {
          url: response.url,
          requestId: response.requestId,
          state: response.riskAssessment.state,
          at: new Date().toISOString(),
        },
        ...history.filter((item) => item.url !== response.url),
      ].slice(0, 8);
      setHistory(next);
      localStorage.setItem("phishguard-history", JSON.stringify(next));
    } catch (scanError) {
      setStatus("error");
      setError(
        scanError instanceof Error
          ? scanError.message
          : "The backend is unavailable.",
      );
    }
  }
  function clearHistory() {
    setHistory([]);
    localStorage.removeItem("phishguard-history");
  }
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-mark">
          <span className="brand-dot" />
          PHISHGUARD
        </div>
        <span className="header-note">Evidence-first URL analysis</span>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">DEFENSIVE ANALYSIS / 01</p>
          <h1>Look closer before you click.</h1>
          <p className="lede">
            A conservative read of a URL&apos;s independent signals, with
            uncertainty kept visible.
          </p>
        </div>
        <form
          className="scan-form"
          onSubmit={submit}
          aria-label="Analyze a URL"
        >
          <label htmlFor="url">URL to inspect</label>
          <div className="input-row">
            <input
              id="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              autoComplete="url"
            />
            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Analyzing..." : "Analyze URL"}
            </button>
          </div>
          <p className="form-hint">
            Only HTTP and HTTPS destinations are accepted. Analysis never
            submits forms or executes page scripts.
          </p>
        </form>
      </section>
      {status === "error" && (
        <div className="notice error" role="alert">
          <strong>Analysis incomplete</strong>
          <span>{error}</span>
        </div>
      )}
      {result && <ResultPanel assessment={result.riskAssessment} />}
      {!result && status === "idle" && (
        <section className="empty-state">
          <span className="empty-index">02</span>
          <div>
            <h2>Start with a URL</h2>
            <p>
              The result will separate direct findings, correlated signals, and
              unavailable analysis.
            </p>
          </div>
        </section>
      )}
      <section className="history">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RECENT / LOCAL ONLY</p>
            <h2>Scan history</h2>
          </div>
          {history.length > 0 && (
            <button className="text-button" onClick={clearHistory}>
              Clear history
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="muted">No scans stored on this device.</p>
        ) : (
          <div className="history-list">
            {history.map((item) => (
              <button
                className="history-item"
                key={item.requestId}
                onClick={() => setUrl(item.url)}
              >
                <span>{item.url}</span>
                <b className={`state-chip state-${item.state.toLowerCase()}`}>
                  {stateLabels[item.state]}
                </b>
              </button>
            ))}
          </div>
        )}
      </section>
      <footer>
        <span>PHISHGUARD / CONTROLLED ANALYSIS</span>
        <span>ML probability is evidence, not a verdict.</span>
      </footer>
    </main>
  );
}

function ResultPanel({ assessment }: { assessment: RiskAssessment }) {
  const unavailable = Object.entries(assessment.availability)
    .filter(([, available]) => !available)
    .map(([layer]) => layerLabels[layer] ?? layer);
  return (
    <section className="results" aria-live="polite">
      <div className="result-head">
        <div>
          <p className="eyebrow">ASSESSMENT</p>
          <div className="state-line">
            <span
              className={`state-swatch state-${assessment.state.toLowerCase()}`}
            />
            <h2>{stateLabels[assessment.state]}</h2>
          </div>
          <p className="summary">{assessment.summary}</p>
        </div>
        <div className="result-meta">
          <span>{assessment.evidence.length} observations</span>
          <span>
            {assessment.independentCategoryCount} independent categories
          </span>
        </div>
      </div>
      <div className="result-grid">
        <div className="column">
          <EvidenceSection assessment={assessment} />
          <ThreatSection assessment={assessment} />
        </div>
        <aside className="column side-column">
          <div className="panel">
            <p className="eyebrow">MACHINE LEARNING</p>
            <h3>
              {assessment.ml.available
                ? "Calibrated probability"
                : "Unavailable"}
            </h3>
            <p className="metric">
              {assessment.ml.available &&
              assessment.ml.probability !== undefined
                ? `${Math.round(assessment.ml.probability * 100)}%`
                : "—"}
            </p>
            {assessment.ml.available && (
              <p className="muted">
                {assessment.ml.calibrationMethod ??
                  "Calibration method not supplied"}{" "}
                · {assessment.ml.modelVersion ?? "Version not supplied"}
              </p>
            )}
          </div>
          <div className="panel">
            <p className="eyebrow">UNCERTAINTY</p>
            {unavailable.length === 0 && assessment.uncertainty.length === 0 ? (
              <p className="muted">
                All requested layers returned an availability signal.
              </p>
            ) : (
              <ul className="uncertainty-list">
                {assessment.uncertainty.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel explain">
            <p className="eyebrow">WHY THIS STATE</p>
            <p>{assessment.explanation}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
function EvidenceSection({ assessment }: { assessment: RiskAssessment }) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <p className="eyebrow">EVIDENCE</p>
        <span>{assessment.evidence.length}</span>
      </div>
      {assessment.evidence.length === 0 ? (
        <p className="muted">No evidence was returned.</p>
      ) : (
        <div className="evidence-list">
          {assessment.evidence.map((item, index) => (
            <article className="evidence-item" key={`${item.type}-${index}`}>
              <div className="evidence-top">
                <span className="evidence-category">
                  {item.category ?? "Uncategorized"}
                </span>
                <span className={`severity severity-${item.severity}`}>
                  {item.severity}
                </span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <small>{item.source}</small>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
function ThreatSection({ assessment }: { assessment: RiskAssessment }) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <p className="eyebrow">DIRECT THREAT INTELLIGENCE</p>
        <span>{assessment.directThreatEvidence.length}</span>
      </div>
      {assessment.directThreatEvidence.length === 0 ? (
        <p className="muted">
          No authoritative listing was returned. This is not proof of safety.
        </p>
      ) : (
        assessment.directThreatEvidence.map((threat) => (
          <article
            className="threat-item"
            key={`${threat.provider}-${threat.category}`}
          >
            <strong>{threat.category}</strong>
            <span>{threat.provider}</span>
          </article>
        ))
      )}
    </div>
  );
}
