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
import {
  determineNextAction,
  initMindChangingEvidence,
  createPredictionsForHypothesis,
  evaluatePrediction,
  compareHypotheses,
  identifyDiscriminatingTask,
  detectEvidenceClusters,
  detectNarrativePatterns,
  extractEntitiesFromEvidence,
  detectCausalClaims,
  evaluateConvergence,
  computeScorecard,
  checkConfirmationBias,
  createAssessmentRevision,
  storeMemory,
  createUserOverride,
  calculatePriority,
} from "./director.js";
import type {
  NextInvestigationAction,
  Prediction,
  FailedPrediction,
  MindChangingEvidence,
  HypothesisCompetition,
  DiscriminatingEvidenceTask,
  EvidenceCluster,
  NarrativePattern,
  Entity,
  EntityRelationship,
  CausalClaim,
  ConvergenceCheck,
  InvestigationScorecard,
  AssessmentRevision,
  InvestigationMemory,
  UserOverrideEvent,
  UserOverrideType,
} from "./director-types.js";
import type {
  ResearchCycle,
  InvestigationDecision,
  ResearchMission,
  InvestigationCheckpoint,
  MemoryItem,
  AssessmentSnapshot,
  ReasoningEscalation,
  ReasoningArtifact,
  ReasoningConfig,
  ReasoningEffort,
  InvestigationMode,
  MissionContext,
  MissionResult,
  CycleStatus,
} from "./persistence-types.js";
import {
  MODE_CONFIGS,
  getModeConfig,
  getDefaultReasoningDepth,
  getMaxReasoningDepth,
} from "./modes.js";
import { ContextBuilder } from "./context-builder.js";
import {
  InvestigationTaskManager,
  genMissionId,
} from "./task-manager.js";
import {
  MemoryStore,
  distillCycleMemory,
  createAssessmentSnapshot,
  compareSnapshots,
} from "./memory-system.js";
import {
  determineReasoningDepth,
  shouldEscalate,
  analyzeTaskCharacteristics,
  createEscalationRecord,
  addEscalationTrigger,
} from "./reasoning.js";
import {
  reviewCycle,
  recordDecision,
} from "./cycle-review.js";
import {
  serializeState,
  saveInvestigation,
  loadInvestigation,
  deserializeState,
} from "./persistence.js";

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
  mode?: InvestigationMode;
}

export class InvestigationEngine {
  private state: InvestigationState;
  private registry: ModelRegistry;
  private costTracker: CostTracker;
  private runs: Map<string, AgentRun> = new Map();
  private phase: InvestigationPhase = "CREATED";
  private userInterventions: string[] = [];
  private convergenceChecks = 0;
  // ─── Directive 05: Persistent deep investigation ─────────────────────
  private mode: InvestigationMode;
  private modeConfig = getModeConfig("STANDARD");
  private contextBuilder = new ContextBuilder();
  private taskManager: InvestigationTaskManager;
  private memoryStore = new MemoryStore();
  private researchCycles: ResearchCycle[] = [];
  private decisions: InvestigationDecision[] = [];
  private missions: ResearchMission[] = [];
  private checkpoints: InvestigationCheckpoint[] = [];
  private assessmentSnapshots: AssessmentSnapshot[] = [];
  private reasoningEscalations: ReasoningEscalation[] = [];
  private reasoningArtifacts: ReasoningArtifact[] = [];
  private currentCycle: ResearchCycle | null = null;
  private isPaused = false;
  private isRunning = false;

