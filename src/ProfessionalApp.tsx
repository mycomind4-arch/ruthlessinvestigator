import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, ChevronRight,
  CircleDot, Clock3, Command, Database, FileSearch, GitBranch, Globe2, Layers3,
  Pause, Play, RefreshCw, Search, Send, ShieldCheck, Sparkles, Target, Users,
  Waypoints, XCircle, Zap,
} from "lucide-react";
import "./professional.css";

type AnyRecord = Record<string, any>;

type Agent = {
  id: string; name: string; role: string; status: "working" | "ready" | "idle";
  symbol: string; color: string; rank: string; specialty: string;
};

const AGENTS: Agent[] = [
  { id: "director", name: "Axiom", role: "Investigation Director", status: "working", symbol: "AX", color: "#7c9cff", rank: "MASTER", specialty: "Next-action selection" },
  { id: "premise", name: "Vera", role: "Premise Auditor", status: "ready", symbol: "VR", color: "#65d8b0", rank: "SPECIALIST", specialty: "Assumption testing" },
  { id: "primary", name: "Atlas", role: "Primary Source Researcher", status: "working", symbol: "AT", color: "#d7a86e", rank: "SENIOR", specialty: "Government & filings" },
  { id: "osint", name: "Trace", role: "OSINT Researcher", status: "working", symbol: "TR", color: "#8d7cff", rank: "SPECIALIST", specialty: "Open-source intelligence" },
  { id: "evidence", name: "Ledger", role: "Evidence Analyst", status: "ready", symbol: "LG", color: "#58b7d6", rank: "SENIOR", specialty: "Atomic evidence" },
  { id: "skeptic", name: "Null", role: "Skeptic", status: "ready", symbol: "NL", color: "#ef7777", rank: "MASTER", specialty: "Adversarial review" },
  { id: "alternative", name: "Mosaic", role: "Alternative Explanations", status: "idle", symbol: "MO", color: "#c68cff", rank: "SPECIALIST", specialty: "Hypothesis competition" },
  { id: "synthesis", name: "Meridian", role: "Synthesis Agent", status: "ready", symbol: "MD", color: "#61c8a6", rank: "SENIOR", specialty: "Assessment" },
];

const PHASES = [
  ["PREMISE_AUDIT", "Premise"], ["QUESTION_DECOMPOSITION", "Decompose"], ["HYPOTHESIS_GENERATION", "Hypotheses"],
  ["RESEARCH_PLANNING", "Plan"], ["INDEPENDENT_RESEARCH", "Research"], ["EVIDENCE_ANALYSIS", "Evidence"],
  ["SOURCE_ANALYSIS", "Sources"], ["HYPOTHESIS_TESTING", "Test"], ["ADVERSARIAL_REVIEW", "Challenge"],
  ["DISAGREEMENT_REVIEW", "Dispute"], ["INFORMATION_GAP_ANALYSIS", "Gaps"], ["TARGETED_RESEARCH", "Target"],
  ["REASSESSMENT", "Reassess"], ["CONVERGENCE_REVIEW", "Converge"], ["CONVERGED", "Done"],
];

const SAMPLE_QUESTION = "Why is the United States building so many data centers?";

function initials(name: string) { return name.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase(); }
function ago(ts?: number) {
  if (!ts) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}
function clamp(v: any, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback; }

function Avatar({ agent, large = false }: { agent: Agent; large?: boolean }) {
  return <div className={`avatar ${large ? "avatar-lg" : ""}`} style={{ "--avatar": agent.color } as React.CSSProperties}><span>{agent.symbol}</span></div>;
}

function Metric({ label, value, icon: Icon, tone = "neutral" }: { label: string; value: string | number; icon: any; tone?: string }) {
  return <div className={`metric metric-${tone}`}><div className="metric-icon"><Icon size={16}/></div><div><div className="metric-value">{value}</div><div className="metric-label">{label}</div></div></div>;
}

