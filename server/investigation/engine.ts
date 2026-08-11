// ─── INVESTIGATION ENGINE ────────────────────────────────────────────────
// The core orchestrator that runs investigations through the full pipeline.

import type {
  InvestigationState,
  InvestigationPhase,
  Hypothesis,
  Claim,
  Evidence,
  InvestigationSource,
  Contradiction,
  AgentRun,
  AgentRole,
  EventType,
  InformationGap,
  ResearchTask,
  AdversarialChallenge,
  DevilsEvidence,
  Disagreement,
  Assessment,
} from "./types.js";
import type { AIProvider, AIRequest, AIResponse } from "../providers/types.js";
import type { ModelRegistry } from "../providers/registry.js";
import { canTransition, nextPhases, PHASE_DESCRIPTIONS } from "./state-machine.js";
import { CostTracker } from "./cost-tracker.js";
import { globalEventEmitter } from "./events.js";
import { AGENT_SYSTEM_PROMPTS, getAgentConfig } from "./agents.js";
import { detectPotentialContradictions, investigateContradiction } from "./contradiction.js";
import { flagEvidenceIndependence, analyzeSourceLineage } from "./source-lineage.js";
import { countIndependentRoots } from "./evidence-graph.js";

let idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

// ─── Model assignment per role ────────────────────────────────────────────
const DEFAULT_ROLE_MODELS: Record<AgentRole, string> = {
  DIRECTOR: "openrouter/openai/gpt-4o-mini",
  PREMISE_AUDITOR: "openrouter/google/gemini-2.0-flash-001",
  PRIMARY_SOURCE_RESEARCHER: "openrouter/anthropic/claude-3.5-sonnet",
  OSINT_RESEARCHER: "openrouter/google/gemini-2.0-flash-001",
  EVIDENCE_ANALYST: "openrouter/openai/gpt-4o-mini",
  SKEPTIC: "openrouter/anthropic/claude-3.5-sonnet",
  ALTERNATIVE_EXPLANATION: "openrouter/mistral/mistral-large",
  SYNTHESIS: "openrouter/openai/gpt-4o-mini",
  ADVERSARIAL: "openrouter/anthropic/claude-3.5-sonnet",
  DEFENSE: "openrouter/openai/gpt-4o-mini",
};

export interface InvestigationOptions {
  question: string;
  budgetUSD?: number;
  defaultModelId?: string;
  forceMock?: boolean;
}

export class InvestigationEngine {
  private state: InvestigationState;
  private registry: ModelRegistry;
  private costTracker: CostTracker;
  private runs: Map<string, AgentRun> = new Map();
  private phase: InvestigationPhase = "DISCOVERY";
  private userInterventions: string[] = [];
  private convergenceChecks = 0;

