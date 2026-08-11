// ─── DIRECTIVE 05: PERSISTENT DEEP INVESTIGATION TYPES ────────────────────
// Research cycles, reasoning depth, decision history, missions, checkpoints,
// memory staleness, investigation modes, expanded budget.

import type { AgentRole } from "./types.js";

// ─── Reasoning Configuration ─────────────────────────────────────────────
export type ReasoningEffort = "standard" | "deep" | "maximum";

export interface ReasoningConfig {
  effort: ReasoningEffort;
  budgetTokens?: number;
}

export interface ReasoningEscalation {
  id: string;
  taskId: string;
  cycleId: string;
  initialDepth: ReasoningEffort;
  currentDepth: ReasoningEffort;
  triggers: ReasoningEscalationTrigger[];
  timestamp: number;
}

export interface ReasoningEscalationTrigger {
  from: ReasoningEffort;
  to: ReasoningEffort;
  reason: string;
  timestamp: number;
}

// ─── Reasoning Artifact (inspectable reasoning output) ────────────────────
export interface ReasoningArtifact {
  id: string;
  agentRunId: string;
  decision: string;
  evidenceReliedUpon: string[];
  evidenceRejected: string[];
  assumptions: string[];
  uncertainties: string[];
  counterarguments: string[];
  unresolvedQuestions: string[];
  decisionRationale: string;
  whatWouldChangeAssessment: string;
  recommendedNextAction: string;
  createdAt: number;
}

// ─── Research Cycle ──────────────────────────────────────────────────────
export type CycleStatus = "PLANNED" | "RUNNING" | "WAITING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface ResearchCycle {
  id: string;
  investigationId: string;
  sequence: number;
  objective: string;
  startingAssessment: string;
  startingHypotheses: Array<{ id: string; statement: string; supportLevel: string }>;
  startingUnknowns: string[];
  taskIds: string[];
  agentRunIds: string[];
  evidenceDiscovered: string[];
  claimsCreated: string[];
  contradictionsDiscovered: string[];
  hypothesisChanges: Array<{ hypothesisId: string; previousSupport: string; newSupport: string; reason: string }>;
  assessmentChange: string;
  newInformationGaps: string[];
  endingAssessment: string;
  nextRecommendedAction: string;
  reasoningDepth: ReasoningEffort;
  cost: number;
  duration: number;
  status: CycleStatus;
  startedAt: number;
  completedAt?: number;
}

// ─── Investigation Decision ───────────────────────────────────────────────
export type DecisionType =
  | "SELECT_RESEARCH"
  | "ASSIGN_AGENT"
  | "SELECT_MODEL"
  | "SET_REASONING_DEPTH"
  | "ESCALATE_REASONING"
  | "CREATE_MISSION"
  | "CONVERGE"
  | "REOPEN"
  | "PAUSE"
  | "RESUME"
  | "BUDGET_REALLOCATION"
  | "HYPOTHESIS_REVISION"
  | "ASSESSMENT_REVISION";

export interface InvestigationDecision {
  id: string;
  investigationId: string;
  cycleId: string;
  decisionType: DecisionType;
  decision: string;
  reason: string;
  evidence: string[];
  assumptions: string[];
  alternativesConsidered: Array<{ option: string; rejectedBecause: string }>;
  uncertainties: string[];
  whatWouldChangeDecision: string;
  agent: string;
  model: string;
  reasoningDepth: ReasoningEffort;
  timestamp: number;
}

// ─── Research Mission ─────────────────────────────────────────────────────
export type MissionStatus = "PENDING" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED" | "PAUSED";

