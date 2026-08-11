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
  expectedEvidence: Array<{ id: string; description: string; status: string; evidenceId?: string }>;
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

// ─── Director types ──────────────────────────────────────────────────────
interface Prediction {
  id: string;
  hypothesisId: string;
  description: string;
  expectedResult: string;
  status: string;
  observedResult?: string;
  evidenceId?: string;
  createdAt: number;
}

interface EvidenceCluster {
  id: string;
  claimText: string;
  sourceIds: string[];
  rootSourceIds: string[];
  totalSources: number;
  independentRoots: number;
  contaminationRisk: string;
}

interface NarrativePattern {
  id: string;
  type: string;
  sourceIds: string[];
  pattern: string;
  riskLevel: string;
}

interface Entity {
  id: string;
  name: string;
  type: string;
  mentionedCount: number;
  sourceIds: string[];
}

interface CausalClaim {
  id: string;
  claimId: string;
  claimText: string;
  status: string;
  temporal?: string;
  mechanism?: string;
  doseResponse?: string;
}

interface AssessmentRevision {
  id: string;
  revisionNumber: number;
  previousAssessment: string;
  newAssessment: string;
  trigger: string;
  evidenceTrigger: string[];
  summary: string;
  agentsInvolved: string[];
  timestamp: number;
}

interface Scorecard {
  evidenceCoverage: number;
  sourceIndependence: number;
  contradictionResolution: number;
  hypothesisCoverage: number;
  adversarialCoverage: number;
  informationGaps: number;
  predictionTesting: number;
  researchDepth: number;
  details: {
    totalEvidence: number;
    totalSources: number;
    primarySources: number;
    independentRoots: number;
    totalContradictions: number;
    resolvedContradictions: number;
    totalHypotheses: number;
    testedHypotheses: number;
    totalPredictions: number;
    testedPredictions: number;
    confirmedPredictions: number;
    failedPredictions: number;
    adversarialIterations: number;
    resolvedChallenges: number;
    openGaps: number;
    criticalGaps: number;
    totalTasks: number;
    completedTasks: number;
  };
}

interface UserOverride {
  id: string;
  type: string;
  instruction: string;
  effects: string[];
  recordedAt: number;
}

interface ConvergenceCheck {
  overall: boolean;
  majorHypothesesTested: boolean;
  importantPredictionsTested: boolean;
  strongestCounterargumentsInvestigated: boolean;
  majorContradictionsAddressed: boolean;
  importantInformationGapsEvaluated: boolean;
  diminishingReturns: boolean;
  details: string[];
}

interface MindChangingEvidence {
  evidenceThatWouldChangeAssessment: string[];
  evidenceThatWouldStrengthenLeadingHypothesis: string[];
  evidenceThatWouldWeakenLeadingHypothesis: string[];
}

interface HypothesisCompetition {
  id: string;
  hypothesisA: string;
  hypothesisB: string;
  evidenceForA: string[];
  evidenceForB: string[];
  discriminatingQuestion: string;
  status: string;
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
  // Director data
  predictions?: Prediction[];
  failedPredictions?: Prediction[];
  evidenceClusters?: EvidenceCluster[];
  narrativePatterns?: NarrativePattern[];
  entities?: Entity[];
  causalClaims?: CausalClaim[];
  assessmentRevisions?: AssessmentRevision[];
  scorecard?: Scorecard | null;
  userOverrides?: UserOverride[];
  convergenceCheck?: ConvergenceCheck | null;
  investigationCycle?: number;
  maxCycles?: number;
  converged?: boolean;
  paused?: boolean;
  mindChangingEvidence?: MindChangingEvidence | null;
  hypothesisCompetitions?: HypothesisCompetition[];
}