  constructor(registry: ModelRegistry, options: InvestigationOptions) {
    this.registry = registry;
    const budget = options.budgetUSD ?? 10;
    this.costTracker = new CostTracker(budget);

    this.state = {
      id: genId("inv"),
      question: options.question,
      phase: "DISCOVERY",
      phaseHistory: [{ phase: "DISCOVERY", enteredAt: Date.now() }],
      hypotheses: new Map(),
      claims: new Map(),
      evidence: new Map(),
      sources: new Map(),
      contradictions: new Map(),
      disagreements: new Map(),
      devilsEvidence: new Map(),
      informationGaps: new Map(),
      researchTasks: new Map(),
      adversarialChallenges: new Map(),
      assessment: null,
      budgetUSD: budget,
      spentUSD: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (options.forceMock) {
      DEFAULT_ROLE_MODELS["DIRECTOR"] = "mock/deterministic";
      Object.keys(DEFAULT_ROLE_MODELS).forEach((k) => {
        DEFAULT_ROLE_MODELS[k as AgentRole] = "mock/deterministic";
      });
    }
  }

  get id(): string {
    return this.state.id;
  }

  get question(): string {
    return this.state.question;
  }

  getState(): InvestigationState {
    return this.state;
  }

  getPhase(): InvestigationPhase {
    return this.phase;
  }

  getCostSummary() {
    return this.costTracker.getSummary();
  }

  getAgentRuns(): AgentRun[] {
    return [...this.runs.values()];
  }

  getEvents() {
    return globalEventEmitter.getEvents(this.state.id);
  }

  // ─── Event helper ──────────────────────────────────────────────────────
  private recordEvent(type: EventType, message: string, details?: unknown, agentRole?: string, modelId?: string) {
    globalEventEmitter.recordEvent(this.state.id, type, message, details, agentRole, modelId);
  }

  // ─── Phase transition ──────────────────────────────────────────────────
  private transitionTo(newPhase: InvestigationPhase): void {
    if (this.phase === newPhase) return;
    if (!canTransition(this.phase, newPhase)) {
      throw new Error(`Invalid transition: ${this.phase} → ${newPhase}`);
    }
    this.phase = newPhase;
    this.state.phase = newPhase;
    this.state.phaseHistory.push({ phase: newPhase, enteredAt: Date.now() });
    this.state.updatedAt = Date.now();
    this.recordEvent("phase_changed", `Phase: ${newPhase} — ${PHASE_DESCRIPTIONS[newPhase]}`, { phase: newPhase });
  }

  // ─── AI call with cost tracking ────────────────────────────────────────
  private async callAI(
    role: AgentRole,
    prompt: string,
    jsonMode = true
  ): Promise<AIResponse> {
    const modelId = DEFAULT_ROLE_MODELS[role];
    const { model, provider } = this.registry.resolve(modelId);

    // Budget check
    if (this.costTracker.isBudgetExceeded()) {
      this.recordEvent("budget_exceeded", `Budget exceeded: $${this.costTracker.getSpent().toFixed(2)} of $${this.costTracker.getBudget().toFixed(2)}`);
      throw new Error("Investigation budget exceeded");
    }

    const config = getAgentConfig(role, modelId);
    const request: AIRequest = {
      systemPrompt: config.systemPrompt,
      prompt,
      model: model.model,
      jsonMode,
      taskLabel: role,
      temperature: 0.7,
      maxTokens: 4096,
    };

    this.recordEvent("agent_started", `${role} started task`, { role, modelId }, role, modelId);

    const start = Date.now();
    const response = await provider.generate(request);
    const durationMs = Date.now() - start;

    // Record cost
    const costRecord = this.costTracker.record(response, model, role, role);
    this.state.spentUSD = this.costTracker.getSpent();
    this.recordEvent("cost_recorded", `Cost: $${costRecord.costUSD.toFixed(4)} (${response.provider}/${response.model})`, costRecord);

    if (this.costTracker.isBudgetWarning()) {
      this.recordEvent("budget_warning", `Budget warning: $${this.costTracker.getSpent().toFixed(2)} of $${this.costTracker.getBudget().toFixed(2)} spent`);
    }

    // Record agent run for observability
    const run: AgentRun = {
      id: genId("run"),
      investigationId: this.state.id,
      agentId: genId(`agent-${role}`),
      agentRole: role,
      task: prompt.substring(0, 500),
      provider: response.provider,
      model: response.model,
      input: prompt,
      output: response.text,
      sources: [],
      claims: [],
      evidence: [],
      costUSD: costRecord.costUSD,
      durationMs,
      status: "COMPLETED",
      timestamp: Date.now(),
      simulated: response.simulated,
    };
    this.runs.set(run.id, run);

    this.recordEvent("agent_completed", `${role} completed task`, { role, modelId, runId: run.id }, role, modelId);
    return response;
  }

  // ─── Run full investigation ────────────────────────────────────────────
  async run(): Promise<InvestigationState> {
    this.recordEvent("investigation_started", `Investigation started: "${this.state.question}"`, { question: this.state.question });

    try {
      await this.runPremiseAudit();
      await this.runDecomposition();
      await this.runHypothesisGeneration();
      await this.runIndependentResearch();
      await this.runEvidenceAnalysis();
      await this.runCouncilComparison();
      await this.runAdversarialReview();
      await this.runGapAnalysis();
      await this.runTargetedResearch();
      await this.runReassessment();
      await this.runConvergence();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordEvent("phase_changed", `Investigation error: ${msg}`, { error: msg });
    }

    return this.state;
  }

  // ─── Premise Audit ─────────────────────────────────────────────────────
  private async runPremiseAudit(): Promise<void> {
    this.transitionTo("PREMISE_AUDIT");
    this.recordEvent("premise_audit_started", "Auditing question premises...");

    const response = await this.callAI(
      "PREMISE_AUDITOR",
      `Investigation question: "${this.state.question}"\n\nAudit the premises and assumptions in this question. Identify what needs verification before accepting the question's framing.`,
    );

    const parsed = (response.json ?? this.tryParse(response.text)) as { premises?: Array<{ premise: string; assumption: string; assessment: string; evidence_needed: string }> } | null;

    if (parsed?.premises) {
      for (const p of parsed.premises) {
        this.recordEvent("premise_issue_found", `Premise issue: ${p.assumption}`, p);
      }
    }
  }

  // ─── Decomposition ────────────────────────────────────────────────────
  private async runDecomposition(): Promise<void> {
    this.transitionTo("DECOMPOSITION");
    const response = await this.callAI(
      "DIRECTOR",
      `Investigation question: "${this.state.question}"\n\nDecompose this into researchable sub-questions. Consider what dimensions need investigation (causes, evidence types, definitions, metrics). Output JSON with {sub_questions: string[]}`,
    );
    const parsed = (response.json ?? this.tryParse(response.text)) as { sub_questions?: string[] } | null;
    if (parsed?.sub_questions) {
      this.recordEvent("agent_completed", `Decomposed into ${parsed.sub_questions.length} sub-questions`, { sub_questions: parsed.sub_questions });
    }
  }

  // ─── Hypothesis Generation ─────────────────────────────────────────────
  private async runHypothesisGeneration(): Promise<void> {
    this.transitionTo("HYPOTHESIS_GENERATION");
    const response = await this.callAI(
      "DIRECTOR",
      `Investigation question: "${this.state.question}"\n\nGenerate competing hypotheses to explain the phenomenon. Each hypothesis should be a distinct causal explanation. Output JSON with {hypotheses: [{id, statement, type, expected_evidence[]}]}`,
    );

    const parsed = (response.json ?? this.tryParse(response.text)) as {
      hypotheses?: Array<{ id: string; statement: string; type: string; expected_evidence: string[] }>
    } | null;

    if (parsed?.hypotheses) {
      for (const h of parsed.hypotheses) {
        const hyp: Hypothesis = {
          id: h.id || genId("hyp"),
          statement: h.statement,
          type: (h.type as Hypothesis["type"]) || "CAUSAL",
          supportLevel: "NONE",
          supportingEvidence: [],
          contradictingEvidence: [],
          claims: [],
          assumptions: [],
          expectedEvidence: h.expected_evidence.map((desc, i) => ({
            id: `${h.id}-exp-${i}`,
            description: desc,
            status: "UNKNOWN" as const,
          })),
          unknowns: [],
          agentAssessments: [],
          iterations: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        this.state.hypotheses.set(hyp.id, hyp);
        this.recordEvent("hypothesis_created", `Hypothesis ${hyp.id}: ${hyp.statement}`, { hypothesisId: hyp.id, statement: hyp.statement });
      }
    }
  }

  // ─── Independent Research ──────────────────────────────────────────────
  private async runIndependentResearch(): Promise<void> {
    this.transitionTo("INDEPENDENT_RESEARCH");

    // Agents research INDEPENDENTLY — they do not see each other's conclusions
    const roles: AgentRole[] = ["PRIMARY_SOURCE_RESEARCHER", "OSINT_RESEARCHER"];
    const findings: AIResponse[] = [];

    for (const role of roles) {
      this.recordEvent("agent_assigned", `Assigning ${role} to independent research`, { role });
      const response = await this.callAI(
        role,
        `Investigation question: "${this.state.question}"\n\nAs ${role}, research this question independently. Find relevant sources and report key findings. Do NOT assume any particular hypothesis is correct.`,
      );
      findings.push(response);

      // Parse findings and create sources
      this.processResearchFindings(response, role);
    }
  }

  // ─── Process research findings into sources ────────────────────────────
  private processResearchFindings(response: AIResponse, role: AgentRole): void {
    const parsed = (response.json ?? this.tryParse(response.text)) as {
      findings?: Array<{
        source: string;
        source_type: string;
        url?: string;
        key_facts: string[];
        confidence: string;
        is_primary: boolean;
        cites?: string;
      }>
    } | null;

    if (!parsed?.findings) return;

    for (const f of parsed.findings) {
      const sourceId = genId("src");
      const source: InvestigationSource = {
        id: sourceId,
        title: f.source,
        url: f.url,
        sourceType: (f.source_type as Evidence["type"]) || "SECONDARY_REPORT",
        quality: {
          authority: f.is_primary ? 0.8 : 0.5,
          proximity: f.is_primary ? 0.8 : 0.4,
          specificity: 0.6,
          independence: 0.7,
          transparency: f.is_primary ? 0.7 : 0.4,
          recency: 0.8,
          trackRecord: 0.6,
        },
        citedBy: [],
        cites: [],
        isPrimary: f.is_primary,
        addedBy: role,
        addedAt: Date.now(),
      };

      // Handle citation tracking
      if (f.cites) {
        const citedSource = [...this.state.sources.values()].find((s) => s.title === f.cites);
        if (citedSource) {
          source.cites.push(citedSource.id);
          citedSource.citedBy.push(sourceId);
        }
      }

      this.state.sources.set(sourceId, source);
      this.recordEvent("agent_found_source", `${role} found source: ${f.source}`, { sourceId, title: f.source, isPrimary: f.is_primary }, role);

      // Create evidence items from key facts
      for (const fact of f.key_facts) {
        const evidenceId = genId("ev");
        const evidence: Evidence = {
          id: evidenceId,
          text: fact,
          type: this.inferEvidenceType(fact, f.is_primary, f.source_type),
          sourceId,
          extractedBy: role,
          extractedAt: Date.now(),
          independentConfirmation: true, // will be re-evaluated by source lineage
          rootSourceIds: [sourceId],
        };
        this.state.evidence.set(evidenceId, evidence);
        this.recordEvent("agent_extracted_evidence", `${role} extracted evidence: ${fact.substring(0, 80)}...`, { evidenceId, evidenceType: evidence.type }, role);
      }
    }
  }

  private inferEvidenceType(fact: string, isPrimary: boolean, sourceType: string): Evidence["type"] {
    if (/project|forecast|expect|anticipat|predict/i.test(fact)) return "PROJECTION";
    if (/estimate|approximat|roughly/i.test(fact)) return "ESTIMATE";
    if (/measur|observ|actual|record/i.test(fact)) return "MEASUREMENT";
    if (/attribut|due to|caused by|result of/i.test(fact)) return "ATTRIBUTION";
    if (/limitation|does not|cannot|not established/i.test(fact)) return "LIMITATION";
    if (/statement|said|stated|according to/i.test(fact)) return "STATEMENT";
    if (sourceType === "GOVERNMENT_RECORD") return "GOVERNMENT_RECORD";
    if (sourceType === "FINANCIAL_RECORD") return "FINANCIAL_RECORD";
    if (sourceType === "ACADEMIC_FINDING") return "ACADEMIC_FINDING";
    if (!isPrimary) return "SECONDARY_REPORT";
    return "OBSERVATION";
  }

  // ─── Evidence Analysis ─────────────────────────────────────────────────
  private async runEvidenceAnalysis(): Promise<void> {
    this.transitionTo("EVIDENCE_ANALYSIS");

    // Flag evidence independence based on source lineage
    flagEvidenceIndependence(this.state.evidence, this.state.sources);

    // Detect correlated sources
    const correlations = analyzeSourceLineage(this.state.sources, this.state.evidence);
    for (const c of correlations) {
      this.recordEvent("source_dependency_detected", c.message, c);
    }

    // Have evidence analyst create claims from evidence
    const evidenceSummary = [...this.state.evidence.values()].map((e) => ({
      text: e.text,
      type: e.type,
      source: this.state.sources.get(e.sourceId)?.title,
      independent: e.independentConfirmation,
    }));

    const response = await this.callAI(
      "EVIDENCE_ANALYST",
      `Investigation question: "${this.state.question}"\n\nHere is the evidence collected so far:\n${JSON.stringify(evidenceSummary, null, 2)}\n\nExtract atomic claims from this evidence. Each claim should be a specific assertion. Classify each claim by type. Output JSON: {evidence_items: [{text, type, source_ref, claim, claim_type}]}`,
    );

    const parsed = (response.json ?? this.tryParse(response.text)) as {
      evidence_items?: Array<{ text: string; type: string; source_ref: string; claim: string; claim_type: string }>
    } | null;

    if (parsed?.evidence_items) {
      for (const item of parsed.evidence_items) {
        // Find matching evidence
        // Match evidence to claim using word overlap (more robust than substring match)
        const itemWords = item.text.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
        const existingEv = [...this.state.evidence.values()].find((e) => {
          const evWords = e.text.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
          const overlap = evWords.filter((w: string) => itemWords.includes(w));
          return overlap.length >= 3;
        });
        const sourceId = existingEv?.sourceId ?? [...this.state.sources.keys()][0];

        // Create claim
        const claimId = genId("claim");
        const claim: Claim = {
          id: claimId,
          text: item.claim,
          type: (item.claim_type as Claim["type"]) || "FACTUAL",
          supportingEvidence: existingEv ? [existingEv.id] : [],
          contradictingEvidence: [],
          status: "UNVERIFIED",
          createdBy: "EVIDENCE_ANALYST",
          createdAt: Date.now(),
        };
        this.state.claims.set(claimId, claim);

        // Update evidence to reference claim
        if (existingEv) {
          existingEv.supportsClaimId = claimId;
        }

        this.recordEvent("agent_created_claim", `Created Claim #${claimId}: ${item.claim.substring(0, 80)}`, { claimId, claimType: claim.type }, "EVIDENCE_ANALYST");
      }
    }
  }

  // ─── Council Comparison ────────────────────────────────────────────────
  private async runCouncilComparison(): Promise<void> {
    this.transitionTo("COUNCIL_COMPARISON");
    this.recordEvent("council_round_started", "Council comparison phase — cross-agent comparison begins");

    // Detect contradictions
    const contradictions = detectPotentialContradictions(this.state.claims, this.state.evidence);
    for (const con of contradictions) {
      this.state.contradictions.set(con.id, con);
      this.recordEvent("contradiction_detected", con.description, con);

      // Investigate the contradiction
      const result = investigateContradiction(con, this.state.claims, this.state.evidence);
      con.status = result.status;
      con.resolution = result.resolution;
      this.recordEvent("contradiction_detected", `Contradiction ${con.status.toLowerCase()}: ${result.resolution}`, { contradictionId: con.id, status: con.status });
    }

    // Assign claims to hypotheses
    for (const hyp of this.state.hypotheses.values()) {
      const matchingClaims = [...this.state.claims.values()].filter((c) =>
        this.claimRelatesToHypothesis(c, hyp)
      );
      hyp.claims = matchingClaims.map((c) => c.id);

      // Aggregate evidence from linked claims into hypothesis
      for (const claim of matchingClaims) {
        for (const evId of claim.supportingEvidence) {
          if (!hyp.supportingEvidence.includes(evId)) {
            hyp.supportingEvidence.push(evId);
          }
        }
        for (const evId of claim.contradictingEvidence) {
          if (!hyp.contradictingEvidence.includes(evId)) {
            hyp.contradictingEvidence.push(evId);
          }
        }
      }

      // Check expected evidence
      for (const exp of hyp.expectedEvidence) {
        const found = [...this.state.evidence.values()].some((e) =>
          e.text.toLowerCase().includes(exp.description.toLowerCase().substring(0, 20)) ||
          exp.description.toLowerCase().includes(e.text.toLowerCase().substring(0, 20))
        );
        if (found) {
          exp.status = "FOUND";
          const evidenceId = [...this.state.evidence.values()].find((e) =>
            e.text.toLowerCase().includes(exp.description.toLowerCase().substring(0, 20))
          )?.id;
          if (evidenceId) {
            exp.evidenceId = evidenceId;
            hyp.supportingEvidence.push(evidenceId);
            this.recordEvent("expected_evidence_found", `Expected evidence found for ${hyp.id}: ${exp.description}`, { hypothesisId: hyp.id, expectedId: exp.id });
          }
        } else {
          exp.status = "MISSING";
          this.recordEvent("expected_evidence_missing", `Expected evidence missing for ${hyp.id}: ${exp.description}`, { hypothesisId: hyp.id, expectedId: exp.id });
        }
      }

      // Count independent roots
      const rootInfo = countIndependentRoots(hyp.supportingEvidence, this.state);
      if (rootInfo.totalSources > rootInfo.rootCount) {
        this.recordEvent("source_dependency_detected", `${rootInfo.totalSources} sources but only ${rootInfo.rootCount} independent root source(s) for ${hyp.id}`, rootInfo);
      }

      // Set initial support level
      hyp.supportLevel = this.assessSupportLevel(hyp);
    }

    // Check for model disagreements
    this.detectModelDisagreements();
  }

  private claimRelatesToHypothesis(claim: Claim, hyp: Hypothesis): boolean {
    const claimWords = claim.text.toLowerCase().split(/\s+/);
    const hypWords = hyp.statement.toLowerCase().split(/\s+/);
    const overlap = claimWords.filter((w) => hypWords.includes(w) && w.length > 3);
    return overlap.length >= 2;
  }

  private assessSupportLevel(hyp: Hypothesis): Hypothesis["supportLevel"] {
    const supportCount = hyp.supportingEvidence.length;
    const contradictCount = hyp.contradictingEvidence.length;
    const foundExpected = hyp.expectedEvidence.filter((e) => e.status === "FOUND").length;
    const totalExpected = hyp.expectedEvidence.length;

    if (supportCount === 0 && foundExpected === 0) return "INSUFFICIENT_EVIDENCE";
    if (contradictCount > supportCount) return "WEAK";
    if (foundExpected / Math.max(totalExpected, 1) > 0.7 && supportCount > 2) return "STRONG";
    if (foundExpected / Math.max(totalExpected, 1) > 0.4 || supportCount > 1) return "MODERATE";
    return "WEAK";
  }

  private detectModelDisagreements(): void {
    // Group agent assessments by claim
    const claimAssessments = new Map<string, Array<{ agentId: string; modelId: string; position: string }>>();

    for (const hyp of this.state.hypotheses.values()) {
      for (const a of hyp.agentAssessments) {
        for (const claimId of hyp.claims) {
          const existing = claimAssessments.get(claimId) ?? [];
          existing.push({ agentId: a.agentId, modelId: a.modelId, position: a.assessment });
          claimAssessments.set(claimId, existing);
        }
      }
    }

    // Check for disagreements
    for (const [claimId, assessments] of claimAssessments) {
      const positions = new Set(assessments.map((a) => a.position));
      if (positions.size > 1) {
        const disId = genId("disagree");
        const disagreement: Disagreement = {
          id: disId,
          disputedClaimId: claimId,
          participants: assessments.map((a) => ({
            agentId: a.agentId,
            modelId: a.modelId,
            position: a.position as "SUPPORTS" | "WEAKENS" | "UNCERTAIN",
            evidence: [],
            reasoning: "",
          })),
          resolutionStatus: "OPEN",
          createdAt: Date.now(),
        };
        this.state.disagreements.set(disId, disagreement);
        this.recordEvent("disagreement_detected", `Model disagreement on claim ${claimId}: ${[...positions].join(" vs ")}`, disagreement);
      }
    }
  }

  // ─── Adversarial Review ────────────────────────────────────────────────
  private async runAdversarialReview(): Promise<void> {
    this.transitionTo("ADVERSARIAL_REVIEW");
    this.recordEvent("adversarial_round_started", "Adversarial review — attacking the leading hypothesis");

    // Find the leading hypothesis (highest support)
    const leadingHyp = this.getLeadingHypothesis();
    if (!leadingHyp) return;

    // Adversarial challenge
    const challengePrompt = this.buildAdversarialPrompt(leadingHyp);
    const response = await this.callAI("ADVERSARIAL", challengePrompt);

    const parsed = (response.json ?? this.tryParse(response.text)) as {
      challenges?: Array<{
        target_claim: string;
        challenge_type: string;
        evidence: string;
        assumption: string;
        objection: string;
        counter_evidence?: string;
        assessment?: string;
        remaining_uncertainty?: string;
      }>
    } | null;

    const challengeId = genId("challenge");
    const challenge: AdversarialChallenge = {
      id: challengeId,
      hypothesisId: leadingHyp.id,
      challenges: [],
      iteration: 1,
      status: "OPEN",
      createdAt: Date.now(),
    };

    if (parsed?.challenges) {
      challenge.challenges = parsed.challenges.map((c) => ({
        claimId: c.target_claim,
        challengeType: c.challenge_type,
        evidence: c.evidence,
        assumption: c.assumption,
        objection: c.objection,
      }));

      for (const c of parsed.challenges) {
        this.recordEvent("adversarial_challenge_created", `Adversarial challenge: ${c.objection?.substring(0, 80)}`, c, "ADVERSARIAL");
        this.recordEvent("agent_challenged_claim", `Challenge opened against ${c.target_claim}`, { challengeType: c.challenge_type, evidence: c.evidence }, "ADVERSARIAL");
      }
    }

    this.state.adversarialChallenges.set(challengeId, challenge);

    // Devil's evidence — find the strongest evidence against the leading hypothesis
    const devilsPrompt = `Investigation question: "${this.state.question}"\nLeading hypothesis: "${leadingHyp.statement}"\n\nFind the single strongest piece of evidence that could significantly weaken or destroy this hypothesis. Output JSON: {strongest_contradicting_evidence, largest_unknown, most_dangerous_assumption, severity}`;
    const devilsResponse = await this.callAI("SKEPTIC", devilsPrompt);
    const devilsParsed = (devilsResponse.json ?? this.tryParse(devilsResponse.text)) as {
      strongest_contradicting_evidence?: string;
      largest_unknown?: string;
      most_dangerous_assumption?: string;
      severity?: string;
    } | null;

    if (devilsParsed?.strongest_contradicting_evidence) {
      const devId = genId("devils");
      const dev: DevilsEvidence = {
        id: devId,
        hypothesisId: leadingHyp.id,
        evidenceId: devId,
        severity: (devilsParsed.severity as DevilsEvidence["severity"]) || "HIGH",
        explanation: devilsParsed.strongest_contradicting_evidence,
        discoveredBy: "SKEPTIC",
        discoveredAt: Date.now(),
      };
      this.state.devilsEvidence.set(devId, dev);
      this.recordEvent("devils_evidence_found", `Devil's evidence for ${leadingHyp.id}: ${devilsParsed.strongest_contradicting_evidence.substring(0, 100)}`, dev, "SKEPTIC");
    }

    // Defense response
    const defensePrompt = `Investigation question: "${this.state.question}"\nLeading hypothesis: "${leadingHyp.statement}"\n\nAdversarial challenges:\n${JSON.stringify(parsed?.challenges ?? [], null, 2)}\n\nDoes the adversarial criticism materially weaken the hypothesis? Classify each challenge as VALID, PARTIALLY_VALID, INVALID, or UNRESOLVED. Explain using evidence. Output JSON: {responses: [{claim_id, classification, explanation}], overall_assessment, hypothesis_should_be_updated, new_support_level}`;
    const defenseResponse = await this.callAI("DEFENSE", defensePrompt);

    const defenseParsed = (defenseResponse.json ?? this.tryParse(defenseResponse.text)) as {
      responses?: Array<{ claim_id: string; classification: string; explanation: string }>;
      overall_assessment?: string;
      hypothesis_should_be_updated?: boolean;
      new_support_level?: string;
    } | null;

    if (defenseParsed?.responses) {
      challenge.defenseResponse = defenseParsed.responses.map((r) => ({
        claimId: r.claim_id,
        classification: r.classification as "VALID" | "PARTIALLY_VALID" | "INVALID" | "UNRESOLVED",
        explanation: r.explanation,
      }));
      challenge.status = "DEFENDED";
      this.recordEvent("defense_response", `Defense response: ${defenseParsed.overall_assessment?.substring(0, 80)}`, defenseParsed, "DEFENSE");

      // Update hypothesis if needed
      if (defenseParsed.hypothesis_should_be_updated && defenseParsed.new_support_level) {
        const oldLevel = leadingHyp.supportLevel;
        const newLevel = defenseParsed.new_support_level as Hypothesis["supportLevel"];
        leadingHyp.iterations.push({
          iteration: leadingHyp.iterations.length + 1,
          timestamp: Date.now(),
          previousSupport: oldLevel,
          newSupport: newLevel,
          reason: defenseParsed.overall_assessment ?? "Updated by adversarial review",
        });
        leadingHyp.supportLevel = newLevel;
        leadingHyp.updatedAt = Date.now();
        this.recordEvent("hypothesis_strength_changed", `${leadingHyp.id}: ${oldLevel} → ${newLevel}`, { hypothesisId: leadingHyp.id, oldLevel, newLevel });
      }
    }

    this.state.adversarialChallenges.set(challengeId, challenge);
  }

  private getLeadingHypothesis(): Hypothesis | null {
    const hyps = [...this.state.hypotheses.values()];
    if (hyps.length === 0) return null;
    const order = { STRONG: 4, MODERATE: 3, WEAK: 2, INSUFFICIENT_EVIDENCE: 1, NONE: 0 };
    hyps.sort((a, b) => order[b.supportLevel] - order[a.supportLevel]);
    return hyps[0];
  }

  private buildAdversarialPrompt(hyp: Hypothesis): string {
    const supportingEv = hyp.supportingEvidence.map((id) => this.state.evidence.get(id)?.text).filter(Boolean);
    const expectedFound = hyp.expectedEvidence.filter((e) => e.status === "FOUND").map((e) => e.description);
    const expectedMissing = hyp.expectedEvidence.filter((e) => e.status === "MISSING").map((e) => e.description);
    const assumptions = hyp.assumptions;

    return `Investigation question: "${this.state.question}"

Current leading hypothesis: "${hyp.statement}"
Current support level: ${hyp.supportLevel}

Supporting evidence:
${supportingEv.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Expected evidence found:
${expectedFound.map((e) => `✓ ${e}`).join("\n")}

Expected evidence missing:
${expectedMissing.map((e) => `✗ ${e}`).join("\n")}

Assumptions:
${assumptions.map((a) => `- ${a}`).join("\n")}

Assume the current conclusion is WRONG. Construct the strongest evidence-based case against it.
Every objection must reference evidence or identify a specific missing piece.
Output JSON: {challenges: [{target_claim, challenge_type, evidence, assumption, objection, counter_evidence, assessment, remaining_uncertainty}]}`;
  }

  // ─── Gap Analysis ──────────────────────────────────────────────────────
  private async runGapAnalysis(): Promise<void> {
    this.transitionTo("GAP_ANALYSIS");

    // Identify information gaps
    const missingExpected = [...this.state.hypotheses.values()].flatMap((h) =>
      h.expectedEvidence.filter((e) => e.status === "MISSING").map((e) => ({ hypothesisId: h.id, ...e }))
    );

    for (const missing of missingExpected) {
      const gapId = genId("gap");
      const gap: InformationGap = {
        id: gapId,
        question: missing.description,
        importance: "HIGH" as const,
        expectedImpact: `Resolving this could strengthen or weaken ${missing.hypothesisId}`,
        status: "OPEN",
        createdFromAdversarial: true,
        createdAt: Date.now(),
      };
      this.state.informationGaps.set(gapId, gap);
      this.recordEvent("information_gap_created", `Information gap: ${missing.description}`, gap);
    }

    // Create research tasks for highest-impact gaps
    for (const gap of this.state.informationGaps.values()) {
      if (gap.status !== "OPEN") continue;
      const taskId = genId("task");
      const task: ResearchTask = {
        id: taskId,
        question: gap.question,
        assignedTo: "PRIMARY_SOURCE_RESEARCHER",
        modelId: DEFAULT_ROLE_MODELS["PRIMARY_SOURCE_RESEARCHER"],
        status: "PENDING",
        priority: gap.importance === "HIGH" || gap.importance === "CRITICAL" ? "HIGH" : "MEDIUM",
        createdAt: Date.now(),
      };
      this.state.researchTasks.set(taskId, task);
      this.recordEvent("research_task_created", `Research task: ${gap.question.substring(0, 80)}`, task);
      gap.status = "INVESTIGATING";
    }
  }

  // ─── Targeted Research ────────────────────────────────────────────────
  private async runTargetedResearch(): Promise<void> {
    this.transitionTo("TARGETED_RESEARCH");

    const pendingTasks = [...this.state.researchTasks.values()].filter((t) => t.status === "PENDING");
    if (pendingTasks.length === 0) return;

    // Execute highest priority tasks
    pendingTasks.sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return order[a.priority] - order[b.priority];
    });

    for (const task of pendingTasks.slice(0, 3)) {
      task.status = "IN_PROGRESS";
      const response = await this.callAI(
        "PRIMARY_SOURCE_RESEARCHER",
        `Investigation question: "${this.state.question}"\n\nResearch this specific question: "${task.question}"\n\nFind primary sources. Report findings. Output JSON: {findings: [{source, source_type, url, key_facts[], confidence, is_primary, cites?}]}`,
      );

      this.processResearchFindings(response, "PRIMARY_SOURCE_RESEARCHER");
      task.status = "COMPLETED";
      task.completedAt = Date.now();
    }
  }

