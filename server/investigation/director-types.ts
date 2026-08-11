// ─── DIRECTOR TYPES ─────────────────────────────────────────────────────
// Types for the Investigation Director and all its subsystems.

// ─── Next Action Engine ──────────────────────────────────────────────────
export type NextActionType =
  | "RESEARCH"
  | "VERIFY_SOURCE"
  | "VERIFY_CLAIM"
  | "INVESTIGATE_CONTRADICTION"
  | "TEST_HYPOTHESIS"
  | "SEARCH_FOR_COUNTEREVIDENCE"
  | "INVESTIGATE_ENTITY"
  | "RECONSTRUCT_TIMELINE"
  | "FOLLOW_RELATIONSHIP"
  | "SEARCH_PRIMARY_SOURCE"
  | "FIND_PRIMARY_EVIDENCE"
  | "COMPARE_DATASETS"
  | "REQUEST_MISSING_DATA"
  | "REASSESS"
  | "CONVERGE"
  | "INVESTIGATE_DISCRIMINATING_EVIDENCE"
  | "CHECK_CAUSALITY"
  | "TEST_PREDICTION"
  | "DETECT_NARRATIVE";

export interface NextInvestigationAction {
  type: NextActionType;
  reason: string;
  targetHypothesisId?: string;
  targetClaimId?: string;
  targetEvidenceId?: string;
  targetSourceId?: string;
  targetContradictionId?: string;
  targetEntityId?: string;
  question: string;
  expectedImpact: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  assignedAgent: string;
  alternativeAgent?: string;
  priorityScore: number;
  priorityBreakdown: PriorityBreakdown;
  createdAt: number;
}

export interface PriorityBreakdown {
  importance: number;       // 0-10
  uncertainty: number;      // 0-10
  expectedImpact: number;   // 0-10
  cost: number;             // 1-10 (inverse — lower cost = better)
  difficulty: number;       // 1-10 (inverse — lower difficulty = better)
  dependencyCount: number;   // 0+ (inverse — fewer dependencies = better)
  relevance: number;         // 0-10
  formula: string;           // human-readable formula
}

// ─── Mind-Changing Evidence ──────────────────────────────────────────────
export interface MindChangingEvidence {
  hypothesisId: string;
  currentAssessment: string;
  wouldStrengthen: string[];
  wouldWeaken: string[];
  wouldFalsify: string[];
  updatedAt: number;
}

// ─── Predictions ─────────────────────────────────────────────────────────
export interface Prediction {
  id: string;
  hypothesisId: string;
  description: string;
  expectedResult: string;
  observedResult?: string;
  status: "PENDING" | "CONFIRMED" | "FAILED" | "INCONCLUSIVE";
  evidenceId?: string;
  severity?: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  createdAt: number;
  testedAt?: number;
}

// ─── Failed Predictions ──────────────────────────────────────────────────
export interface FailedPrediction {
  id: string;
  hypothesisId: string;
  predictionId: string;
  expectedResult: string;
  observedResult: string;
  severity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  evidenceId?: string;
  reassessmentTriggered: boolean;
  createdAt: number;
}

// ─── Hypothesis Competition ──────────────────────────────────────────────
export interface HypothesisCompetition {
  id: string;
  hypothesisA: string;
  hypothesisB: string;
  evidenceForA: string[];     // evidence A explains that B doesn't
  evidenceForB: string[];     // evidence B explains that A doesn't
  discriminatingEvidence: string[]; // evidence that distinguishes them
  unexplainedBy: string[];   // evidence neither explains
  assessedAt: number;
}

// ─── Discriminating Evidence Task ────────────────────────────────────────
export interface DiscriminatingEvidenceTask {
  id: string;
  hypothesisA: string;
  hypothesisB: string;
  description: string;
  evidenceNeeded: string;
  status: "PENDING" | "FOUND" | "NOT_FOUND" | "INCONCLUSIVE";
  result?: string;
  createdAt: number;
}

// ─── Evidence Cluster (Source Contamination) ─────────────────────────────
export interface EvidenceCluster {
  id: string;
  rootSourceIds: string[];
  dependentSourceIds: string[];
  totalSources: number;
  independentRoots: number;
  message: string;
  detectedAt: number;
}

// ─── Narrative Pattern ───────────────────────────────────────────────────
export interface NarrativePattern {
  id: string;
  pattern: string;            // shared wording/statistic/framing
  sourceIds: string[];
  type: "IDENTICAL_WORDING" | "IDENTICAL_STATISTIC" | "IDENTICAL_ATTRIBUTION" | "IDENTICAL_FRAMING";
  interpretation: "COMMON_SOURCE" | "INFORMATION_PROPAGATION" | "COORDINATION_UNKNOWN";
  note: string;
  createdAt: number;
}

// ─── Entity & Relationship ────────────────────────────────────────────────
export type EntityType =
  | "PERSON" | "COMPANY" | "INVESTOR" | "GOVERNMENT_AGENCY" | "PROJECT"
  | "PROPERTY" | "UTILITY" | "CONTRACT" | "ORGANIZATION";

export type RelationshipType =
  | "OWNS" | "FUNDS" | "EMPLOYS" | "CONTRACTS_WITH" | "REGULATES"
  | "INVESTS_IN" | "DONATES_TO" | "PARTNERS_WITH" | "CITES"
  | "CONTROLS" | "ANNOUNCES" | "BUILDS" | "OPERATES";

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  mentions: number;
  firstMentionedAt: number;
  notes?: string;
}