// ─── Phase display ───────────────────────────────────────────────────────
const PHASE_ORDER = [
  "CREATED", "PREMISE_AUDIT", "QUESTION_DECOMPOSITION", "HYPOTHESIS_GENERATION",
  "RESEARCH_PLANNING", "INDEPENDENT_RESEARCH", "EVIDENCE_ANALYSIS", "SOURCE_ANALYSIS",
  "HYPOTHESIS_TESTING", "ADVERSARIAL_REVIEW", "DISAGREEMENT_REVIEW",
  "INFORMATION_GAP_ANALYSIS", "TARGETED_RESEARCH", "REASSESSMENT",
  "CONVERGENCE_REVIEW", "CONVERGED"
];

const SUPPORT_COLORS: Record<string, string> = {
  STRONG: "#65d8b0", MODERATE: "#c4d97a", WEAK: "#d4a96a",
  INSUFFICIENT_EVIDENCE: "#d46a6a", NONE: "#526972"
};

const PHASE_LABELS: Record<string, string> = {
  CREATED: "Created",
  PREMISE_AUDIT: "Premise Audit",
  QUESTION_DECOMPOSITION: "Decomposition",
  HYPOTHESIS_GENERATION: "Hypotheses",
  RESEARCH_PLANNING: "Planning",
  INDEPENDENT_RESEARCH: "Research",
  EVIDENCE_ANALYSIS: "Evidence",
  SOURCE_ANALYSIS: "Sources",
  HYPOTHESIS_TESTING: "Testing",
  ADVERSARIAL_REVIEW: "Adversarial",
  DISAGREEMENT_REVIEW: "Disagreements",
  INFORMATION_GAP_ANALYSIS: "Gap Analysis",
  TARGETED_RESEARCH: "Targeted",
  REASSESSMENT: "Reassessment",
  CONVERGENCE_REVIEW: "Convergence",
  CONVERGED: "Converged",
};

type TabType = "feed" | "hypotheses" | "evidence" | "sources" | "director" | "scorecard" | "revisions" | "assessment" | "capabilities";

// ─── Capability Types (Directive 06) ────────────────────────────────────
interface Capability {
  id: string;
  name: string;
  description: string;
  type: string;
  domain: string;
  capabilities: string[];
  trustLevel: string;
  status: string;
  costProfile: { financialCost: number; expectedEvidenceValue: string };
  performanceMetrics: { timesUsed: number; successfulRuns: number; failedRuns: number };
  createdAt: number;
  updatedAt: number;
}

interface CapabilityGap {
  id: string;
  investigationId: string;
  description: string;
  domain: string;
  type: string;
  importance: string;
  missingCapability: string;
  urgency: string;
  createdAt: number;
}