  // ─── Reassessment ─────────────────────────────────────────────────────
  private async runReassessment(): Promise<void> {
    this.transitionTo("REASSESSMENT");

    // Re-evaluate hypotheses with new evidence
    for (const hyp of this.state.hypotheses.values()) {
      // Update expected evidence status
      for (const exp of hyp.expectedEvidence) {
        if (exp.status !== "FOUND") {
          const found = [...this.state.evidence.values()].some((e) =>
            e.text.toLowerCase().includes(exp.description.toLowerCase().substring(0, 20))
          );
          if (found) {
            exp.status = "FOUND";
            const evId = [...this.state.evidence.values()].find((e) =>
              e.text.toLowerCase().includes(exp.description.toLowerCase().substring(0, 20))
            )?.id;
            if (evId && !hyp.supportingEvidence.includes(evId)) {
              hyp.supportingEvidence.push(evId);
              exp.evidenceId = evId;
            }
          }
        }
      }

      // Re-assess support level
      const newLevel = this.assessSupportLevel(hyp);
      if (newLevel !== hyp.supportLevel) {
        const oldLevel = hyp.supportLevel;
        hyp.iterations.push({
          iteration: hyp.iterations.length + 1,
          timestamp: Date.now(),
          previousSupport: oldLevel,
          newSupport: newLevel,
          reason: "Reassessment based on targeted research findings",
        });
        hyp.supportLevel = newLevel;
        hyp.updatedAt = Date.now();
        this.recordEvent("hypothesis_strength_changed", `${hyp.id}: ${oldLevel} → ${newLevel}`, { hypothesisId: hyp.id, oldLevel, newLevel });
      }
    }

    // Generate assessment
    await this.generateAssessment();
  }