  constructor(registry: ModelRegistry, options: InvestigationOptions) {
    this.registry = registry;
    this.mode = options.mode ?? "STANDARD";
    this.modeConfig = getModeConfig(this.mode);
    const budget = (options.budgetUSD ?? 10) * this.modeConfig.budgetMultiplier;
    this.costTracker = new CostTracker(budget);
    this.taskManager = new InvestigationTaskManager(this.modeConfig.maxConcurrentAgents);

    this.state = {
      id: genId("inv"),
      question: options.question,
      phase: "CREATED",
      phaseHistory: [{ phase: "CREATED", enteredAt: Date.now() }],
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
      // Director collections
      predictions: new Map(),
      failedPredictions: new Map(),
      mindChangingEvidence: new Map(),
      hypothesisCompetitions: new Map(),
      discriminatingTasks: new Map(),
      evidenceClusters: new Map(),
      narrativePatterns: new Map(),
      entities: new Map(),
      relationships: new Map(),
      timelines: new Map(),
      causalClaims: new Map(),
      investigationMemory: new Map(),
      assessmentRevisions: new Map(),
      scorecard: null,
      userOverrides: new Map(),
      convergenceCheck: null,
      investigationCycle: 0,
      maxCycles: 8, // will be updated from mode config
      converged: false,
      paused: false,
    };

    if (options.forceMock) {
      DEFAULT_ROLE_MODELS["DIRECTOR"] = "mock/deterministic";
      Object.keys(DEFAULT_ROLE_MODELS).forEach((k) => {
        DEFAULT_ROLE_MODELS[k as AgentRole] = "mock/deterministic";
      });
    }

    // Apply mode config
    this.state.maxCycles = this.modeConfig.maxCycles;
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

  // ─── Directive 05: Public accessors ────────────────────────────────────
  getResearchCycles(): ResearchCycle[] { return this.researchCycles; }
  getDecisions(): InvestigationDecision[] { return this.decisions; }
  getMissions(): ResearchMission[] { return this.missions; }
  getCheckpoints(): InvestigationCheckpoint[] { return this.checkpoints; }
  getAssessmentSnapshots(): AssessmentSnapshot[] { return this.assessmentSnapshots; }
  getReasoningEscalations(): ReasoningEscalation[] { return this.reasoningEscalations; }
  getReasoningArtifacts(): ReasoningArtifact[] { return this.reasoningArtifacts; }
  getMemoryItems(): MemoryItem[] { return this.memoryStore.getAll(); }
  getMode(): InvestigationMode { return this.mode; }
  isInvestigationPaused(): boolean { return this.isPaused; }

  // ─── Directive 05: Pause / Resume ──────────────────────────────────────
  pause(): void {
    this.isPaused = true;
    this.state.paused = true;
    this.recordEvent("phase_changed", "Investigation paused", { phase: "PAUSED" });
  }

  resume(): void {
    this.isPaused = false;
    this.state.paused = false;
    this.recordEvent("phase_changed", "Investigation resumed", { phase: this.phase });
  }

  // ─── Directive 05: Checkpoint ──────────────────────────────────────────
  private createCheckpoint(): void {
    // Lightweight snapshot — no recursive serialization (avoids circular refs)
    const cp: InvestigationCheckpoint = {
      id: genId("cp"),
      investigationId: this.state.id,
      cycleId: this.currentCycle?.id ?? "none",
      cycleSequence: this.state.investigationCycle,
      stateSnapshot: {
        id: this.state.id,
        question: this.state.question,
        phase: this.state.phase,
        phaseHistory: this.state.phaseHistory,
        hypotheses: [...this.state.hypotheses.values()].map(h => ({ id: h.id, statement: h.statement, supportLevel: h.supportLevel, supportingEvidence: h.supportingEvidence.length, contradictingEvidence: h.contradictingEvidence.length })),
        claims: [...this.state.claims.values()].map(c => ({ id: c.id, text: c.text, status: c.status })),
        evidence: [...this.state.evidence.values()].map(e => ({ id: e.id, text: e.text.substring(0, 100), type: e.type, independent: e.independentConfirmation })),
        sources: [...this.state.sources.values()].map(s => ({ id: s.id, title: s.title, isPrimary: s.isPrimary })),
        contradictions: [...this.state.contradictions.values()].map(c => ({ id: c.id, description: c.description, status: c.status })),
        disagreements: [],
        devilsEvidence: [],
        informationGaps: [...this.state.informationGaps.values()].map(g => ({ id: g.id, question: g.question, status: g.status })),
        researchTasks: [],
        adversarialChallenges: [],
        assessment: this.state.assessment ? { confidenceLevel: this.state.assessment.confidenceLevel, summary: this.state.assessment.summary } : null,
        budgetUSD: this.state.budgetUSD,
        spentUSD: this.state.spentUSD,
        createdAt: this.state.createdAt,
        updatedAt: this.state.updatedAt,
        predictions: [],
        failedPredictions: [...(this.state.failedPredictions?.values() ?? [])].map(p => ({ id: p.id, expectedResult: p.expectedResult })),
        mindChangingEvidence: [],
        hypothesisCompetitions: [],
        discriminatingTasks: [],
        evidenceClusters: [],
        narrativePatterns: [],
        entities: [],
        relationships: [],
        causalClaims: [],
        investigationMemory: [],
        assessmentRevisions: [],
        scorecard: this.state.scorecard,
        userOverrides: [],
        convergenceCheck: this.state.convergenceCheck,
        investigationCycle: this.state.investigationCycle,
        maxCycles: this.state.maxCycles,
        converged: this.state.converged,
        paused: this.state.paused,
        researchCycles: [],
        decisions: [],
        missions: [],
        checkpoints: [],
        reasoningEscalations: [],
        reasoningArtifacts: [],
        assessmentSnapshots: [],
        mode: this.mode,
        expandedBudget: null,
        memoryItems: this.memoryStore.serialize().map(m => ({ id: m.id, category: m.category, content: m.content.substring(0, 200), staleness: m.staleness })),
      },
      assessment: this.state.assessment?.summary ?? "No assessment",
      hypotheses: [...this.state.hypotheses.values()].map(h => ({ id: h.id, statement: h.statement, supportLevel: h.supportLevel })),
      evidenceSummary: {
        total: this.state.evidence.size,
        supporting: [...this.state.evidence.values()].filter(e => e.supportsClaimId).length,
        contradicting: [...this.state.evidence.values()].filter(e => e.contradictsClaimId).length,
        independent: [...this.state.evidence.values()].filter(e => e.independentConfirmation).length,
      },
      unresolvedQuestions: [...this.state.informationGaps.values()].filter(g => g.status === "OPEN").map(g => g.question),
      nextAction: this.currentCycle?.nextRecommendedAction ?? "TBD",
      budgetState: { spent: this.costTracker.getSpent(), budget: this.costTracker.getBudget(), remaining: this.costTracker.getBudget() - this.costTracker.getSpent() },
      timestamp: Date.now(),
    };
    this.checkpoints.push(cp);
    this.recordEvent("investigation_memory_stored", `Checkpoint created after cycle ${this.state.investigationCycle}`, { checkpointId: cp.id });
  }

  // ─── Directive 05: Persist investigation ────────────────────────────────
  async persist(): Promise<void> {
    const serialized = serializeState(this.state, {
      researchCycles: this.researchCycles,
      decisions: this.decisions,
      missions: this.missions,
      checkpoints: this.checkpoints,
      memoryItems: this.memoryStore.serialize(),
      assessmentSnapshots: this.assessmentSnapshots,
      reasoningEscalations: this.reasoningEscalations,
      reasoningArtifacts: this.reasoningArtifacts,
      mode: this.mode,
      expandedBudget: null,
    });
    await saveInvestigation(serialized);
  }

  // ─── Directive 05: Recovery from persistence ──────────────────────────────
  static async recover(registry: ModelRegistry, id: string): Promise<InvestigationEngine | null> {
    const serialized = await loadInvestigation(id);
    if (!serialized) return null;

    const restored = deserializeState(serialized);
    const engine = new InvestigationEngine(registry, {
      question: restored.state.question ?? serialized.question,
      budgetUSD: serialized.budgetUSD / (MODE_CONFIGS[restored.mode].budgetMultiplier || 1),
      forceMock: false,
      mode: restored.mode,
    });

    // Restore state
    Object.assign(engine.state, restored.state);
    engine.phase = (restored.state.phase ?? serialized.phase) as InvestigationPhase;
    engine.researchCycles = restored.researchCycles;
    engine.decisions = restored.decisions;
    engine.missions = restored.missions;
    engine.memoryStore.loadItems(restored.memoryItems);
    engine.assessmentSnapshots = restored.assessmentSnapshots;
    engine.reasoningEscalations = restored.reasoningEscalations;
    engine.reasoningArtifacts = restored.reasoningArtifacts;

    // Mark any in-progress missions as failed (they were interrupted)
    engine.missions.forEach(m => {
      if (m.status === "IN_PROGRESS") {
        m.status = "PAUSED";
      }
    });
    engine.taskManager.loadMissions(engine.missions.filter(m => m.status === "PENDING" || m.status === "PAUSED"));

    // Mark any running agent runs as stale
    engine.runs.forEach(r => {
      if (r.status === "RUNNING") {
        r.status = "ERROR";
        r.error = "Interrupted by server restart";
      }
    });

    return engine;
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
    jsonMode = true,
    reasoning?: ReasoningConfig,
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
      maxTokens: reasoning?.effort === "maximum" ? 8192 : reasoning?.effort === "deep" ? 6144 : 4096,
      reasoning,
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
      reasoningEffort: response.reasoningEffort,
    } as AgentRun & { reasoningEffort?: string };
    this.runs.set(run.id, run);

    this.recordEvent("agent_completed", `${role} completed task`, { role, modelId, runId: run.id }, role, modelId);
    return response;
  }