export interface EntityRelationship {
  id: string;
  entityA: string;
  entityB: string;
  relationship: RelationshipType;
  evidenceId?: string;
  sourceId?: string;
  confidence: number;        // 0-1
  createdAt: number;
}

// ─── Timeline ────────────────────────────────────────────────────────────
export interface TimelineEvent {
  id: string;
  event: string;
  date?: string;
  entity?: string;
  sourceId?: string;
  claimId?: string;
  confidence: number;        // 0-1
  createdAt: number;
}

export interface Timeline {
  id: string;
  events: TimelineEvent[];
  causalClaim: string;      // the "X caused Y" being checked
  temporalOrderingValid: boolean;
  createdAt: number;
}

// ─── Causal Claim ─────────────────────────────────────────────────────────
export interface CausalClaim {
  id: string;
  claimId: string;
  cause: string;
  effect: string;
  temporalOrdering: "VALID" | "INVALID" | "UNKNOWN";
  mechanismEvidence: string[];
  alternativeExplanations: string[];
  confoundingVariables: string[];
  correlationVsCausation: "CORRELATION_ONLY" | "CAUSATION_SUPPORTED" | "UNCLEAR";
  evidenceStrength: "WEAK" | "MODERATE" | "STRONG";
  status: "PENDING" | "REVIEWED" | "CONFIRMED" | "REJECTED";
  createdAt: number;
}

// ─── Investigation Memory ─────────────────────────────────────────────────
export interface InvestigationMemory {
  id: string;
  category: "VERIFIED_FACT" | "REJECTED_CLAIM" | "UNRESOLVED_QUESTION"
    | "SOURCE_RELIABILITY" | "RECURRING_ENTITY" | "KNOWN_RELATIONSHIP"
    | "FAILED_HYPOTHESIS" | "SUCCESSFUL_PREDICTION" | "IMPORTANT_CONTRADICTION";
  content: string;
  provenance: string;        // what source/agent/evidence supports this
  confidence: number;        // 0-1
  createdAt: number;
  updatedAt: number;
}

// ─── Assessment Revision ─────────────────────────────────────────────────
export interface AssessmentRevision {
  id: string;
  revisionNumber: number;
  previousAssessment: string;
  newAssessment: string;
  trigger: string;
  evidence: string[];
  reason: string;
  agentsInvolved: string[];
  timestamp: number;
}

// ─── Investigation Scorecard ──────────────────────────────────────────────
export interface InvestigationScorecard {
  evidenceCoverage: number;          // 0-100
  sourceIndependence: number;        // 0-100
  contradictionResolution: number;   // 0-100
  hypothesisCoverage: number;        // 0-100
  adversarialCoverage: number;       // 0-100
  informationGaps: number;            // 0-100 (higher = more resolved)
  predictionTesting: number;         // 0-100
  researchDepth: number;             // 0-100
  details: ScorecardDetails;
  computedAt: number;
}

export interface ScorecardDetails {
  totalEvidence: number;
  totalSources: number;
  independentSources: number;
  totalContradictions: number;
  resolvedContradictions: number;
  hypothesesTested: number;
  totalHypotheses: number;
  adversarialRounds: number;
  predictionsTested: number;
  totalPredictions: number;
  gapsResolved: number;
  totalGaps: number;
  researchTasksCompleted: number;
  totalResearchTasks: number;
}

// ─── User Override ───────────────────────────────────────────────────────
export type UserOverrideType =
  | "INVESTIGATE_THIS"
  | "IGNORE_THIS_HYPOTHESIS"
  | "FOLLOW_THIS_ENTITY"
  | "FIND_PRIMARY_EVIDENCE"
  | "TRY_TO_DISPROVE_THIS"
  | "STOP_INVESTIGATING"
  | "REOPEN_INVESTIGATION";

export interface UserOverrideEvent {
  id: string;
  type: UserOverrideType;
  instruction: string;
  targetId?: string;          // hypothesis id, entity id, etc.
  recordedAt: number;
  effects: string[];
}

// ─── Convergence Check ───────────────────────────────────────────────────
export interface ConvergenceCheck {
  majorHypothesesTested: boolean;
  importantPredictionsTested: boolean;
  strongestCounterargumentsInvestigated: boolean;
  majorContradictionsAddressed: boolean;
  criticalSourceDependenciesAnalyzed: boolean;
  importantInformationGapsEvaluated: boolean;
  diminishingReturns: boolean;
  overall: boolean;
  details: string[];
  checkedAt: number;
}

// ─── New Event Types ─────────────────────────────────────────────────────
export type DirectorEventType =
  | "director_next_action"
  | "director_research_priority"
  | "prediction_created"
  | "prediction_tested"
  | "prediction_failed"
  | "mind_changing_evidence_updated"
  | "hypothesis_competition"
  | "discriminating_evidence_task"
  | "discriminating_evidence_found"
  | "evidence_cluster_detected"
  | "narrative_pattern_detected"
  | "entity_discovered"
  | "relationship_investigated"
  | "timeline_reconstructed"
  | "causal_claim_reviewed"
  | "investigation_memory_stored"
  | "assessment_revision_created"
  | "scorecard_updated"
  | "user_override_recorded"
  | "convergence_check"
  | "investigation_reopened"
  | "confirmation_bias_check"
  | "next_action_explained";