  private async generateAssessment(): Promise<void> {
    const response = await this.callAI("SYNTHESIS", this.buildSynthesisPrompt());
    const parsed = (response.json ?? this.tryParse(response.text)) as { assessment?: Assessment } | null;

    if (parsed?.assessment) {
      const raw = parsed.assessment as unknown as Record<string, unknown>;
      const assessment: Assessment = {
        investigationId: this.state.id,
        confidenceLevel: (raw.confidenceLevel ?? raw.confidence_level ?? "MODERATE") as Assessment["confidenceLevel"],
        summary: (raw.summary ?? undefined) as string | undefined,
        supportingEvidence: (raw.supportingEvidence ?? raw.supporting_evidence ?? []) as string[],
        contradictingEvidence: (raw.contradictingEvidence ?? raw.contradicting_evidence ?? []) as string[],
        majorAssumptions: (raw.majorAssumptions ?? raw.major_assumptions ?? []) as string[],
        majorUnknowns: (raw.majorUnknowns ?? raw.major_unknowns ?? []) as string[],
        strongestCounterargument: (raw.strongestCounterargument ?? raw.strongest_counterargument ?? "") as string,
        informationGaps: (raw.informationGaps ?? raw.information_gaps ?? []) as string[],
        multiCausal: (raw.multiCausal ?? raw.multi_causal ?? false) as boolean,
        hypothesisSummaries: [...this.state.hypotheses.values()].map((h) => ({
          hypothesisId: h.id,
          hypothesisStatement: h.statement,
          supportLevel: h.supportLevel,
        })),
        lastUpdated: Date.now(),
      };
      this.state.assessment = assessment;
      this.recordEvent("assessment_updated", `Assessment updated: ${assessment.confidenceLevel} confidence`, assessment as unknown as Record<string, unknown>);
    }
  }