function Progress({ value, label }: { value: number; label: string }) {
  return <div className="progress-row"><div className="progress-head"><span>{label}</span><strong>{Math.round(clamp(value))}%</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${clamp(value)}%` }}/></div></div>;
}

export default function ProfessionalApp() {
  const [question, setQuestion] = useState(SAMPLE_QUESTION);
  const [investigationId, setInvestigationId] = useState<string | null>(null);
  const [state, setState] = useState<AnyRecord | null>(null);
  const [events, setEvents] = useState<AnyRecord[]>([]);
  const [cost, setCost] = useState<AnyRecord | null>(null);
  const [tab, setTab] = useState("command");
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [budget, setBudget] = useState(10);
  const [intervention, setIntervention] = useState("");
  const [error, setError] = useState("");
  const [booting, setBooting] = useState(false);

  const load = useCallback(async (id: string) => {
    try {
      const [s, e, c] = await Promise.all([
        fetch(`/api/investigations/${id}`), fetch(`/api/investigations/${id}/events`), fetch(`/api/investigations/${id}/cost`),
      ]);
      if (s.ok) setState(await s.json());
      if (e.ok) setEvents(await e.json());
      if (c.ok) setCost(await c.json());
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    if (!investigationId) return;
    load(investigationId);
    const timer = window.setInterval(() => load(investigationId), 1800);
    return () => window.clearInterval(timer);
  }, [investigationId, load]);

  useEffect(() => {
    if (!state) return;
    setRunning(!["CONVERGED", "FAILED"].includes(state.phase) && !state.isPaused && !state.paused);
    setPaused(Boolean(state.isPaused || state.paused));
  }, [state]);

  const start = async () => {
    if (!question.trim() || booting) return;
    setError(""); setBooting(true); setState(null); setEvents([]); setCost(null);
    try {
      const response = await fetch("/api/investigations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question.trim(), budgetUSD: budget, mode: "STANDARD" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start investigation");
      setInvestigationId(data.id); setTab("command");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start investigation"); }
    finally { setBooting(false); }
  };

  const action = async (endpoint: string, body?: AnyRecord) => {
    if (!investigationId) return;
    try {
      await fetch(`/api/investigations/${investigationId}/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      await load(investigationId);
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
  };

  const sendIntervention = async () => {
    if (!intervention.trim()) return;
    await action("intervene", { instruction: intervention.trim() });
    setIntervention("");
  };

  const score = state?.scorecard || {};
  const hypotheses = state?.hypotheses || [];
  const sources = state?.sources || [];
  const evidence = state?.evidence || [];
  const contradictions = state?.contradictions || [];
  const tasks = state?.missions || state?.researchTasks || [];
  const currentTask = tasks.find((x: AnyRecord) => ["PENDING", "RUNNING", "ACTIVE"].includes(String(x.status || "").toUpperCase())) || tasks[tasks.length - 1];
  const assessment = state?.assessment;
  const nextReason = currentTask?.whyCreated || currentTask?.reason || currentTask?.description || "The Director is evaluating the highest-impact unresolved uncertainty.";
  const phaseIndex = Math.max(0, PHASES.findIndex(([p]) => p === state?.phase));

  const tabs = [
    ["command", "Command Center", Command], ["evidence", "Evidence", Database], ["hypotheses", "Hypotheses", Target],
    ["sources", "Sources", Globe2], ["agents", "Agents", Users], ["activity", "Activity", Activity], ["revisions", "Revisions", GitBranch],
  ] as const;

  return <div className="ri-shell">
    <aside className="ri-sidebar">
      <div className="brand-block"><div className="brand-glyph"><span>R</span></div><div><div className="brand-name">RUTHLESS</div><div className="brand-sub">INVESTIGATOR</div></div></div>
      <div className="sidebar-section"><div className="sidebar-label">WORKSPACE</div><button className="new-case" onClick={() => { setInvestigationId(null); setState(null); setEvents([]); }}><Sparkles size={16}/> New investigation <span>⌘N</span></button></div>
      <nav className="side-nav">{tabs.slice(0, 1).map(([id, label, Icon]) => <button key={id} className="side-item active"><Icon size={17}/>{label}</button>)}<div className="sidebar-label nav-label">INVESTIGATION</div>{tabs.slice(1).map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`side-item ${tab === id ? "active" : ""}`}><Icon size={17}/>{label}{id === "evidence" && evidence.length > 0 ? <b>{evidence.length}</b> : null}</button>)}</nav>
      <div className="sidebar-bottom"><div className="institution-card"><div className="institution-orbit"><BrainCircuit size={20}/></div><div><strong>Investigation Council</strong><span>Institutional reasoning layer</span></div></div><div className="system-status"><span className="status-dot"/> Providers online <span className="status-count">{state ? "LIVE" : "READY"}</span></div></div>
    </aside>

    <main className="ri-main">
      <header className="top-header"><div><div className="eyebrow">INVESTIGATION COMMAND CENTER</div><h1>{state?.question || "Start an investigation"}</h1></div><div className="header-actions"><div className="budget-control"><span>BUDGET</span><input type="number" min="1" max="1000" value={budget} onChange={e => setBudget(Number(e.target.value))}/><span>USD</span></div>{investigationId && <><button className="icon-btn" title="Refresh" onClick={() => load(investigationId)}><RefreshCw size={17}/></button>{paused ? <button className="control-btn" onClick={() => action("resume")}><Play size={15}/> Resume</button> : <button className="control-btn" onClick={() => action("pause")}><Pause size={15}/> Pause</button>}</>}</div></header>

      {!investigationId && <section className="launch-card"><div className="launch-glow"/><div className="launch-copy"><div className="launch-kicker"><Zap size={15}/> ADAPTIVE INVESTIGATION ENGINE</div><h2>Ask a question.<br/><span>We will determine what to investigate next.</span></h2><p>The Council audits the premise, generates competing explanations, gathers primary evidence, attacks its own conclusions, and preserves every revision.</p></div><div className="launch-form"><textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder="What do you want investigated?"/><div className="launch-footer"><span><ShieldCheck size={14}/> Evidence-first · provenance preserved · disagreement retained</span><button className="launch-btn" disabled={booting || !question.trim()} onClick={start}>{booting ? "Initializing…" : "Launch investigation"}<ArrowRight size={16}/></button></div></div></section>}

      {error && <div className="error-banner"><AlertTriangle size={16}/>{error}<button onClick={() => setError("")}><XCircle size={15}/></button></div>}

      {state && <>
        <div className="phase-strip">{PHASES.map(([phase, label], i) => <div key={phase} className={`phase-node ${i < phaseIndex ? "done" : ""} ${i === phaseIndex ? "current" : ""}`}><span className="phase-node-dot">{i < phaseIndex ? "✓" : i + 1}</span><span>{label}</span></div>)}</div>
        <div className="metrics-grid"><Metric icon={Database} label="Atomic evidence" value={evidence.length} tone="green"/><Metric icon={Globe2} label="Sources" value={sources.length}/><Metric icon={Target} label="Hypotheses" value={hypotheses.length}/><Metric icon={AlertTriangle} label="Contradictions" value={contradictions.length} tone={contradictions.length ? "amber" : "neutral"}/><Metric icon={Zap} label="AI spend" value={`$${Number(cost?.spent ?? state.budget?.spentUSD ?? 0).toFixed(2)}`} tone="purple"/><Metric icon={Clock3} label="Cycle" value={`${state.investigationCycle ?? 0}/${state.maxCycles ?? "—"}`}/></div>

        <section className="why-next"><div className="why-icon"><ArrowRight size={19}/></div><div className="why-content"><div className="section-eyebrow">WHY ARE WE DOING THIS NEXT?</div><h3>{currentTask?.title || currentTask?.description || "Evaluate the highest-impact unresolved uncertainty"}</h3><p>{nextReason}</p></div><div className="why-meta"><span className="priority-pill">{String(currentTask?.priority || "HIGH").toUpperCase()} PRIORITY</span><span>Expected impact <b>{currentTask?.expectedInformationGain || currentTask?.expectedImpact || "HIGH"}</b></span></div></section>

        <div className="content-grid">
          <section className="main-panel">
            <div className="panel-tabs">{tabs.map(([id, label, Icon]) => <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}><Icon size={15}/>{label}</button>)}</div>
            <div className="panel-body">
              {tab === "command" && <CommandView state={state} score={score} assessment={assessment} onAction={action}/>} 
              {tab === "evidence" && <EvidenceView evidence={evidence} sources={sources}/>} 
              {tab === "hypotheses" && <HypothesesView hypotheses={hypotheses}/>} 
              {tab === "sources" && <SourcesView sources={sources} clusters={state.evidenceClusters || []}/>} 
              {tab === "agents" && <AgentsView/>}
              {tab === "activity" && <ActivityView events={events}/>} 
              {tab === "revisions" && <RevisionsView revisions={state.assessmentRevisions || []}/>} 
            </div>
          </section>
          <aside className="right-rail">
            <section className="rail-card assessment-card"><div className="rail-head"><span>CURRENT ASSESSMENT</span><span className={`confidence ${String(assessment?.confidenceLevel || "UNRESOLVED").toLowerCase()}`}>{assessment?.confidenceLevel || "UNRESOLVED"}</span></div><h3>{assessment?.summary || "The Council has not reached an assessment yet."}</h3>{assessment?.strongestCounterargument && <div className="counterargument"><span>STRONGEST COUNTERARGUMENT</span><p>{assessment.strongestCounterargument}</p></div>}<button className="text-btn" onClick={() => setTab("revisions")}>View assessment history <ChevronRight size={14}/></button></section>
            <section className="rail-card"><div className="rail-head"><span>INVESTIGATION HEALTH</span><span className="health-dot"/></div><Progress label="Evidence coverage" value={score.evidenceCoverage}/><Progress label="Source independence" value={score.sourceIndependence}/><Progress label="Hypothesis coverage" value={score.hypothesisCoverage}/><Progress label="Adversarial review" value={score.adversarialCoverage}/><Progress label="Prediction testing" value={score.predictionTesting}/><Progress label="Research depth" value={score.researchDepth}/></section>
            <section className="rail-card"><div className="rail-head"><span>ACTIVE COUNCIL</span><span>{AGENTS.filter(a => a.status === "working").length} working</span></div><div className="agent-stack">{AGENTS.slice(0, 5).map(a => <div className="agent-row" key={a.id}><Avatar agent={a}/><div className="agent-copy"><strong>{a.name}</strong><span>{a.role}</span></div><span className={`agent-status ${a.status}`}><i/>{a.status}</span></div>)}</div><button className="text-btn" onClick={() => setTab("agents")}>Open agent registry <ChevronRight size={14}/></button></section>
          </aside>
        </div>

        <section className="intervention"><div className="intervention-icon"><Command size={17}/></div><input value={intervention} onChange={e => setIntervention(e.target.value)} onKeyDown={e => { if (e.key === "Enter") sendIntervention(); }} placeholder="Direct the investigation… e.g. Follow the money, find primary evidence, try to disprove this"/><button onClick={sendIntervention} disabled={!intervention.trim()}><Send size={16}/></button></section>
      </>}
    </main>
  </div>;
}

