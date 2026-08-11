import React, { useEffect, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// ─── Types (matching server) ──────────────────────────────────────────────
interface InvestigationEvent {
  id: string;
  investigationId: string;
  type: string;
  agentRole?: string;
  modelId?: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

interface Hypothesis {
  id: string;
  statement: string;
  supportLevel: string;
  claims: string[];
  supportingEvidence: string[];
  contradictingEvidence: string[];
  expectedEvidence: Array<{ id: string; description: string; status: string }>;
  iterations: Array<{ iteration: number; previousSupport: string; newSupport: string; reason: string; timestamp: number }>;
  updatedAt: number;
}

interface Source {
  id: string;
  title: string;
  url?: string;
  sourceType: string;
  isPrimary: boolean;
  quality: { authority: number; proximity: number; specificity: number; independence: number; transparency: number; recency: number; trackRecord: number };
  citedBy: string[];
  cites: string[];
}

interface Evidence {
  id: string;
  text: string;
  type: string;
  sourceId: string;
  independentConfirmation: boolean;
}

interface Claim {
  id: string;
  text: string;
  type: string;
  status: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
}

interface Contradiction {
  id: string;
  description: string;
  status: string;
  resolution?: string;
}

interface DevilsEvidence {
  id: string;
  hypothesisId: string;
  explanation: string;
  severity: string;
}

interface Assessment {
  confidenceLevel: string;
  summary?: string;
  supportingEvidence?: string[];
  contradictingEvidence?: string[];
  majorAssumptions?: string[];
  majorUnknowns?: string[];
  strongestCounterargument?: string;
  informationGaps?: string[];
  hypothesisSummaries: Array<{ hypothesisId: string; hypothesisStatement: string; supportLevel: string }>;
}

interface CostSummary {
  budget: number;
  spent: number;
  remaining: number;
  calls: number;
}

interface InvestigationState {
  id: string;
  question: string;
  phase: string;
  phaseHistory: Array<{ phase: string; enteredAt: number }>;
  hypotheses: Hypothesis[];
  claims: Claim[];
  evidence: Evidence[];
  sources: Source[];
  contradictions: Contradiction[];
  devilsEvidence: DevilsEvidence[];
  assessment: Assessment | null;
  budget: { budgetUSD: number; spentUSD: number };
  updatedAt: number;
}

// ─── Phase display ───────────────────────────────────────────────────────
const PHASE_ORDER = [
  "DISCOVERY", "PREMISE_AUDIT", "DECOMPOSITION", "HYPOTHESIS_GENERATION",
  "INDEPENDENT_RESEARCH", "EVIDENCE_ANALYSIS", "COUNCIL_COMPARISON",
  "ADVERSARIAL_REVIEW", "GAP_ANALYSIS", "TARGETED_RESEARCH",
  "REASSESSMENT", "CONVERGENCE"
];

const SUPPORT_COLORS: Record<string, string> = {
  STRONG: "#65d8b0", MODERATE: "#c4d97a", WEAK: "#d4a96a",
  INSUFFICIENT_EVIDENCE: "#d46a6a", NONE: "#526972"
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function App() {
  const [investigationId, setInvestigationId] = useState<string | null>(null);
  const [question, setQuestion] = useState("Why is the United States building so many data centers?");
  const [events, setEvents] = useState<InvestigationEvent[]>([]);
  const [state, setState] = useState<InvestigationState | null>(null);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [intervention, setIntervention] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<"feed" | "hypotheses" | "evidence" | "sources" | "assessment">("feed");
  const eventSourceRef = useRef<EventSource | null>(null);

  // ─── Start investigation ────────────────────────────────────────────
  const startInvestigation = useCallback(async () => {
    setError(null);
    setEvents([]);
    setState(null);
    setRunning(true);

    try {
      const res = await fetch("/api/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      setInvestigationId(data.id);

      // Connect SSE
      if (eventSourceRef.current) eventSourceRef.current.close();
      const es = new EventSource(`/events/${data.id}`);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const event: InvestigationEvent = JSON.parse(e.data);
          setEvents((prev) => [...prev.slice(-200), event]);
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        // SSE errors can happen on close — just reconnect if still running
      };

      // Poll state
      const pollInterval: ReturnType<typeof setInterval> = setInterval(async () => {
        if (!data.id) return;
        try {
          const [stateRes, costRes] = await Promise.all([
            fetch(`/api/investigations/${data.id}`),
            fetch(`/api/investigations/${data.id}/cost`),
          ]);
          if (stateRes.ok) {
            const stateData = await stateRes.json();
            setState(stateData);
            if (stateData.phase === "CONVERGENCE") {
              setRunning(false);
            }
          }
          if (costRes.ok) {
            setCost(await costRes.json());
          }
        } catch { /* poll errors are transient */ }
      }, 2000);

      // Store interval for cleanup
      (window as unknown as { __pollInterval?: ReturnType<typeof setInterval> }).__pollInterval = pollInterval;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start investigation");
      setRunning(false);
    }
  }, [question]);

  // ─── Submit intervention ────────────────────────────────────────────
  const submitIntervention = useCallback(async () => {
    if (!investigationId || !intervention.trim()) return;
    try {
      await fetch(`/api/investigations/${investigationId}/intervene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: intervention }),
      });
      setIntervention("");
    } catch (err) {
      setError("Failed to submit intervention");
    }
  }, [investigationId, intervention]);

  // ─── Cleanup on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      const w = window as unknown as { __pollInterval?: ReturnType<typeof setInterval> };
      if (w.__pollInterval) clearInterval(w.__pollInterval);
    };
  }, []);

  // ─── Auto-start on load ─────────────────────────────────────────────
  useEffect(() => {
    startInvestigation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phaseIndex = state ? PHASE_ORDER.indexOf(state.phase) : -1;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">R</span>
          <div><strong>RUTHLESS</strong><span> INVESTIGATOR</span></div>
        </div>
        <div className="live">
          <i /> {running ? "LIVE INVESTIGATION" : state?.phase === "CONVERGENCE" ? "CONVERGED" : "IDLE"}
        </div>
        {cost && (
          <div className="budget">
            ${cost.spent.toFixed(2)} / ${cost.budget.toFixed(2)} · {cost.calls} calls
          </div>
        )}
        <button className="stop" onClick={() => setRunning(r => !r)} disabled={!investigationId}>
          {running ? "Pause" : "Resume"}
        </button>
      </header>

      <main>
        {/* ─── Question Input ─── */}
        <section className="question-bar">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Enter investigation question..."
            className="question-input"
            onKeyDown={(e) => e.key === "Enter" && !running && startInvestigation()}
          />
          <button className="start-btn" onClick={startInvestigation} disabled={running}>
            {running ? "Investigating..." : "Start Investigation"}
          </button>
        </section>

        {error && <div className="error">{error}</div>}

        {/* ─── Phase Progress ─── */}
        {state && (
          <section className="phase-bar">
            {PHASE_ORDER.map((phase, i) => (
              <div key={phase} className={`phase-step ${i <= phaseIndex ? "active" : ""} ${i === phaseIndex ? "current" : ""}`}>
                <div className="phase-dot" />
                <span>{phase.replace(/_/g, " ")}</span>
              </div>
            ))}
          </section>
        )}

        {/* ─── Investigation Stats ─── */}
        {state && (
          <section className="stats-row">
            <span><b>{state.hypotheses.length}</b> hypotheses</span>
            <span><b>{state.claims.length}</b> claims</span>
            <span><b>{state.evidence.length}</b> evidence items</span>
            <span><b>{state.sources.length}</b> sources</span>
            <span><b>{state.sources.filter(s => s.isPrimary).length}</b> primary sources</span>
            <span><b>{state.contradictions.length}</b> contradictions</span>
          </section>
        )}

        {/* ─── Tab Navigation ─── */}
        {state && (
          <nav className="tabs">
            {(["feed", "hypotheses", "evidence", "sources", "assessment"] as const).map(tab => (
              <button
                key={tab}
                className={`tab ${selectedTab === tab ? "active" : ""}`}
                onClick={() => setSelectedTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === "hypotheses" && state.hypotheses.length > 0 && ` (${state.hypotheses.length})`}
                {tab === "evidence" && state.evidence.length > 0 && ` (${state.evidence.length})`}
                {tab === "sources" && state.sources.length > 0 && ` (${state.sources.length})`}
              </button>
            ))}
          </nav>
        )}

        {/* ─── Feed Tab ─── */}
        {(!state || selectedTab === "feed") && (
          <section className="feed-section">
            <div className="panel-head"><span>INVESTIGATION FEED</span><small>{running ? "LIVE" : "PAUSED"}</small></div>
            <div className="feed">
              {events.length === 0 && <div className="empty">Waiting for investigation events...</div>}
              {events.slice().reverse().map((event) => (
                <div className="event" key={event.id}>
                  <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
                  <div>
                    <b>{event.agentRole || event.type.replace(/_/g, " ")}</b>
                    <p>{event.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── Hypotheses Tab ─── */}
        {state && selectedTab === "hypotheses" && (
          <section className="hypotheses-section">
            {state.hypotheses.length === 0 && <div className="empty">No hypotheses generated yet.</div>}
            {state.hypotheses.map(hyp => (
              <div className="hyp-card" key={hyp.id}>
                <div className="hyp-header">
                  <span className="hyp-id">{hyp.id}</span>
                  <span className="hyp-support" style={{ color: SUPPORT_COLORS[hyp.supportLevel] || "#526972" }}>
                    {hyp.supportLevel.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="hyp-statement">{hyp.statement}</p>
                <div className="hyp-stats">
                  <span>✓ {hyp.supportingEvidence.length} supporting</span>
                  <span>✗ {hyp.contradictingEvidence.length} contradicting</span>
                  <span>◇ {hyp.expectedEvidence.filter(e => e.status === "FOUND").length}/{hyp.expectedEvidence.length} expected evidence found</span>
                  <span>{hyp.claims.length} claims</span>
                </div>
                {hyp.expectedEvidence.length > 0 && (
                  <div className="expected-evidence">
                    <small>EXPECTED EVIDENCE</small>
                    {hyp.expectedEvidence.map(exp => (
                      <div key={exp.id} className={`expected-item ${exp.status.toLowerCase()}`}>
                        <span className="exp-status">{exp.status === "FOUND" ? "✓" : exp.status === "MISSING" ? "✗" : "?"}</span>
                        {exp.description}
                      </div>
                    ))}
                  </div>
                )}
                {hyp.iterations.length > 0 && (
                  <div className="iterations">
                    <small>EPISTEMIC HISTORY</small>
                    {hyp.iterations.map((it, i) => (
                      <div key={i} className="iteration">
                        <span className="iter-change">{it.previousSupport.replace(/_/g, " ")} → {it.newSupport.replace(/_/g, " ")}</span>
                        <span className="iter-reason">{it.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ─── Evidence Tab ─── */}
        {state && selectedTab === "evidence" && (
          <section className="evidence-section">
            {state.evidence.length === 0 && <div className="empty">No evidence collected yet.</div>}
            {state.evidence.map(ev => {
              const source = state.sources.find(s => s.id === ev.sourceId);
              return (
                <div className="ev-card" key={ev.id}>
                  <div className="ev-type" style={{ color: ev.type === "PROJECTION" ? "#d4a96a" : ev.type === "MEASUREMENT" ? "#65d8b0" : "#8ea2ab" }}>
                    {ev.type}
                  </div>
                  <p className="ev-text">{ev.text}</p>
                  <div className="ev-source">
                    <span>{source?.title || "Unknown source"}</span>
                    {!ev.independentConfirmation && <span className="correlated">⚠ correlated</span>}
                    {source?.isPrimary && <span className="primary">primary</span>}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ─── Sources Tab ─── */}
        {state && selectedTab === "sources" && (
          <section className="sources-section">
            {state.sources.length === 0 && <div className="empty">No sources collected yet.</div>}
            {state.sources.map(src => (
              <div className="src-card" key={src.id}>
                <div className="src-header">
                  <span className="src-title">{src.title}</span>
                  <span className={`src-type ${src.isPrimary ? "primary" : "secondary"}`}>
                    {src.isPrimary ? "PRIMARY" : "SECONDARY"} · {src.sourceType}
                  </span>
                </div>
                {src.url && <a href={src.url} target="_blank" rel="noreferrer" className="src-url">{src.url}</a>}
                <div className="src-quality">
                  <span>Auth: {Math.round(src.quality.authority * 100)}%</span>
                  <span>Prox: {Math.round(src.quality.proximity * 100)}%</span>
                  <span>Indep: {Math.round(src.quality.independence * 100)}%</span>
                  <span>Transp: {Math.round(src.quality.transparency * 100)}%</span>
                </div>
                {src.cites.length > 0 && <div className="src-cites">Cites: {src.cites.length} source(s)</div>}
                {src.citedBy.length > 0 && <div className="src-cited-by">Cited by: {src.citedBy.length} source(s)</div>}
              </div>
            ))}
          </section>
        )}

        {/* ─── Assessment Tab ─── */}
        {state && selectedTab === "assessment" && (
          <section className="assessment-section">
            {!state.assessment && <div className="empty">Assessment will appear when the investigation converges.</div>}
            {state.assessment && (
              <>
                <div className="assessment-header">
                  <span className="confidence-badge" style={{ color: SUPPORT_COLORS[state.assessment.confidenceLevel?.replace("VERY_", "").replace(/_/g, " ")] || "#8ea2ab" }}>
                    {state.assessment.confidenceLevel} CONFIDENCE
                  </span>
                </div>
                {state.assessment.summary && <p className="assessment-summary">{state.assessment.summary}</p>}

                <div className="assessment-grid">
                  {state.assessment.hypothesisSummaries.map(hs => (
                    <div className="assess-hyp" key={hs.hypothesisId}>
                      <span className="assess-support" style={{ color: SUPPORT_COLORS[hs.supportLevel] || "#526972" }}>
                        {hs.supportLevel.replace(/_/g, " ")}
                      </span>
                      <span>{hs.hypothesisStatement}</span>
                    </div>
                  ))}
                </div>

                {state.assessment.supportingEvidence && state.assessment.supportingEvidence.length > 0 && (
                  <div className="assess-block">
                    <small>SUPPORTING EVIDENCE</small>
                    <ul>{state.assessment.supportingEvidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
                  </div>
                )}
                {state.assessment.contradictingEvidence && state.assessment.contradictingEvidence.length > 0 && (
                  <div className="assess-block">
                    <small>CONTRADICTING EVIDENCE</small>
                    <ul>{state.assessment.contradictingEvidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
                  </div>
                )}
                {state.assessment.majorAssumptions && state.assessment.majorAssumptions.length > 0 && (
                  <div className="assess-block">
                    <small>MAJOR ASSUMPTIONS</small>
                    <ul>{state.assessment.majorAssumptions.map((e, i) => <li key={i}>{e}</li>)}</ul>
                  </div>
                )}
                {state.assessment.majorUnknowns && state.assessment.majorUnknowns.length > 0 && (
                  <div className="assess-block">
                    <small>MAJOR UNKNOWNS</small>
                    <ul>{state.assessment.majorUnknowns.map((e, i) => <li key={i}>{e}</li>)}</ul>
                  </div>
                )}
                {state.assessment.strongestCounterargument && (
                  <div className="assess-block">
                    <small>STRONGEST COUNTERARGUMENT</small>
                    <p>{state.assessment.strongestCounterargument}</p>
                  </div>
                )}
              </>
            )}

            {/* Devil's Evidence */}
            {state.devilsEvidence.length > 0 && (
              <div className="devils-section">
                <small>DEVIL'S EVIDENCE</small>
                {state.devilsEvidence.map(dev => (
                  <div className="devil-card" key={dev.id}>
                    <span className="severity" style={{ color: dev.severity === "CRITICAL" ? "#d46a6a" : dev.severity === "HIGH" ? "#d4a96a" : "#8ea2ab" }}>
                      {dev.severity}
                    </span>
                    <p>{dev.explanation}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Contradictions */}
            {state.contradictions.length > 0 && (
              <div className="contradictions-section">
                <small>CONTRADICTIONS</small>
                {state.contradictions.map(con => (
                  <div className="con-card" key={con.id}>
                    <span className={`con-status ${con.status.toLowerCase()}`}>{con.status}</span>
                    <p>{con.description}</p>
                    {con.resolution && <p className="con-resolution">{con.resolution}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ─── User Intervention ─── */}
        {investigationId && (
          <section className="intervention-bar">
            <input
              type="text"
              value={intervention}
              onChange={(e) => setIntervention(e.target.value)}
              placeholder="Direct the investigation... (e.g., 'Follow the money' or 'Challenge the leading hypothesis')"
              className="intervention-input"
              onKeyDown={(e) => e.key === "Enter" && submitIntervention()}
            />
            <button onClick={submitIntervention} disabled={!intervention.trim()}>
              Direct
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