  private buildSynthesisPrompt(): string {
    const hyps = [...this.state.hypotheses.values()];
    const evidence = [...this.state.evidence.values()];
    const sources = [...this.state.sources.values()];
    const contradictions = [...this.state.contradictions.values()];
    const gaps = [...this.state.informationGaps.values()];

    return `Investigation question: "${this.state.question}"

Hypotheses:
${hyps.map((h) => `${h.id} [${h.supportLevel}]: ${h.statement}\n  Expected evidence found: ${h.expectedEvidence.filter((e) => e.status === "FOUND").length}/${h.expectedEvidence.length}\n  Supporting evidence: ${h.supportingEvidence.length}\n  Contradicting evidence: ${h.contradictingEvidence.length}`).join("\n\n")}

Evidence collected: ${evidence.length} items
Sources: ${sources.length} (${sources.filter((s) => s.isPrimary).length} primary, ${sources.filter((s) => !s.isPrimary).length} secondary)
Contradictions: ${contradictions.length} (${contradictions.filter((c) => c.status === "CONFIRMED").length} confirmed)
Information gaps: ${gaps.length}

Synthesize this into a structured assessment. Distinguish FACT, CLAIM, INFERENCE, HYPOTHESIS, UNKNOWN.
Do NOT force a single cause — reality may be multi-causal.
Output JSON: {assessment: {confidence_level, summary, supporting_evidence[], contradicting_evidence[], major_assumptions[], major_unknowns[], strongest_counterargument, information_gaps[]}}`;
  }