  // ─── Run full investigation (adaptive Director loop) ──────────────────
  // ─── Directive 05: Run full investigation with Research Cycles ──────────
  async run(): Promise<InvestigationState> {
    this.recordEvent("investigation_started", `Investigation started: "${this.state.question}"`, { question: this.state.question, mode: this.mode });
    this.isRunning = true;

    try {
      // Phase 1: Initial setup (cycle 0 — preliminary research)
      const cycle0 = this.startResearchCycle("Preliminary research and hypothesis setup");
      this.recordEvent("director_next_action", `Investigation cycle 0 (preliminary)`, { cycle: 0 });

      await this.runPremiseAudit();
      await this.runDecomposition();
      await this.runHypothesisGeneration();
      await this.runPredictionsAndMindChanging();
      this.transitionTo("RESEARCH_PLANNING");
      this.recordEvent("director_research_priority", "Director planning research priorities", {});
      await this.runIndependentResearch();
      await this.runEvidenceAnalysis();
      await this.runSourceAnalysis();
      await this.runHypothesisTesting();
      await this.runAdversarialReview();
      this.transitionTo("DISAGREEMENT_REVIEW");
      this.recordEvent("disagreement_detected", "Reviewing model disagreements and preserving genuine uncertainty", {});
      this.detectModelDisagreements();
      await this.runGapAnalysis();

      this.completeResearchCycle(cycle0, "Preliminary research complete");
      this.createCheckpoint();

      // Create first assessment snapshot
      if (this.state.assessment) {
        const snap = createAssessmentSnapshot(this.state, cycle0.id, this.assessmentSnapshots.length);
        this.assessmentSnapshots.push(snap);
      }

      // Persist after initial phase
      await this.persist();

      // Phase 2: Adaptive loop — Director-driven research cycles
      while (this.state.investigationCycle < this.state.maxCycles && !this.state.converged) {
        // Check pause
        if (this.isPaused) {
          this.recordEvent("phase_changed", "Investigation paused — will resume when instructed", { paused: true });
          await this.persist();
          break;
        }

        this.state.investigationCycle++;
        this.recordEvent("director_next_action", `Investigation cycle ${this.state.investigationCycle} of ${this.state.maxCycles} (mode: ${this.mode})`, { cycle: this.state.investigationCycle, mode: this.mode });

        // Start a new ResearchCycle
        const cycle = this.startResearchCycle(`Cycle ${this.state.investigationCycle}: Director-directed research`);
        this.currentCycle = cycle;

        // Compute scorecard
        this.state.scorecard = computeScorecard(this.state);
        this.recordEvent("scorecard_updated", "Investigation scorecard updated", this.state.scorecard);

        // Director decides next action
        const action = determineNextAction(this.state);
        this.recordEvent("director_next_action", `Next: ${action.type} — ${action.reason.substring(0, 100)}`, action, "DIRECTOR");
        this.recordEvent("next_action_explained", `WHY: ${action.reason}\nEXPECTED IMPACT: ${action.expectedImpact}\nASSIGNED: ${action.assignedAgent}\nPRIORITY: ${action.priorityBreakdown.formula}`, action, "DIRECTOR");

        // ─── Directive 05: Record the decision ────────────────────────────
        const decision = recordDecision(
          cycle.id, this.state.id,
          "SELECT_RESEARCH",
          `Selected action: ${action.type}`,
          action.reason,
          {
            agent: action.assignedAgent,
            alternatives: action.alternativeAgent ? [{ option: action.alternativeAgent, rejectedBecause: "Lower priority for this task" }] : [],
            whatWouldChange: action.expectedImpact,
          }
        );
        this.decisions.push(decision);

        // ─── Directive 05: Determine reasoning depth ──────────────────────
        const characteristics = analyzeTaskCharacteristics(this.state, action.type, action.targetHypothesisId, action.targetClaimId, action.targetContradictionId);
        let reasoningDepth = determineReasoningDepth(action.type, characteristics, this.modeConfig.defaultReasoningDepth, this.modeConfig.maxReasoningDepth);

        // Check for escalation
        const escalation = shouldEscalate(reasoningDepth, characteristics, this.modeConfig.maxReasoningDepth);
        if (escalation.shouldEscalate) {
          const escRecord = createEscalationRecord("task", cycle.id, reasoningDepth, {
            from: reasoningDepth,
            to: escalation.newDepth,
            reason: escalation.reason,
          });
          this.reasoningEscalations.push(escRecord);
          this.recordEvent("confirmation_bias_check", `REASONING ESCALATION: ${reasoningDepth} → ${escalation.newDepth}\nReason: ${escalation.reason}`, escRecord, "DIRECTOR");
          reasoningDepth = escalation.newDepth;

          // Record escalation decision
          this.decisions.push(recordDecision(
            cycle.id, this.state.id,
            "ESCALATE_REASONING",
            `Escalated reasoning from ${escRecord.initialDepth} to ${reasoningDepth}`,
            escalation.reason,
            { reasoningDepth, agent: "DIRECTOR" }
          ));
        }

        // ─── Directive 05: Create a Research Mission ───────────────────────
        const mission: ResearchMission = {
          id: genMissionId(),
          cycleId: cycle.id,
          investigationId: this.state.id,
          objective: action.question,
          question: action.question,
          hypothesisIds: action.targetHypothesisId ? [action.targetHypothesisId] : [],
          claimIds: action.targetClaimId ? [action.targetClaimId] : [],
          informationGapIds: [],
          expectedEvidence: [],
          discriminatingEvidence: undefined,
          counterevidenceTarget: action.type === "SEARCH_FOR_COUNTEREVIDENCE" ? action.targetHypothesisId : undefined,
          assignedAgent: action.assignedAgent,
          assignedModel: DEFAULT_ROLE_MODELS[action.assignedAgent as AgentRole] ?? "mock/deterministic",
          reasoningDepth,
          priority: Math.round(action.priorityScore),
          budget: Math.min(2.0, this.costTracker.getBudget() - this.costTracker.getSpent()),
          dependencies: [],
          context: this.contextBuilder.buildContext(this.state, {
            question: action.question,
            hypothesisIds: action.targetHypothesisId ? [action.targetHypothesisId] : [],
            claimIds: action.targetClaimId ? [action.targetClaimId] : [],
          }),
          status: "PENDING",
          escalationTriggers: escalation.shouldEscalate ? [escalation.reason] : [],
          createdAt: Date.now(),
        };
        this.missions.push(mission);
        this.taskManager.queueTask(mission);
        cycle.taskIds.push(mission.id);

        // Record mission creation decision
        this.recordEvent("director_next_action", `MISSION: ${mission.objective.substring(0, 100)}\nAgent: ${mission.assignedAgent}\nModel: ${mission.assignedModel}\nReasoning: ${mission.reasoningDepth}\nPriority: ${mission.priority}`, { missionId: mission.id, reasoningDepth: mission.reasoningDepth }, "DIRECTOR");

        // ─── Execute the action with reasoning depth ──────────────────────
        const reasoningConfig: ReasoningConfig = { effort: reasoningDepth };
        const shouldContinue = await this.executeDirectorAction(action, reasoningConfig);
        if (!shouldContinue) {
          this.completeResearchCycle(cycle, "Director chose to converge");
          break;
        }

        // Mark mission complete
        mission.status = "COMPLETED";
        mission.completedAt = Date.now();
        mission.result = {
          findings: "Research completed",
          evidenceDiscovered: [...this.state.evidence.values()].filter(e => e.extractedAt > mission.createdAt).map(e => e.id),
          claimsCreated: [...this.state.claims.values()].filter(c => c.createdAt > mission.createdAt).map(c => c.id),
          contradictionsDiscovered: [],
          assessmentImpact: action.expectedImpact === "CRITICAL" ? "CRITICAL" : action.expectedImpact === "HIGH" ? "HIGH" : "MODERATE",
          cost: 0,
          duration: 0,
          completedAt: Date.now(),
        };

        // ─── Directive 05: Cycle review ────────────────────────────────────
        const review = reviewCycle(this.state, cycle);
        cycle.nextRecommendedAction = review.shouldContinue ? review.why : "Converge";

        // Distill memory from this cycle
        const distilled = review.distilledMemory;
        for (const fact of distilled.established) {
          this.memoryStore.store("VERIFIED_FACT", fact, `Cycle ${this.state.investigationCycle}`, 0.8, { cycleId: cycle.id });
        }
        for (const item of distilled.weakened) {
          this.memoryStore.store("IMPORTANT_EVIDENCE", item, `Cycle ${this.state.investigationCycle}`, 0.6, { cycleId: cycle.id });
        }
        for (const item of distilled.disproven) {
          this.memoryStore.store("REJECTED_CLAIM", item, `Cycle ${this.state.investigationCycle}`, 0.9, { cycleId: cycle.id });
        }
        for (const item of distilled.remainsUnknown) {
          this.memoryStore.store("UNRESOLVED_QUESTION", item, `Cycle ${this.state.investigationCycle}`, 0.5, { cycleId: cycle.id });
        }
        for (const item of distilled.doNotAssume) {
          this.memoryStore.store("IMPORTANT_CONTRADICTION", item, `Cycle ${this.state.investigationCycle}`, 0.7, { cycleId: cycle.id });
        }

        this.recordEvent("investigation_memory_stored", `Memory distilled: ${distilled.established.length} established, ${distilled.weakened.length} weakened, ${distilled.disproven.length} disproven, ${distilled.remainsUnknown.length} unknown`, distilled, "DIRECTOR");

        // Complete cycle
        this.completeResearchCycle(cycle, review.why);
        cycle.endingAssessment = this.state.assessment?.summary ?? "No assessment";

        // Create checkpoint and assessment snapshot
        this.createCheckpoint();
        if (this.state.assessment) {
          const snap = createAssessmentSnapshot(this.state, cycle.id, this.assessmentSnapshots.length);
          this.assessmentSnapshots.push(snap);

          // Compare with previous snapshot if available
          if (this.assessmentSnapshots.length >= 2) {
            const prev = this.assessmentSnapshots[this.assessmentSnapshots.length - 2];
            const diff = compareSnapshots(prev, snap);
            if (diff.changes.some(c => c.direction !== "UNCHANGED")) {
              this.recordEvent("assessment_updated", `Assessment changed: ${diff.changes.filter(c => c.direction !== "UNCHANGED").map(c => `${c.hypothesisStatement.substring(0, 50)}: ${c.direction}`).join("; ")}`, diff);
            }
          }
        }

        // ─── Directive 05: Multi-model review for deep/forensic modes ──────
        if (this.modeConfig.multiModelReview && this.state.investigationCycle >= 3 && !this.state.converged) {
          await this.runMultiModelReview(action, reasoningConfig);
        }

        // ─── Directive 05: Second-pass review for important tasks ──────────
        if (this.modeConfig.secondPassReview && (action.expectedImpact === "HIGH" || action.expectedImpact === "CRITICAL")) {
          await this.runSecondPassReview(action, reasoningConfig);
        }

        // Persist after each cycle
        await this.persist();

        // Check convergence
        const convergence = evaluateConvergence(this.state);
        this.state.convergenceCheck = convergence;
        this.recordEvent("convergence_check", `Convergence check: ${convergence.overall ? "PROVISIONAL CONVERGENCE" : "Not yet converged"}\n${convergence.details.join("\n")}`, convergence);

        if (convergence.overall) {
          this.state.converged = true;
          await this.runReassessment();
          await this.runConvergence();
          this.recordEvent("investigation_converged", `Investigation converged after ${this.state.investigationCycle} cycles`, { cycles: this.state.investigationCycle });
          await this.persist();
          break;
        }

        // If budget exceeded, stop with explicit uncertainty
        if (this.costTracker.isBudgetExceeded()) {
          this.recordEvent("budget_exceeded", `Budget exceeded — $${this.costTracker.getSpent().toFixed(2)} of $${this.costTracker.getBudget().toFixed(2)}\n\nCurrent assessment:\n${this.state.assessment?.summary ?? "No assessment"}\n\nMajor unresolved questions:\n${[...this.state.informationGaps.values()].filter(g => g.status === "OPEN").map(g => g.question).join("\n")}`);
          this.state.paused = true;
          await this.persist();
          break;
        }
      }

      // Final scorecard and convergence
      if (!this.state.converged && !this.isPaused) {
        this.state.convergenceCheck = evaluateConvergence(this.state);
        this.state.scorecard = computeScorecard(this.state);
        await this.runReassessment();
        await this.runConvergence();
        await this.persist();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordEvent("phase_changed", `Investigation error: ${msg}`, { error: msg });
      this.state.phase = "FAILED";
      await this.persist();
    } finally {
      this.isRunning = false;
    }

    return this.state;
  }

  // ─── Directive 05: Research Cycle Management ────────────────────────────
  private startResearchCycle(objective: string): ResearchCycle {
    const cycle: ResearchCycle = {
      id: genId("cycle"),
      investigationId: this.state.id,
      sequence: this.state.investigationCycle,
      objective,
      startingAssessment: this.state.assessment?.summary ?? "No assessment yet",
      startingHypotheses: [...this.state.hypotheses.values()].map(h => ({ id: h.id, statement: h.statement, supportLevel: h.supportLevel })),
      startingUnknowns: [...this.state.informationGaps.values()].filter(g => g.status === "OPEN").map(g => g.question),
      taskIds: [],
      agentRunIds: [],
      evidenceDiscovered: [],
      claimsCreated: [],
      contradictionsDiscovered: [],
      hypothesisChanges: [],
      assessmentChange: "",
      newInformationGaps: [],
      endingAssessment: "",
      nextRecommendedAction: "",
      reasoningDepth: this.modeConfig.defaultReasoningDepth,
      cost: 0,
      duration: 0,
      status: "RUNNING",
      startedAt: Date.now(),
    };
    this.researchCycles.push(cycle);
    this.currentCycle = cycle;
    return cycle;
  }

  private completeResearchCycle(cycle: ResearchCycle, reason: string): void {
    cycle.status = "COMPLETED";
    cycle.completedAt = Date.now();
    cycle.duration = cycle.completedAt - cycle.startedAt;
    cycle.cost = this.costTracker.getSpent();
    cycle.endingAssessment = this.state.assessment?.summary ?? "No assessment";
    cycle.evidenceDiscovered = [...this.state.evidence.values()].filter(e => e.extractedAt >= cycle.startedAt).map(e => e.id);
    cycle.claimsCreated = [...this.state.claims.values()].filter(c => c.createdAt >= cycle.startedAt).map(c => c.id);
    cycle.contradictionsDiscovered = [...this.state.contradictions.values()].filter(c => c.detectedAt >= cycle.startedAt).map(c => c.id);
    this.currentCycle = null;
    this.recordEvent("director_next_action", `Cycle ${cycle.sequence} completed: ${reason}`, { cycleId: cycle.id, duration: cycle.duration });
  }

  // ─── Directive 05: Multi-Model Deep Review ────────────────────────────────
  private async runMultiModelReview(action: NextInvestigationAction, reasoningConfig: ReasoningConfig): Promise<void> {
    if (this.state.hypotheses.size === 0) return;

    const leadingHypothesis = [...this.state.hypotheses.values()].reduce((a, b) => {
      const order = ["STRONG", "MODERATE", "WEAK", "INSUFFICIENT_EVIDENCE", "NONE"];
      return order.indexOf(a.supportLevel) < order.indexOf(b.supportLevel) ? a : b;
    });

    this.recordEvent("council_round_started", `Multi-model review: ${leadingHypothesis.statement.substring(0, 80)}`, { hypothesisId: leadingHypothesis.id });

    // Get available model families (exclude mock in real mode)
    const models = this.registry.listModels().filter(m =>
      m.provider !== "mock" || this.state.spentUSD === 0
    ).slice(0, 3); // up to 3 independent models

    if (models.length < 2) return; // need at least 2 for comparison

    const assessments: Array<{ modelId: string; assessment: string; evidence: string[]; assumptions: string[]; uncertainties: string[] }> = [];

    for (const model of models) {
      try {
        const prompt = `Investigation question: "${this.state.question}"\n\nHypothesis: ${leadingHypothesis.statement}\n\nEvidence:\n${[...this.state.evidence.values()].slice(0, 20).map(e => `- ${e.text}`).join("\n")}\n\nAssess this hypothesis. What is your assessment? What evidence do you rely on? What assumptions are you making? What uncertainties remain?`;

        const response = await this.callAI("EVIDENCE_ANALYST", prompt, true, { effort: "deep" });
        const parsed = (response.json ?? this.tryParse(response.text)) as Record<string, unknown> | null;

        assessments.push({
          modelId: model.id,
          assessment: (parsed?.assessment as string) ?? response.text.substring(0, 200),
          evidence: (parsed?.evidence as string[]) ?? [],
          assumptions: (parsed?.assumptions as string[]) ?? [],
          uncertainties: (parsed?.uncertainties as string[]) ?? [],
        });
      } catch (err) {
        // Skip failed models
        continue;
      }
    }

    // Compare assessments — preserve disagreement, do NOT majority vote
    if (assessments.length >= 2) {
      const disagreements = assessments.filter(a =>
        a.assessment.toLowerCase().includes("weak") || a.assessment.toLowerCase().includes("unlikely")
      );
      const agreements = assessments.filter(a =>
        a.assessment.toLowerCase().includes("support") || a.assessment.toLowerCase().includes("likely")
      );

      if (disagreements.length > 0 && agreements.length > 0) {
        this.recordEvent("disagreement_detected", `Multi-model disagreement on "${leadingHypothesis.statement.substring(0, 60)}": ${agreements.length} supporting, ${disagreements.length} weakening`, { assessments });
      } else if (agreements.length === assessments.length) {
        this.recordEvent("council_round_started", `Multi-model consensus: all ${assessments.length} models agree on assessment`, { assessments });
      }
    }
  }

  // ─── Directive 05: Second-Pass Critic Review ────────────────────────────
  private async runSecondPassReview(action: NextInvestigationAction, reasoningConfig: ReasoningConfig): Promise<void> {
    this.recordEvent("adversarial_round_started", `Second-pass critic review for: ${action.type}`, { actionType: action.type });

    const criticPrompt = `You are a critical reviewer for an investigation about: "${this.state.question}"\n\nA previous analysis concluded: ${action.question}\n\nRelevant evidence:\n${[...this.state.evidence.values()].slice(0, 15).map(e => `- ${e.text}`).join("\n")}\n\nYour job is to identify what is WRONG, UNSUPPORTED, or MISSING in this analysis. Do NOT simply agree. Find the flaws. Output JSON: {flaws: [{type: "unsupported" | "missing_evidence" | "hidden_assumption" | "incorrect_interpretation", description: string, severity: "LOW" | "MODERATE" | "HIGH"}], revised_conclusion: string}`;

    try {
      const response = await this.callAI("SKEPTIC", criticPrompt, true, { effort: reasoningConfig.effort === "standard" ? "deep" : "maximum" });
      const parsed = (response.json ?? this.tryParse(response.text)) as { flaws?: Array<{ type: string; description: string; severity: string }>; revised_conclusion?: string } | null;

      if (parsed?.flaws?.length) {
        for (const flaw of parsed.flaws) {
          this.recordEvent("adversarial_challenge_created", `Critic found: [${flaw.severity}] ${flaw.type}: ${flaw.description.substring(0, 100)}`, flaw, "SKEPTIC");
        }
      }

      if (parsed?.revised_conclusion) {
        this.recordEvent("assessment_updated", `Second-pass revised conclusion: ${parsed.revised_conclusion.substring(0, 150)}`, parsed, "SKEPTIC");
      }

      // Store reasoning artifact
      const artifact: ReasoningArtifact = {
        id: genId("artifact"),
        agentRunId: this.runs.size > 0 ? [...this.runs.values()][this.runs.size - 1].id : "",
        decision: parsed?.revised_conclusion ?? "No revision",
        evidenceReliedUpon: parsed?.flaws?.map(f => f.description) ?? [],
        evidenceRejected: [],
        assumptions: [],
        uncertainties: parsed?.flaws?.map(f => f.description) ?? [],
        counterarguments: parsed?.flaws?.map(f => f.description) ?? [],
        unresolvedQuestions: [],
        decisionRationale: "Second-pass critical review",
        whatWouldChangeAssessment: "",
        recommendedNextAction: "",
        createdAt: Date.now(),
      };
      this.reasoningArtifacts.push(artifact);
    } catch (err) {
      this.recordEvent("phase_changed", `Second-pass review failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── Directive 05: Reopen converged investigation ──────────────────────────
  async reopen(trigger: string): Promise<void> {
    if (!this.state.converged) return;

    this.state.converged = false;
    this.state.phase = "REASSESSMENT";
    this.recordEvent("investigation_reopened", `Investigation reopened\nTrigger: ${trigger}\n\nPrevious assessment will be revisited`, { trigger });

    // Record decision
    this.decisions.push(recordDecision(
      this.currentCycle?.id ?? "none", this.state.id,
      "REOPEN",
      `Reopened investigation: ${trigger}`,
      "New evidence or user intervention warranted reopening",
      { agent: "DIRECTOR" }
    ));

    // Resume the investigation loop
    this.isPaused = false;
    this.state.paused = false;
    await this.run();
  }

  // ─── Directive 05: Research Refresh ──────────────────────────────────────
  async refreshResearch(): Promise<void> {
    this.recordEvent("investigation_reopened", "Checking for new information since last cycle", { refresh: true });

    // In mock mode, this just records the check
    // In real mode, this would trigger new web searches
    const lastCycle = this.researchCycles[this.researchCycles.length - 1];
    if (lastCycle) {
      this.recordEvent("director_next_action", `Last research was ${Math.round((Date.now() - lastCycle.completedAt!) / 1000 / 60)} minutes ago`, { lastCycle: lastCycle.id });
    }

    // If new evidence is found (simulated here), reopen
    const newEvidenceCount = [...this.state.evidence.values()].filter(e => e.extractedAt > (lastCycle?.completedAt ?? 0)).length;
    if (newEvidenceCount > 0) {
      this.recordEvent("investigation_reopened", `${newEvidenceCount} new evidence items found since last cycle`, { newEvidence: newEvidenceCount });
      if (this.state.converged) {
        await this.reopen(`New evidence discovered (${newEvidenceCount} items)`);
      }
    }
  }

  // ─── Execute Director Action ─────────────────────────────────────────
  private async executeDirectorAction(action: NextInvestigationAction, reasoningConfig?: ReasoningConfig): Promise<boolean> {
    switch (action.type) {
      case "RESEARCH":
      case "SEARCH_PRIMARY_SOURCE":
      case "SEARCH_FOR_COUNTEREVIDENCE":
      case "FIND_PRIMARY_EVIDENCE":
        await this.runTargetedResearchFromAction(action, reasoningConfig);
        return true;

      case "INVESTIGATE_CONTRADICTION":
        await this.investigateContradictionFromAction(action, reasoningConfig);
        return true;

      case "TEST_PREDICTION":
        this.testPrediction(action);
        return true;

      case "REASSESS":
        await this.runReassessment();
        return true;

      case "INVESTIGATE_DISCRIMINATING_EVIDENCE":
        await this.investigateDiscriminatingEvidence(action, reasoningConfig);
        return true;

      case "CHECK_CAUSALITY":
        this.reviewCausalClaim(action);
        return true;

      case "FOLLOW_RELATIONSHIP":
        await this.investigateEntityRelationship(action, reasoningConfig);
        return true;

      case "CONVERGE":
        return false;

      default:
        return true;
    }
  }

  // ─── Predictions & Mind-Changing Evidence ─────────────────────────────
  private async runPredictionsAndMindChanging(): Promise<void> {
    this.recordEvent("phase_changed", "Generating predictions and mind-changing evidence", { phase: "HYPOTHESIS_GENERATION" });

    for (const hyp of this.state.hypotheses.values()) {
      // Create predictions from expected evidence
      const preds = createPredictionsForHypothesis(hyp);
      for (const pred of preds) {
        const prediction: Prediction = {
          ...pred,
          id: genId("pred"),
          createdAt: Date.now(),
        };
        this.state.predictions.set(prediction.id, prediction);
        this.recordEvent("prediction_created", `Prediction for ${hyp.id}: ${prediction.description.substring(0, 80)}`, prediction);
      }

      // Initialize mind-changing evidence
      const mce = initMindChangingEvidence(hyp);
      this.state.mindChangingEvidence.set(hyp.id, mce);
      this.recordEvent("mind_changing_evidence_updated", `Mind-changing evidence registered for ${hyp.id}`, mce);
    }
  }

  // ─── Source Analysis (replaces Council Comparison) ────────────────────
  private async runSourceAnalysis(): Promise<void> {
    this.transitionTo("SOURCE_ANALYSIS");

    // Detect evidence clusters (source contamination)
    const clusters = detectEvidenceClusters(this.state.sources, this.state.evidence);
    for (const cluster of clusters) {
      this.state.evidenceClusters.set(cluster.id, cluster);
      this.recordEvent("evidence_cluster_detected", cluster.message, cluster);
    }

    // Detect narrative patterns
    const narratives = detectNarrativePatterns(this.state.sources, this.state.evidence);
    for (const narrative of narratives) {
      this.state.narrativePatterns.set(narrative.id, narrative);
      this.recordEvent("narrative_pattern_detected", narrative.note, narrative);
    }

    // Extract entities and relationships
    const { entities, relationships } = extractEntitiesFromEvidence(this.state.evidence, this.state.sources);
    for (const entity of entities) {
      this.state.entities.set(entity.id, entity);
      this.recordEvent("entity_discovered", `Entity: ${entity.name} (${entity.type}, ${entity.mentions} mentions)`, entity);
    }
    for (const rel of relationships) {
      this.state.relationships.set(rel.id, rel);
    }

    // Detect causal claims
    const causalClaims = detectCausalClaims(this.state.claims);
    for (const cc of causalClaims) {
      this.state.causalClaims.set(cc.id, cc);
      this.recordEvent("causal_claim_reviewed", `Causal claim detected: "${cc.cause}" → "${cc.effect}"`, cc);
    }
  }

  // ─── Hypothesis Testing (new phase) ──────────────────────────────────
  private async runHypothesisTesting(): Promise<void> {
    this.transitionTo("HYPOTHESIS_TESTING");

    // Link claims to hypotheses and assess support (from former council comparison)
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
          if (evidenceId && !hyp.supportingEvidence.includes(evidenceId)) {
            exp.evidenceId = evidenceId;
            hyp.supportingEvidence.push(evidenceId);
          }
          this.recordEvent("expected_evidence_found", `Expected evidence found for ${hyp.id}: ${exp.description}`, { hypothesisId: hyp.id, expectedId: exp.id });
        } else {
          exp.status = "MISSING";
          this.recordEvent("expected_evidence_missing", `Expected evidence missing for ${hyp.id}: ${exp.description}`, { hypothesisId: hyp.id, expectedId: exp.id });
        }
      }

      // Set initial support level
      hyp.supportLevel = this.assessSupportLevel(hyp);
    }

    // Check for model disagreements
    this.detectModelDisagreements();

    // Test predictions
    for (const pred of [...this.state.predictions.values()]) {
      if (pred.status !== "PENDING") continue;
      const result = evaluatePrediction(pred, this.state.evidence);
      pred.status = result.status;
      pred.observedResult = result.observedResult;
      pred.evidenceId = result.evidenceId;
      pred.testedAt = Date.now();

      if (result.status === "CONFIRMED") {
        this.recordEvent("prediction_tested", `Prediction confirmed for ${pred.hypothesisId}: ${pred.description.substring(0, 60)}`, pred);
      } else if (result.status === "FAILED") {
        pred.severity = result.severity as Prediction["severity"];
        this.recordEvent("prediction_failed", `Prediction FAILED for ${pred.hypothesisId}: expected "${pred.expectedResult.substring(0, 60)}" but found "${pred.observedResult?.substring(0, 60)}"`, pred);

        // Create failed prediction record
        const fp: FailedPrediction = {
          id: genId("failed-pred"),
          hypothesisId: pred.hypothesisId,
          predictionId: pred.id,
          expectedResult: pred.expectedResult,
          observedResult: pred.observedResult ?? "No matching evidence found",
          severity: result.severity as FailedPrediction["severity"],
          evidenceId: result.evidenceId,
          reassessmentTriggered: false,
          createdAt: Date.now(),
        };
        this.state.failedPredictions.set(fp.id, fp);

        // Store in investigation memory
        const mem = storeMemory("FAILED_HYPOTHESIS", `Prediction for ${pred.hypothesisId} failed: expected ${pred.expectedResult} but observed ${pred.observedResult}`, pred.id, 0.8);
        this.state.investigationMemory.set(mem.id, mem);
        this.recordEvent("investigation_memory_stored", `Memory: Failed prediction for ${pred.hypothesisId}`, mem);
      }
    }

    // Hypothesis competition — compare all pairs
    const hyps = [...this.state.hypotheses.values()];
    for (let i = 0; i < hyps.length; i++) {
      for (let j = i + 1; j < hyps.length; j++) {
        const competition = compareHypotheses(hyps[i], hyps[j], this.state);
        this.state.hypothesisCompetitions.set(competition.id, competition);
        this.recordEvent("hypothesis_competition", `Competition: ${hyps[i].id} vs ${hyps[j].id} — ${competition.discriminatingEvidence.length} discriminating evidence items`, competition);

        // Identify discriminating evidence tasks
        const task = identifyDiscriminatingTask(hyps[i], hyps[j], this.state);
        if (task) {
          this.state.discriminatingTasks.set(task.id, task);
          this.recordEvent("discriminating_evidence_task", `Need discriminating evidence for ${hyps[i].id} vs ${hyps[j].id}`, task);
        }
      }
    }

    // Confirmation bias checks
    for (const hyp of this.state.hypotheses.values()) {
      const biasCheck = checkConfirmationBias(hyp);
      this.recordEvent("confirmation_bias_check", `Confirmation bias check for ${hyp.id}: ${biasCheck.passed ? "PASSED" : "FAILED"}\n${biasCheck.checks.map(c => `  ${c.passed ? "✓" : "✗"} ${c.check}: ${c.detail}`).join("\n")}`, { hypothesisId: hyp.id, ...biasCheck });
    }

    // Store verified facts in investigation memory
    for (const claim of this.state.claims.values()) {
      if (claim.status === "SUPPORTED") {
        const mem = storeMemory("VERIFIED_FACT", claim.text, claim.id, 0.7);
        this.state.investigationMemory.set(mem.id, mem);
      } else if (claim.status === "CONTRADICTED") {
        const mem = storeMemory("REJECTED_CLAIM", claim.text, claim.id, 0.7);
        this.state.investigationMemory.set(mem.id, mem);
      }
    }
  }

  // ─── Director action implementations ─────────────────────────────────

  private async runTargetedResearchFromAction(action: NextInvestigationAction, reasoningConfig?: import("./persistence-types.js").ReasoningConfig): Promise<void> {
    this.transitionTo("TARGETED_RESEARCH");
    const role: AgentRole = action.assignedAgent === "ADVERSARIAL" ? "ADVERSARIAL"
      : action.assignedAgent === "SKEPTIC" ? "SKEPTIC"
      : "PRIMARY_SOURCE_RESEARCHER";

    const response = await this.callAI(
      role,
      `Investigation question: "${this.state.question}"\n\nResearch this specific question: "${action.question}"\n\nFind primary sources. Report findings. Output JSON: {findings: [{source, source_type, url, key_facts[], confidence, is_primary, cites?}]}`,
    );
    this.processResearchFindings(response, role);
  }

  private async investigateContradictionFromAction(action: NextInvestigationAction, reasoningConfig?: import("./persistence-types.js").ReasoningConfig): Promise<void> {
    const conId = action.targetContradictionId;
    if (!conId) return;
    const con = this.state.contradictions.get(conId);
    if (!con) return;

    const result = investigateContradiction(con, this.state.claims, this.state.evidence);
    con.status = result.status;
    con.resolution = result.resolution;
    con.investigation = result.resolution;
    this.recordEvent("contradiction_detected", `Contradiction ${conId} resolved: ${result.status} — ${result.resolution.substring(0, 80)}`, { contradictionId: conId, ...result });
  }

  private testPrediction(action: NextInvestigationAction): void {
    if (!action.targetHypothesisId) return;
    const preds = [...this.state.predictions.values()].filter(p => p.hypothesisId === action.targetHypothesisId && p.status === "PENDING");
    for (const pred of preds) {
      const result = evaluatePrediction(pred, this.state.evidence);
      pred.status = result.status;
      pred.observedResult = result.observedResult;
      pred.testedAt = Date.now();
      this.recordEvent("prediction_tested", `Prediction ${pred.id}: ${result.status}`, pred);
    }
  }

  private async investigateDiscriminatingEvidence(action: NextInvestigationAction, reasoningConfig?: import("./persistence-types.js").ReasoningConfig): Promise<void> {
    const response = await this.callAI(
      "PRIMARY_SOURCE_RESEARCHER",
      `Investigation question: "${this.state.question}"\n\nFind evidence that distinguishes these hypotheses:\n${action.question}\n\nOutput JSON: {findings: [{source, source_type, url, key_facts[], confidence, is_primary}]}`,
    );
    this.processResearchFindings(response, "PRIMARY_SOURCE_RESEARCHER");

    // Mark discriminating tasks as found
    for (const task of this.state.discriminatingTasks.values()) {
      if (task.status === "PENDING") {
        task.status = "FOUND";
        task.result = "Research completed — see new evidence";
        this.recordEvent("discriminating_evidence_found", `Discriminating evidence found for ${task.hypothesisA} vs ${task.hypothesisB}`, task);
      }
    }
  }

  private reviewCausalClaim(action: NextInvestigationAction): void {
    for (const cc of this.state.causalClaims.values()) {
      if (cc.status !== "PENDING") continue;
      // Basic causal review
      cc.temporalOrdering = "UNKNOWN";
      cc.alternativeExplanations = [...this.state.hypotheses.values()].map(h => h.statement).filter(s => s !== cc.cause);
      cc.correlationVsCausation = "UNCLEAR";
      cc.status = "REVIEWED";
      this.recordEvent("causal_claim_reviewed", `Causal claim reviewed: "${cc.cause}" → "${cc.effect}" — ${cc.status}`, cc);
    }
  }

  private async investigateEntityRelationship(action: NextInvestigationAction, reasoningConfig?: import("./persistence-types.js").ReasoningConfig): Promise<void> {
    if (!action.targetEntityId) return;
    const entity = this.state.entities.get(action.targetEntityId);
    if (!entity) return;

    const response = await this.callAI(
      "OSINT_RESEARCHER",
      `Investigation question: "${this.state.question}"\n\nInvestigate: ${action.question}\n\nWhat relationships does ${entity.name} have with other entities in this investigation? Output JSON: {findings: [{source, source_type, url, key_facts[], confidence, is_primary}]}`,
    );
    this.processResearchFindings(response, "OSINT_RESEARCHER");
    this.recordEvent("relationship_investigated", `Relationship investigation: ${entity.name}`, { entityId: entity.id });
  }

  // ─── Gap Analysis (updated) ─────────────────────────────────────────
  private async runGapAnalysis(): Promise<void> {
    this.transitionTo("INFORMATION_GAP_ANALYSIS");

    const prompt = this.buildGapAnalysisPrompt();
    const response = await this.callAI("SKEPTIC", prompt);

    const parsed = (response.json ?? this.tryParse(response.text)) as {
      gaps?: Array<{ question: string; importance: string; expected_impact: string }>;
    } | null;

    if (parsed?.gaps) {
      for (const g of parsed.gaps) {
        const gapId = genId("gap");
        const gap: InformationGap = {
          id: gapId,
          question: g.question,
          importance: (g.importance as InformationGap["importance"]) || "MODERATE",
          expectedImpact: g.expected_impact,
          status: "OPEN",
          createdFromAdversarial: true,
          createdAt: Date.now(),
        };
        this.state.informationGaps.set(gapId, gap);
        this.recordEvent("information_gap_created", `Information gap: ${g.question.substring(0, 80)}`, gap);

        // Create research tasks for high-priority gaps
        if (gap.importance === "HIGH" || gap.importance === "CRITICAL") {
          const taskId = genId("task");
          const task: ResearchTask = {
            id: taskId,
            question: g.question,
            assignedTo: "PRIMARY_SOURCE_RESEARCHER",
            modelId: DEFAULT_ROLE_MODELS["PRIMARY_SOURCE_RESEARCHER"],
            status: "PENDING",
            priority: gap.importance === "CRITICAL" ? "CRITICAL" : "HIGH",
            createdAt: Date.now(),
          };
          this.state.researchTasks.set(taskId, task);
          this.recordEvent("research_task_created", `Research task: ${g.question.substring(0, 80)}`, task);
          gap.status = "INVESTIGATING";
        }
      }
    }
  }

  private buildGapAnalysisPrompt(): string {
    const hyps = [...this.state.hypotheses.values()];
    const evidence = [...this.state.evidence.values()];
    const sources = [...this.state.sources.values()];
    const failedPreds = [...this.state.failedPredictions.values()];

    return `Investigation question: "${this.state.question}"

Current state:
- ${hyps.length} hypotheses
- ${evidence.length} evidence items from ${sources.length} sources
- ${failedPreds.length} failed predictions

Hypotheses:
${hyps.map(h => `${h.id} [${h.supportLevel}]: ${h.statement}\n  Evidence: ${h.supportingEvidence.length} supporting, ${h.contradictingEvidence.length} contradicting`).join("\n")}

Failed predictions:
${failedPreds.map(fp => `${fp.hypothesisId}: expected "${fp.expectedResult.substring(0, 60)}" but observed "${fp.observedResult.substring(0, 60)}"`).join("\n")}

Identify the most important information gaps — unresolved questions that could most change the current assessment. For each gap, rate its importance and expected impact.
Output JSON: {gaps: [{question, importance, expected_impact}]}`;
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
    this.transitionTo("QUESTION_DECOMPOSITION");
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
    this.transitionTo("SOURCE_ANALYSIS");
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
      const previousAssessment = this.state.assessment
        ? `${this.state.assessment.confidenceLevel} confidence`
        : "No prior assessment";
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

      // Create assessment revision
      const revision = createAssessmentRevision(
        this.state.assessmentRevisions.size + 1,
        previousAssessment,
        `${assessment.confidenceLevel} confidence`,
        this.state.investigationCycle > 0 ? `Director cycle ${this.state.investigationCycle}` : "Initial assessment",
        assessment.supportingEvidence,
        assessment.summary ?? "Assessment generated",
        ["SYNTHESIS", "DIRECTOR"],
      );
      this.state.assessmentRevisions.set(revision.id, revision);
      this.recordEvent("assessment_revision_created", `Revision #${revision.revisionNumber}: ${previousAssessment} → ${revision.newAssessment}`, revision);
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
    this.transitionTo("CONVERGENCE_REVIEW");

    // Evaluate convergence criteria
    const convergence = evaluateConvergence(this.state);
    this.state.convergenceCheck = convergence;

    if (convergence.overall) {
      this.state.converged = true;
      this.recordEvent("investigation_converged",
        `Investigation reached provisional convergence after ${this.convergenceChecks} cycle(s).\n${convergence.details.join("\n")}`,
        convergence);
    } else {
      this.recordEvent("convergence_check",
        `Convergence not yet reached. ${convergence.details.join("; ")}`,
        convergence);
    }

    // Compute final scorecard
    this.state.scorecard = computeScorecard(this.state);
    this.recordEvent("scorecard_updated", "Final scorecard computed", this.state.scorecard);

    // Final assessment if not already generated
    if (!this.state.assessment) {
      await this.generateAssessment();
    }
  }

  // ─── User Intervention ─────────────────────────────────────────────────
  async addUserIntervention(instruction: string): Promise<void> {
    this.userInterventions.push(instruction);
    this.recordEvent("user_intervention", `User directive: "${instruction}"`, { instruction });

    // Determine override type
    const overrideType = this.classifyOverride(instruction);
    const override = createUserOverride(overrideType, instruction);
    this.state.userOverrides.set(override.id, override);
    this.recordEvent("user_override_recorded", `Override: ${overrideType} — ${instruction}`, override);

    // Convert instruction to a research task based on type
    const role = overrideType === "TRY_TO_DISPROVE_THIS" ? "ADVERSARIAL"
      : overrideType === "FIND_PRIMARY_EVIDENCE" ? "PRIMARY_SOURCE_RESEARCHER"
      : "PRIMARY_SOURCE_RESEARCHER";

    const taskId = genId("task");
    const task: ResearchTask = {
      id: taskId,
      question: instruction,
      assignedTo: role,
      modelId: DEFAULT_ROLE_MODELS[role as AgentRole],
      status: "PENDING",
      priority: "HIGH",
      createdAt: Date.now(),
      fromUserIntervention: true,
    };
    this.state.researchTasks.set(taskId, task);
    this.recordEvent("research_task_created", `Research task from user: ${instruction}`, task);

    // If reopening investigation
    if (overrideType === "REOPEN_INVESTIGATION" && this.state.converged) {
      this.state.converged = false;
      this.state.phase = "REASSESSMENT";
      this.recordEvent("investigation_reopened", "Investigation reopened — reassessing with new evidence", { instruction });
    }

    // If stopping
    if (overrideType === "STOP_INVESTIGATING") {
      this.state.paused = true;
    }
  }

  private classifyOverride(instruction: string): UserOverrideType {
    const lower = instruction.toLowerCase();
    if (/stop|pause|halt|enough/.test(lower)) return "STOP_INVESTIGATING";
    if (/reopen|continue|resume/.test(lower)) return "REOPEN_INVESTIGATION";
    if (/disprove|falsif|counter|against/.test(lower)) return "TRY_TO_DISPROVE_THIS";
    if (/primary|original|source/.test(lower) && /find|search|look/.test(lower)) return "FIND_PRIMARY_EVIDENCE";
    if (/entity|company|person|organization|follow/.test(lower)) return "FOLLOW_THIS_ENTITY";
    if (/ignore|drop|skip|exclude/.test(lower)) return "IGNORE_THIS_HYPOTHESIS";
    return "INVESTIGATE_THIS";
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