interface CapabilityEvent {
  id: string;
  eventType: string;
  message: string;
  capabilityId?: string;
  investigationId?: string;
  timestamp: number;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ─── Scorecard Bar Component ─────────────────────────────────────────────
function ScorecardBar({ score }: { score: number; label: string }) {
  const color = score >= 75 ? "#65d8b0" : score >= 50 ? "#c4d97a" : score >= 25 ? "#d4a96a" : "#d46a6a";
  return (
    <div className="scorecard-bar">
      <div className="scorecard-label">{label}</div>
      <div className="scorecard-track">
        <div className="scorecard-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <div className="scorecard-value" style={{ color }}>{score}%</div>
    </div>
  );
}

// ─── Convergence Checklist Component ─────────────────────────────────────
function ConvergenceChecklist({ check }: { check: ConvergenceCheck }) {
  const items = [
    { label: "Major hypotheses tested", passed: check.majorHypothesesTested },
    { label: "Important predictions tested", passed: check.importantPredictionsTested },
    { label: "Strongest counterarguments investigated", passed: check.strongestCounterargumentsInvestigated },
    { label: "Major contradictions addressed", passed: check.majorContradictionsAddressed },
    { label: "Important information gaps evaluated", passed: check.importantInformationGapsEvaluated },
    { label: "Diminishing returns", passed: check.diminishingReturns },
  ];
  return (
    <div className="convergence-checklist">
      <div className={`convergence-status ${check.overall ? "converged" : "not-converged"}`}>
        {check.overall ? "✓ PROVISIONAL CONVERGENCE" : "✗ NOT YET CONVERGED"}
      </div>
      {items.map((item, i) => (
        <div key={i} className={`checklist-item ${item.passed ? "passed" : "pending"}`}>
          <span className="check-icon">{item.passed ? "✓" : "○"}</span>
          <span>{item.label}</span>
        </div>
      ))}
      {check.details.length > 0 && (
        <div className="convergence-details">
          {check.details.map((d, i) => <p key={i}>{d}</p>)}
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────
function App() {
  const [investigationId, setInvestigationId] = useState<string | null>(null);
  const [question, setQuestion] = useState("Why is the United States building so many data centers?");
  const [events, setEvents] = useState<InvestigationEvent[]>([]);
  const [state, setState] = useState<InvestigationState | null>(null);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [intervention, setIntervention] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<TabType>("feed");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [capabilityGaps, setCapabilityGaps] = useState<CapabilityGap[]>([]);
  const [capabilityEvents, setCapabilityEvents] = useState<CapabilityEvent[]>([]);
  const [capFilter, setCapFilter] = useState<string>("all");
  const [mockMode, setMockMode] = useState(false);
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
        body: JSON.stringify({ question, forceMock: mockMode }),
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
            if (["CONVERGED", "CONVERGENCE_REVIEW"].includes(stateData.phase) && stateData.converged) {
              setRunning(false);
            }
          }
          if (costRes.ok) {
            setCost(await costRes.json());
          }
        } catch { /* poll errors are transient */ }
      }, 2000);

      (window as unknown as { __pollInterval?: ReturnType<typeof setInterval> }).__pollInterval = pollInterval;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start investigation");
      setRunning(false);
    }
  }, [question, mockMode]);

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

  // ─── Cleanup ─────────────────────────────────────────────────────────
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
  const directorEvents = events.filter(e =>
    e.type.startsWith("director_") || e.type.startsWith("next_action") ||
    e.type.startsWith("convergence") || e.type.startsWith("scorecard") ||
    e.type.startsWith("confirmation") || e.type.startsWith("evidence_cluster") ||
    e.type.startsWith("narrative") || e.type.startsWith("prediction") ||
    e.type.startsWith("hypothesis_competition") || e.type.startsWith("discriminating") ||
    e.type.startsWith("relationship") || e.type.startsWith("entity") ||
    e.type.startsWith("mind_changing") || e.type.startsWith("assessment_revision")
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">R</span>
          <div><strong>RUTHLESS</strong><span> INVESTIGATOR</span></div>
        </div>
        <div className="live">
          <i /> {running ? "LIVE INVESTIGATION" : state?.converged ? "CONVERGED" : "IDLE"}
          {state && !state.converged && state.phase === "CONVERGENCE_REVIEW" && " · PROVISIONAL"}
        </div>
        {cost && (
          <div className="budget">
            ${cost.spent.toFixed(2)} / ${cost.budget.toFixed(2)} · {cost.calls} calls
          </div>
        )}
        <label className="mock-toggle">
          <input type="checkbox" checked={mockMode} onChange={(e) => setMockMode(e.target.checked)} />
          Mock
        </label>
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
                <span>{PHASE_LABELS[phase] ?? phase.replace(/_/g, " ")}</span>
              </div>
            ))}
          </section>
        )}

        {/* ─── Investigation Stats ─── */}
        {state && (
          <section className="stats-row">
            <span><b>{state.hypotheses.length}</b> hypotheses</span>
            <span><b>{state.claims.length}</b> claims</span>
            <span><b>{state.evidence.length}</b> evidence</span>
            <span><b>{state.sources.length}</b> sources</span>
            <span><b>{state.sources.filter(s => s.isPrimary).length}</b> primary</span>
            <span><b>{state.contradictions.length}</b> contradictions</span>
            {state.predictions && <span><b>{state.predictions.length}</b> predictions</span>}
            {state.investigationCycle !== undefined && <span><b>{state.investigationCycle}</b>/{state.maxCycles ?? "?"} cycles</span>}
          </section>
        )}

        {/* ─── Tab Navigation ─── */}
        {state && (
          <nav className="tabs">
            {([
              ["feed", "Event Feed"],
              ["director", "Command Center"],
              ["hypotheses", "Hypotheses"],
              ["evidence", "Evidence"],
              ["sources", "Sources"],
              ["scorecard", "Scorecard"],
              ["revisions", "Revisions"],
              ["assessment", "Assessment"],
              ["capabilities", "Capabilities"],
            ] as [TabType, string][]).map(([tab, label]) => (
              <button
                key={tab}
                className={`tab ${selectedTab === tab ? "active" : ""}`}
                onClick={() => setSelectedTab(tab)}
              >
                {label}
                {tab === "director" && directorEvents.length > 0 && (
                  <span className="tab-badge">{directorEvents.length}</span>
                )}
                {tab === "revisions" && state.assessmentRevisions && state.assessmentRevisions.length > 0 && (
                  <span className="tab-badge">{state.assessmentRevisions.length}</span>
                )}
                {tab === "capabilities" && capabilities.length > 0 && (
                  <span className="tab-badge">{capabilities.length}</span>
                )}
              </button>
            ))}
          </nav>
        )}

        {/* ─── Event Feed Tab ─── */}
        {state && selectedTab === "feed" && (
          <section className="event-feed">
            {events.length === 0 && <p className="empty">Waiting for events...</p>}
            {events.slice(-80).reverse().map(event => (
              <div className={`event ${event.type.includes("error") || event.type.includes("fail") ? "event-error" : ""}`} key={event.id}>
                <span className="event-time">{timeAgo(event.timestamp)}</span>
                <span className="event-type">{event.type}</span>
                {event.agentRole && <span className="event-agent">{event.agentRole}</span>}
                <span className="event-msg">{event.message}</span>
              </div>
            ))}
          </section>
        )}

        {/* ─── Command Center Tab (Director Transparency) ─── */}
        {state && selectedTab === "director" && (
          <section className="director-panel">
            {/* Convergence Status */}
            {state.convergenceCheck && (
              <div className="director-section">
                <h3>Convergence Status</h3>
                <ConvergenceChecklist check={state.convergenceCheck} />
              </div>
            )}

            {/* Mind-Changing Evidence */}
            {state.mindChangingEvidence && (
              <div className="director-section">
                <h3>Evidence That Would Change The Assessment</h3>
                <div className="mind-changing">
                  {state.mindChangingEvidence.evidenceThatWouldChangeAssessment?.map((e, i) => (
                    <div className="mc-item critical" key={i}>
                      <span className="mc-icon">!</span>
                      <span>{e}</span>
                    </div>
                  ))}
                  {state.mindChangingEvidence.evidenceThatWouldStrengthenLeadingHypothesis?.map((e, i) => (
                    <div className="mc-item strengthen" key={`s${i}`}>
                      <span className="mc-icon">+</span>
                      <span>{e}</span>
                    </div>
                  ))}
                  {state.mindChangingEvidence.evidenceThatWouldWeakenLeadingHypothesis?.map((e, i) => (
                    <div className="mc-item weaken" key={`w${i}`}>
                      <span className="mc-icon">−</span>
                      <span>{e}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Source Contamination */}
            {state.evidenceClusters && state.evidenceClusters.length > 0 && (
              <div className="director-section">
                <h3>Source Contamination Map</h3>
                <p className="section-desc">Evidence that appears independent but traces to the same root source</p>
                {state.evidenceClusters.map(cluster => (
                  <div className={`cluster-card ${cluster.contaminationRisk.toLowerCase()}`} key={cluster.id}>
                    <div className="cluster-header">
                      <span className="cluster-risk">{cluster.contaminationRisk} contamination</span>
                      <span className="cluster-counts">{cluster.independentRoots} root / {cluster.totalSources} sources</span>
                    </div>
                    <p className="cluster-claim">"{cluster.claimText}"</p>
                    <div className="cluster-sources">
                      {cluster.sourceIds.map(sid => {
                        const src = state.sources.find(s => s.id === sid);
                        return src ? <span className="cluster-source" key={sid}>{src.title}</span> : null;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Narrative Patterns */}
            {state.narrativePatterns && state.narrativePatterns.length > 0 && (
              <div className="director-section">
                <h3>Narrative Convergence Detection</h3>
                <p className="section-desc">Identical or near-identical wording appearing across supposedly independent sources</p>
                {state.narrativePatterns.map(pat => (
                  <div className={`narrative-card ${pat.riskLevel.toLowerCase()}`} key={pat.id}>
                    <span className="narrative-type">{pat.type.replace(/_/g, " ")}</span>
                    <p className="narrative-pattern">"{pat.pattern}"</p>
                    <span className="narrative-risk">{pat.riskLevel} risk</span>
                    <div className="narrative-sources">
                      {pat.sourceIds.map(sid => {
                        const src = state.sources.find(s => s.id === sid);
                        return src ? <span key={sid}>{src.title}</span> : null;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Predictions */}
            {state.predictions && state.predictions.length > 0 && (
              <div className="director-section">
                <h3>Failed Predictions</h3>
                <p className="section-desc">When a hypothesis makes a prediction and the evidence contradicts it</p>
                {state.predictions.filter(p => p.status === "FAILED").length === 0 && (
                  <p className="empty">No failed predictions — all confirmed or inconclusive so far.</p>
                )}
                {state.predictions.filter(p => p.status === "FAILED").map(pred => (
                  <div className="prediction-card failed" key={pred.id}>
                    <span className="pred-status">FAILED</span>
                    <p><strong>{pred.description}</strong></p>
                    <p className="pred-expected">Expected: {pred.expectedResult}</p>
                    {pred.observedResult && <p className="pred-observed">Observed: {pred.observedResult}</p>}
                  </div>
                ))}
                <details>
                  <summary>All predictions ({state.predictions.length})</summary>
                  {state.predictions.map(pred => (
                    <div className={`prediction-card ${pred.status.toLowerCase()}`} key={pred.id}>
                      <span className="pred-status">{pred.status}</span>
                      <p><strong>{pred.description}</strong></p>
                    </div>
                  ))}
                </details>
              </div>
            )}

            {/* Hypothesis Competition */}
            {state.hypothesisCompetitions && state.hypothesisCompetitions.length > 0 && (
              <div className="director-section">
                <h3>Hypothesis Competition</h3>
                <p className="section-desc">Discriminating evidence that would favor one hypothesis over another</p>
                {state.hypothesisCompetitions.map(comp => (
                  <div className="competition-card" key={comp.id}>
                    <div className="comp-vs">
                      <span>{comp.hypothesisA}</span>
                      <span className="vs">vs</span>
                      <span>{comp.hypothesisB}</span>
                    </div>
                    <p className="comp-question">Discriminating question: {comp.discriminatingQuestion}</p>
                    <span className="comp-status">{comp.status}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Causal Claims */}
            {state.causalClaims && state.causalClaims.length > 0 && (
              <div className="director-section">
                <h3>Causal Claim Review</h3>
                <p className="section-desc">Causal claims require temporal ordering, mechanism, and dose-response evidence</p>
                {state.causalClaims.map(cc => (
                  <div className={`causal-card ${cc.status.toLowerCase()}`} key={cc.id}>
                    <span className="causal-status">{cc.status}</span>
                    <p><strong>"{cc.claimText}"</strong></p>
                    <div className="causal-checks">
                      <span className={cc.temporal ? "check-passed" : "check-pending"}>Temporal: {cc.temporal ?? "pending"}</span>
                      <span className={cc.mechanism ? "check-passed" : "check-pending"}>Mechanism: {cc.mechanism ?? "pending"}</span>
                      <span className={cc.doseResponse ? "check-passed" : "check-pending"}>Dose-response: {cc.doseResponse ?? "pending"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* User Overrides */}
            {state.userOverrides && state.userOverrides.length > 0 && (
              <div className="director-section">
                <h3>Your Directives (Persistent Record)</h3>
                {state.userOverrides.map(ov => (
                  <div className="override-card" key={ov.id}>
                    <span className="override-type">{ov.type.replace(/_/g, " ")}</span>
                    <p className="override-instruction">"{ov.instruction}"</p>
                    <div className="override-effects">
                      {ov.effects.map((eff, i) => <span key={i}>{eff}</span>)}
                    </div>
                    <small>{timeAgo(ov.recordedAt)}</small>
                  </div>
                ))}
              </div>
            )}

            {/* Director Decision Feed */}
            <div className="director-section">
              <h3>Director Decisions</h3>
              <p className="section-desc">Every decision the Director made, what it considered, and why it chose that path</p>
              {directorEvents.length === 0 && <p className="empty">No Director events yet...</p>}
              {directorEvents.slice(-30).reverse().map(event => (
                <div className="director-event" key={event.id}>
                  <span className="event-type">{event.type.replace(/_/g, " ")}</span>
                  <span className="event-msg">{event.message}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── Hypotheses Tab ─── */}
        {state && selectedTab === "hypotheses" && (
          <section className="hypotheses-panel">
            {state.hypotheses.map(hyp => (
              <div className="hyp-card" key={hyp.id}>
                <div className="hyp-header">
                  <span className="hyp-id">{hyp.id}</span>
                  <span className="hyp-support" style={{ color: SUPPORT_COLORS[hyp.supportLevel] || "#526972" }}>
                    {hyp.supportLevel.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="hyp-statement">{hyp.statement}</p>
                <div className="hyp-evidence">
                  <span className="ev-count">{hyp.supportingEvidence.length} supporting</span>
                  <span className="ev-count">{hyp.contradictingEvidence.length} contradicting</span>
                  <span className="ev-count">{hyp.claims.length} linked claims</span>
                </div>
                {hyp.expectedEvidence.length > 0 && (
                  <div className="expected-evidence">
                    <small>EXPECTED EVIDENCE</small>
                    {hyp.expectedEvidence.map(exp => (
                      <div className={`exp-ev ${exp.status.toLowerCase()}`} key={exp.id}>
                        <span className="exp-status">{exp.status === "FOUND" ? "✓" : exp.status === "MISSING" ? "✗" : exp.status === "NEGATIVE" ? "!" : "?"}</span>
                        <span>{exp.description}</span>
                      </div>
                    ))}
                  </div>
                )}
                {hyp.iterations.length > 0 && (
                  <details>
                    <summary>Epistemic history ({hyp.iterations.length} iterations)</summary>
                    {hyp.iterations.map((it, i) => (
                      <div className="iteration" key={i}>
                        <span>{it.previousSupport} → {it.newSupport}</span>
                        <p>{it.reason}</p>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ─── Evidence Tab ─── */}
        {state && selectedTab === "evidence" && (
          <section className="evidence-panel">
            {state.evidence.map(ev => {
              const source = state.sources.find(s => s.id === ev.sourceId);
              return (
                <div className="ev-card" key={ev.id}>
                  <div className="ev-header">
                    <span className="ev-type">{ev.type}</span>
                    {ev.independentConfirmation && <span className="ev-independent">✓ Independent</span>}
                    {source && <span className="ev-source">{source.title}</span>}
                  </div>
                  <p className="ev-text">{ev.text}</p>
                </div>
              );
            })}
          </section>
        )}

        {/* ─── Sources Tab ─── */}
        {state && selectedTab === "sources" && (
          <section className="sources-panel">
            {state.sources.map(src => (
              <div className={`src-card ${src.isPrimary ? "primary" : ""}`} key={src.id}>
                <div className="src-header">
                  <span className="src-type">{src.sourceType.replace(/_/g, " ")}</span>
                  {src.isPrimary && <span className="src-primary">PRIMARY</span>}
                </div>
                <p className="src-title">{src.title}</p>
                {src.url && <a href={src.url} target="_blank" rel="noopener" className="src-url">{src.url}</a>}
                <div className="src-quality">
                  <span>A: {Math.round(src.quality.authority * 100)}%</span>
                  <span>P: {Math.round(src.quality.proximity * 100)}%</span>
                  <span>I: {Math.round(src.quality.independence * 100)}%</span>
                  <span>R: {Math.round(src.quality.recency * 100)}%</span>
                </div>
                {src.cites.length > 0 && (
                  <div className="src-cites">
                    <small>CITES:</small>
                    {src.cites.map(cid => {
                      const cited = state.sources.find(s => s.id === cid);
                      return cited ? <span key={cid}>{cited.title}</span> : <span key={cid}>{cid}</span>;
                    })}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ─── Scorecard Tab ─── */}
        {state && selectedTab === "scorecard" && (
          <section className="scorecard-panel">
            {state.scorecard ? (
              <>
                <div className="scorecard-grid">
                  <ScorecardBar score={state.scorecard.evidenceCoverage} label="Evidence Coverage" />
                  <ScorecardBar score={state.scorecard.sourceIndependence} label="Source Independence" />
                  <ScorecardBar score={state.scorecard.contradictionResolution} label="Contradiction Resolution" />
                  <ScorecardBar score={state.scorecard.hypothesisCoverage} label="Hypothesis Coverage" />
                  <ScorecardBar score={state.scorecard.adversarialCoverage} label="Adversarial Coverage" />
                  <ScorecardBar score={state.scorecard.informationGaps} label="Information Gaps" />
                  <ScorecardBar score={state.scorecard.predictionTesting} label="Prediction Testing" />
                  <ScorecardBar score={state.scorecard.researchDepth} label="Research Depth" />
                </div>
                <div className="scorecard-details">
                  <h4>Details</h4>
                  <div className="details-grid">
                    <div><span>Total Evidence</span><b>{state.scorecard.details.totalEvidence}</b></div>
                    <div><span>Total Sources</span><b>{state.scorecard.details.totalSources}</b></div>
                    <div><span>Primary Sources</span><b>{state.scorecard.details.primarySources}</b></div>
                    <div><span>Independent Roots</span><b>{state.scorecard.details.independentRoots}</b></div>
                    <div><span>Contradictions</span><b>{state.scorecard.details.totalContradictions}</b></div>
                    <div><span>Resolved</span><b>{state.scorecard.details.resolvedContradictions}</b></div>
                    <div><span>Hypotheses</span><b>{state.scorecard.details.totalHypotheses}</b></div>
                    <div><span>Tested</span><b>{state.scorecard.details.testedHypotheses}</b></div>
                    <div><span>Predictions</span><b>{state.scorecard.details.totalPredictions}</b></div>
                    <div><span>Confirmed</span><b>{state.scorecard.details.confirmedPredictions}</b></div>
                    <div><span>Failed</span><b>{state.scorecard.details.failedPredictions}</b></div>
                    <div><span>Adversarial Iterations</span><b>{state.scorecard.details.adversarialIterations}</b></div>
                    <div><span>Open Gaps</span><b>{state.scorecard.details.openGaps}</b></div>
                    <div><span>Critical Gaps</span><b>{state.scorecard.details.criticalGaps}</b></div>
                    <div><span>Tasks Completed</span><b>{state.scorecard.details.completedTasks}/{state.scorecard.details.totalTasks}</b></div>
                  </div>
                </div>
                <p className="scorecard-note">
                  These dimensions measure investigation quality, not truth. A high scorecard means the investigation
                  was thorough, not that the conclusion is correct.
                </p>
              </>
            ) : (
              <p className="empty">Scorecard not yet computed...</p>
            )}
          </section>
        )}

        {/* ─── Revisions Tab ─── */}
        {state && selectedTab === "revisions" && (
          <section className="revisions-panel">
            <p className="section-desc">Every time the assessment changed, what triggered it, and how it shifted</p>
            {(!state.assessmentRevisions || state.assessmentRevisions.length === 0) && (
              <p className="empty">No assessment revisions yet...</p>
            )}
            {state.assessmentRevisions?.map(rev => (
              <div className="revision-card" key={rev.id}>
                <div className="revision-header">
                  <span className="revision-num">Revision #{rev.revisionNumber}</span>
                  <span className="revision-time">{timeAgo(rev.timestamp)}</span>
                </div>
                <div className="revision-shift">
                  <span className="rev-prev">{rev.previousAssessment}</span>
                  <span className="rev-arrow">→</span>
                  <span className="rev-new">{rev.newAssessment}</span>
                </div>
                <p className="revision-trigger"><strong>Trigger:</strong> {rev.trigger}</p>
                <p className="revision-summary">{rev.summary}</p>
                {rev.evidenceTrigger.length > 0 && (
                  <div className="revision-evidence">
                    <small>Evidence involved:</small>
                    {rev.evidenceTrigger.map((e, i) => <span key={i}>{e}</span>)}
                  </div>
                )}
                <div className="revision-agents">
                  <small>Agents:</small>
                  {rev.agentsInvolved.map(a => <span key={a}>{a}</span>)}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ─── Assessment Tab ─── */}
        {state && selectedTab === "assessment" && (
          <section className="assessment-panel">
            {!state.assessment && <p className="empty">Assessment not yet generated...</p>}
            {state.assessment && (
              <>
                <div className="assess-confidence">
                  <span className="assess-label">CONFIDENCE</span>
                  <span className="assess-level" style={{ color: SUPPORT_COLORS[state.assessment.confidenceLevel] || "#526972" }}>
                    {state.assessment.confidenceLevel.replace(/_/g, " ")}
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
                  <div className="assess-block"><small>SUPPORTING EVIDENCE</small><ul>{state.assessment.supportingEvidence.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
                )}
                {state.assessment.contradictingEvidence && state.assessment.contradictingEvidence.length > 0 && (
                  <div className="assess-block"><small>CONTRADICTING EVIDENCE</small><ul>{state.assessment.contradictingEvidence.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
                )}
                {state.assessment.majorAssumptions && state.assessment.majorAssumptions.length > 0 && (
                  <div className="assess-block"><small>MAJOR ASSUMPTIONS</small><ul>{state.assessment.majorAssumptions.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
                )}
                {state.assessment.majorUnknowns && state.assessment.majorUnknowns.length > 0 && (
                  <div className="assess-block"><small>MAJOR UNKNOWNS</small><ul>{state.assessment.majorUnknowns.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
                )}
                {state.assessment.strongestCounterargument && (
                  <div className="assess-block"><small>STRONGEST COUNTERARGUMENT</small><p>{state.assessment.strongestCounterargument}</p></div>
                )}
              </>
            )}
            {state.devilsEvidence.length > 0 && (
              <div className="devils-section">
                <small>DEVIL'S EVIDENCE</small>
                {state.devilsEvidence.map(dev => (
                  <div className="devil-card" key={dev.id}>
                    <span className="severity" style={{ color: dev.severity === "CRITICAL" ? "#d46a6a" : dev.severity === "HIGH" ? "#d4a96a" : "#8ea2ab" }}>{dev.severity}</span>
                    <p>{dev.explanation}</p>
                  </div>
                ))}
              </div>
            )}
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
            <button onClick={submitIntervention} disabled={!intervention.trim()}>Direct</button>
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