export interface ResearchMission {
  id: string;
  cycleId: string;
  investigationId: string;
  objective: string;
  question: string;
  hypothesisIds: string[];
  claimIds: string[];
  informationGapIds: string[];
  expectedEvidence: string[];
  discriminatingEvidence?: string;
  counterevidenceTarget?: string;
  assignedAgent: string;
  assignedModel: string;
  reasoningDepth: ReasoningEffort;
  priority: number;
  budget: number;
  dependencies: string[]; // mission IDs that must complete first
  context: MissionContext;
  status: MissionStatus;
  result?: MissionResult;
  escalationTriggers: string[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface MissionContext {
  global: string; // investigation question
  hypothesis: string | null; // hypothesis being tested
  claim: string | null; // specific claim under examination
  evidence: string[]; // relevant evidence IDs
  sources: string[]; // relevant source IDs
  history: string[]; // previous research task IDs
  currentMission: string; // exact question the agent must answer
}

export interface MissionResult {
  findings: string;
  evidenceDiscovered: string[];
  claimsCreated: string[];
  contradictionsDiscovered: string[];
  reasoningArtifact?: ReasoningArtifact;
  assessmentImpact: "NONE" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  cost: number;
  duration: number;
  completedAt: number;
}

// ─── Investigation Checkpoint ─────────────────────────────────────────────
export interface InvestigationCheckpoint {
  id: string;
  investigationId: string;
  cycleId: string;
  cycleSequence: number;
  stateSnapshot: SerializedState;
  assessment: string;
  hypotheses: Array<{ id: string; statement: string; supportLevel: string }>;
  evidenceSummary: { total: number; supporting: number; contradicting: number; independent: number };
  unresolvedQuestions: string[];
  nextAction: string;
  budgetState: { spent: number; budget: number; remaining: number };
  timestamp: number;
}

// ─── Serialized State (for persistence) ──────────────────────────────────
export interface SerializedState {
  id: string;
  question: string;
  phase: string;
  phaseHistory: Array<{ phase: string; enteredAt: number }>;
  hypotheses: unknown[];
  claims: unknown[];
  evidence: unknown[];
  sources: unknown[];
  contradictions: unknown[];
  disagreements: unknown[];
  devilsEvidence: unknown[];
  informationGaps: unknown[];
  researchTasks: unknown[];
  adversarialChallenges: unknown[];
  assessment: unknown | null;
  budgetUSD: number;
  spentUSD: number;
  createdAt: number;
  updatedAt: number;
  predictions: unknown[];
  failedPredictions: unknown[];
  mindChangingEvidence: unknown[];
  hypothesisCompetitions: unknown[];
  discriminatingTasks: unknown[];
  evidenceClusters: unknown[];
  narrativePatterns: unknown[];
  entities: unknown[];
  relationships: unknown[];
  causalClaims: unknown[];
  investigationMemory: unknown[];
  assessmentRevisions: unknown[];
  scorecard: unknown | null;
  userOverrides: unknown[];
  convergenceCheck: unknown | null;
  investigationCycle: number;
  maxCycles: number;
  converged: boolean;
  paused: boolean;
  // Directive 05 additions
  researchCycles: unknown[];
  decisions: unknown[];
  missions: unknown[];
  checkpoints: unknown[];
  reasoningEscalations: unknown[];
  reasoningArtifacts: unknown[];
  assessmentSnapshots: unknown[];
  mode: string;
  expandedBudget: unknown | null;
  memoryItems: unknown[];
}

// ─── Investigation Mode ───────────────────────────────────────────────────
export type InvestigationMode = "QUICK" | "STANDARD" | "DEEP" | "FORENSIC";

export interface ModeConfig {
  mode: InvestigationMode;
  maxCycles: number;
  defaultReasoningDepth: ReasoningEffort;
  maxReasoningDepth: ReasoningEffort;
  maxConcurrentAgents: number;
  adversarialRounds: number;
  convergenceStrictness: "LOOSE" | "NORMAL" | "STRICT";
  budgetMultiplier: number;
  primarySourceTarget: number;
  secondPassReview: boolean;
  multiModelReview: boolean;
}

// ─── Expanded Budget ─────────────────────────────────────────────────────
export interface InvestigationBudget {
  aiBudgetUSD: number;
  spentUSD: number;
  tokenBudget: number;
  spentTokens: number;
  reasoningBudget: number; // tokens reserved for deep/maximum reasoning
  spentReasoning: number;
  cycleBudget: number;
  spentCycles: number;
  timeBudgetMs: number;
  spentTimeMs: number;
  concurrentAgentLimit: number;
  activeAgents: number;
  providerRequestLimit: number; // requests per minute
  perCycleLimits: CycleLimits;
}

export interface CycleLimits {
  maxDuration: number; // ms
  maxTasks: number;
  maxAgentRuns: number;
  maxConcurrentRuns: number;
  maxTokens: number;
  maxCost: number;
  maxRetries: number;
}

// ─── Memory Item (structured, with provenance and staleness) ──────────────
export type MemoryCategory =
  | "VERIFIED_FACT"
  | "REJECTED_CLAIM"
  | "UNRESOLVED_QUESTION"
  | "IMPORTANT_EVIDENCE"
  | "IMPORTANT_CONTRADICTION"
  | "HYPOTHESIS"
  | "FAILED_PREDICTION"
  | "SUCCESSFUL_PREDICTION"
  | "SOURCE_RELIABILITY"
  | "RECURRING_ENTITY"
  | "KNOWN_RELATIONSHIP"
  | "ASSESSMENT_REVISION"
  | "PREVIOUS_RESEARCH_TASK"
  | "COMPLETED_RESEARCH_TASK"
  | "ABANDONED_RESEARCH_TASK"
  | "USER_OVERRIDE"
  | "DECISION_HISTORY";

export type MemoryStaleness = "CURRENT" | "AGING" | "STALE" | "SUPERSEDED" | "RETRACTED";

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  content: string;
  provenance: string; // what source/agent/evidence supports this
  confidence: number; // 0-1
  staleness: MemoryStaleness;
  supersededBy?: string; // memory item id that supersedes this
  supersedeReason?: string;
  relatedHypothesisId?: string;
  relatedEvidenceId?: string;
  relatedSourceId?: string;
  cycleId?: string; // which cycle created this
  createdAt: number;
  updatedAt: number;
}

// ─── Assessment Snapshot ──────────────────────────────────────────────────
export interface AssessmentSnapshot {
  id: string;
  investigationId: string;
  cycleId: string;
  revisionNumber: number;
  snapshot: {
    confidenceLevel: string;
    summary: string;
    hypotheses: Array<{ id: string; statement: string; supportLevel: string }>;
    majorUnknowns: string[];
    majorAssumptions: string[];
    strongestCounterargument: string;
  };
  timestamp: number;
}

// ─── Assessment Comparison ───────────────────────────────────────────────
export interface AssessmentDiff {
  fromSnapshotId: string;
  toSnapshotId: string;
  changes: Array<{
    hypothesisId: string;
    hypothesisStatement: string;
    previousSupport: string;
    newSupport: string;
    direction: "STRENGTHENED" | "WEAKENED" | "UNCHANGED" | "NEW" | "REMOVED";
    trigger: string;
    evidenceId?: string;
    reason: string;
  }>;
  newUnknowns: string[];
  resolvedUnknowns: string[];
  timestamp: number;
}

// ─── Research Refresh ────────────────────────────────────────────────────
export interface ResearchRefresh {
  id: string;
  investigationId: string;
  lastCheckedAt: number;
  checkedAt: number;
  newSources: string[];
  newEvidence: string[];
  newContradictions: string[];
  triggeredReopen: boolean;
}

// ─── Expanded Scorecard ──────────────────────────────────────────────────
export interface ExpandedScorecard {
  evidenceCoverage: number;
  sourceIndependence: number;
  contradictionResolution: number;
  hypothesisCoverage: number;
  adversarialCoverage: number;
  predictionTesting: number;
  informationGapResolution: number;
  researchDepth: number;
  memoryIntegrity: number;
  assessmentStability: number;
  revisionQuality: number;
  primarySourceCoverage: number;
  details: ExpandedScorecardDetails;
  computedAt: number;
}

export interface ExpandedScorecardDetails {
  totalEvidence: number;
  totalSources: number;
  primarySources: number;
  independentRoots: number;
  totalContradictions: number;
  resolvedContradictions: number;
  totalHypotheses: number;
  testedHypotheses: number;
  totalPredictions: number;
  confirmedPredictions: number;
  failedPredictions: number;
  adversarialIterations: number;
  resolvedChallenges: number;
  openGaps: number;
  criticalGaps: number;
  totalTasks: number;
  completedTasks: number;
  memoryItems: number;
  staleMemoryItems: number;
  supersededMemoryItems: number;
  assessmentRevisions: number;
  cyclesCompleted: number;
  decisionsRecorded: number;
  primarySourceRatio: number;
}