function CommandView({ state, score, assessment, onAction }: { state: AnyRecord; score: AnyRecord; assessment: AnyRecord; onAction: (x: string, b?: AnyRecord) => void }) {
  const convergence = state.convergenceCheck;
  const mind = state.mindChangingEvidence || [];
  const gaps = state.informationGaps || [];
  return <div className="command-view">
    <div className="command-hero"><div><div className="section-eyebrow">DIRECTOR DECISION LOGIC</div><h2>{state.phase?.replaceAll("_", " ")}</h2><p>The Director continuously reallocates research toward evidence most capable of changing the current assessment.</p></div><div className="cycle-orb"><span>{state.investigationCycle ?? 0}</span><small>CYCLE</small></div></div>
    <div className="two-col"><div className="inner-card"><div className="inner-head"><span>WHAT COULD CHANGE OUR MIND?</span><Target size={15}/></div>{(mind.evidenceThatWouldChangeAssessment || mind || []).slice(0, 5).map((x: any, i: number) => <div className="mind-row" key={i}><span>↯</span>{typeof x === "string" ? x : x.description || x.statement}</div>)}{!mind.length && <div className="empty-state">No mind-changing evidence requirements recorded yet.</div>}</div><div className="inner-card"><div className="inner-head"><span>INFORMATION GAPS</span><FileSearch size={15}/></div>{gaps.slice(0, 5).map((g: any, i: number) => <div className="gap-row" key={i}><div><strong>{g.description || g.question}</strong><span>{g.importance || "OPEN"}</span></div><button onClick={() => onAction("intervene", { instruction: `Investigate this information gap: ${g.description || g.question}` })}><ArrowRight size={14}/></button></div>)}{!gaps.length && <div className="empty-state">No unresolved information gaps are currently recorded.</div>}</div></div>
    <div className="inner-card"><div className="inner-head"><span>CONVERGENCE REVIEW</span><span className={convergence?.overall ? "green-text" : "amber-text"}>{convergence?.overall ? "PROVISIONAL CONVERGENCE" : "IN PROGRESS"}</span></div><div className="check-grid">{[["Hypotheses tested", convergence?.majorHypothesesTested],["Predictions tested", convergence?.importantPredictionsTested],["Counterarguments", convergence?.strongestCounterargumentsInvestigated],["Contradictions", convergence?.majorContradictionsAddressed],["Information gaps", convergence?.importantInformationGapsEvaluated],["Diminishing returns", convergence?.diminishingReturns]].map(([l,v]) => <div className={v ? "check passed" : "check"} key={String(l)}>{v ? <CheckCircle2 size={16}/> : <CircleDot size={16}/>}<span>{l}</span></div>)}</div></div>
    <div className="inner-card"><div className="inner-head"><span>MODEL DISAGREEMENT</span><span>{(state.disagreements || []).length} disputes</span></div>{(state.disagreements || []).slice(0, 4).map((d: any) => <div className="dispute-row" key={d.id}><AlertTriangle size={15}/><div><strong>{d.claim || d.disputedClaim || "Disputed claim"}</strong><span>{d.resolutionStatus || d.status || "UNRESOLVED"}</span></div></div>)}{!(state.disagreements || []).length && <div className="empty-state">No unresolved model disagreements.</div>}</div>
  </div>;
}