  // ─── Convergence ───────────────────────────────────────────────────────
  private async runConvergence(): Promise<void> {
    this.convergenceChecks++;
    this.transitionTo("CONVERGENCE");
    this.recordEvent("investigation_converged", `Investigation converged after ${this.convergenceChecks} reassessment cycle(s)`, { convergenceChecks: this.convergenceChecks });

    // Final assessment if not already generated
    if (!this.state.assessment) {
      await this.generateAssessment();
    }
  }

  // ─── User Intervention ─────────────────────────────────────────────────
  async addUserIntervention(instruction: string): Promise<void> {
    this.userInterventions.push(instruction);
    this.recordEvent("user_intervention", `User directive: "${instruction}"`, { instruction });

    // Convert instruction to a research task
    const taskId = genId("task");
    const task: ResearchTask = {
      id: taskId,
      question: instruction,
      assignedTo: "PRIMARY_SOURCE_RESEARCHER",
      modelId: DEFAULT_ROLE_MODELS["PRIMARY_SOURCE_RESEARCHER"],
      status: "PENDING",
      priority: "HIGH",
      createdAt: Date.now(),
      fromUserIntervention: true,
    };
    this.state.researchTasks.set(taskId, task);
    this.recordEvent("research_task_created", `Research task from user: ${instruction}`, task);
  }

  // ─── Utilities ─────────────────────────────────────────────────────────
  private tryParse(text: string): unknown {
    try { return JSON.parse(text); } catch {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) { try { return JSON.parse(match[1]); } catch { /* */ } }
      return null;
    }
  }
}