function EvidenceView({ evidence, sources }: { evidence: AnyRecord[]; sources: AnyRecord[] }) { const sourceMap = useMemo(() => new Map(sources.map(s => [s.id, s])), [sources]); return <div className="list-view"><div className="list-title"><div><span className="section-eyebrow">ATOMIC EVIDENCE</span><h2>{evidence.length} evidence items</h2></div><span className="soft-pill">Provenance required</span></div>{evidence.length ? evidence.map((e: any) => <article className="evidence-row" key={e.id}><div className="evidence-marker">{e.type?.slice(0, 2) || "EV"}</div><div className="evidence-main"><p>{e.text}</p><div><span>{e.type || "UNKNOWN"}</span><span>Source: {sourceMap.get(e.sourceId)?.title || e.sourceId || "Unlinked"}</span>{e.independentConfirmation && <span className="green-text">Independent confirmation</span>}</div></div></article>) : <div className="empty-state large">No evidence yet. Launch an investigation to populate the evidence graph.</div>}</div>; }
function HypothesesView({ hypotheses }: { hypotheses: AnyRecord[] }) { return <div className="list-view"><div className="list-title"><div><span className="section-eyebrow">COMPETING EXPLANATIONS</span><h2>Hypothesis board</h2></div><span className="soft-pill">No majority voting</span></div>{hypotheses.map((h: any, i: number) => <article className="hyp-card" key={h.id}><div className="hyp-index">H{i + 1}</div><div className="hyp-body"><div className="hyp-top"><strong>{h.statement}</strong><span className={`support ${String(h.supportLevel || "").toLowerCase()}`}>{h.supportLevel || "UNTESTED"}</span></div><div className="hyp-stats"><span>{(h.supportingEvidence || []).length} supporting</span><span>{(h.contradictingEvidence || []).length} contradicting</span><span>{(h.expectedEvidence || []).length} predictions</span></div>{h.devilsEvidence && <p className="devils"><AlertTriangle size={14}/> {h.devilsEvidence}</p>}</div></article>)}</div>; }
function SourcesView({ sources, clusters }: { sources: AnyRecord[]; clusters: AnyRecord[] }) { return <div className="list-view"><div className="list-title"><div><span className="section-eyebrow">SOURCE INTELLIGENCE</span><h2>Evidence lineage</h2></div><span className="soft-pill">{clusters.length} clusters</span></div><div className="source-summary"><div><strong>{sources.length}</strong><span>sources</span></div><div><strong>{sources.filter(s => s.isPrimary).length}</strong><span>primary</span></div><div><strong>{clusters.reduce((n, c) => n + Number(c.independentRoots || 0), 0)}</strong><span>independent roots</span></div></div>{sources.slice(0, 20).map((s: any) => <article className="source-row" key={s.id}><div className="source-icon"><Globe2 size={15}/></div><div><strong>{s.title}</strong><span>{s.sourceType || "SOURCE"} · {s.isPrimary ? "Primary" : "Secondary"}</span></div><div className="source-quality">Authority {Math.round(Number(s.quality?.authority || 0))}</div></article>)}</div>; }
function AgentsView() { return <div className="list-view"><div className="list-title"><div><span className="section-eyebrow">INSTITUTION</span><h2>Agent registry</h2></div><span className="soft-pill">Persistent identities</span></div><div className="agent-grid">{AGENTS.map(a => <article className="agent-card" key={a.id}><div className="agent-card-top"><Avatar agent={a} large/><span className={`agent-status ${a.status}`}><i/>{a.status}</span></div><div className="agent-name">{a.name}</div><div className="agent-role">{a.role}</div><div className="agent-meta"><span>{a.rank}</span><span>{a.specialty}</span></div><div className="agent-motto">“Evidence survives stronger than confidence.”</div></article>)}</div></div>; }
function ActivityView({ events }: { events: AnyRecord[] }) { return <div className="list-view"><div className="list-title"><div><span className="section-eyebrow">EVENT STREAM</span><h2>Investigation replay</h2></div><span className="soft-pill">{events.length} events</span></div><div className="timeline">{events.slice().reverse().slice(0, 80).map((e: any, i: number) => <div className="timeline-row" key={e.id || i}><div className="timeline-dot"/><div className="timeline-time">{ago(e.timestamp)}</div><div className="timeline-body"><strong>{String(e.type || "event").replaceAll("_", " ")}</strong><p>{e.message || e.description || "Event recorded"}</p>{e.agentRole && <span>{e.agentRole}</span>}</div></div>)}</div></div>; }
function RevisionsView({ revisions }: { revisions: AnyRecord[] }) { return <div className="list-view"><div className="list-title"><div><span className="section-eyebrow">EPISTEMIC HISTORY</span><h2>Assessment revisions</h2></div><span className="soft-pill">Reversible conclusions</span></div>{revisions.length ? revisions.slice().reverse().map((r: any) => <article className="revision-row" key={r.id}><div className="revision-number">#{r.revisionNumber}</div><div><span>{r.trigger || "Assessment update"}</span><strong>{r.newAssessment}</strong><p>{r.summary || r.reason || "Assessment changed based on new evidence."}</p></div><time>{ago(r.timestamp)} ago</time></article>) : <div className="empty-state large">No assessment revisions yet.</div>}</div>; }
