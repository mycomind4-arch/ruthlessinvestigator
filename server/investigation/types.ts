// ─── INVESTIGATION DOMAIN TYPES ──────────────────────────────────────────
// Core data structures for the entire investigation system.

// ─── Evidence Types ──────────────────────────────────────────────────────
export type EvidenceType =
  | "OBSERVATION"
  | "MEASUREMENT"
  | "DOCUMENTED_EVENT"
  | "STATEMENT"
  | "PROJECTION"
  | "ESTIMATE"
  | "INFERENCE"
  | "TESTIMONY"
  | "FINANCIAL_RECORD"
  | "GOVERNMENT_RECORD"
  | "ACADEMIC_FINDING"
  | "DATASET"
  | "CORRESPONDENCE"
  | "SECONDARY_REPORT"
  | "LIMITATION"
  | "ATTRIBUTION"
  | "UNKNOWN";

// ─── Claim Types ──────────────────────────────────────────────────────────
export type ClaimType =
  | "FACTUAL"
  | "CAUSAL"
  | "TEMPORAL"
  | "QUANTITATIVE"
  | "ATTRIBUTION"
  | "RELATIONAL"
  | "MOTIVATIONAL"
  | "SPECULATIVE";

// ─── Source Quality Dimensions ────────────────────────────────────────────
export interface SourceQuality {
  authority: number;      // 0-1: legitimate authority over the info
  proximity: number;      // 0-1: closeness to underlying event
  specificity: number;   // 0-1: concrete vs vague
  independence: number;   // 0-1: independent of other sources
  transparency: number;  // 0-1: methodology inspectable
  recency: number;        // 0-1: temporally appropriate
  trackRecord: number;    // 0-1: demonstrated accuracy history
}

// ─── Source ──────────────────────────────────────────────────────────────
export interface InvestigationSource {
  id: string;
  title: string;
  url?: string;
  sourceType: EvidenceType;
  quality: SourceQuality;
  citedBy: string[];       // source ids that cite this source
  cites: string[];          // source ids this source cites
  isPrimary: boolean;
  addedBy: string;          // agent id that added this source
  addedAt: number;          // timestamp
}

// ─── Evidence (atomic) ──────────────────────────────────────────────────
export interface Evidence {
  id: string;
  text: string;             // atomic statement
  type: EvidenceType;
  sourceId: string;         // traceable to a source
  extractedBy: string;      // agent id
  extractedAt: number;
  supportsClaimId?: string;
  contradictsClaimId?: string;
  // Source lineage
  independentConfirmation: boolean;  // true if not derived from same root source
  rootSourceIds: string[];           // ultimate underlying sources
}

// ─── Claim ───────────────────────────────────────────────────────────────
export interface Claim {
  id: string;
  text: string;
  type: ClaimType;
  supportingEvidence: string[];    // evidence ids
  contradictingEvidence: string[]; // evidence ids
  status: "UNVERIFIED" | "SUPPORTED" | "CONTRADICTED" | "DISPUTED" | "EXPLAINED";
  createdBy: string;               // agent id
  createdAt: number;
  hypothesisId?: string;            // claim belongs to hypothesis
  dependsOn?: string[];             // claim ids this claim depends on
}

// ─── Hypothesis ──────────────────────────────────────────────────────────
export interface Hypothesis {
  id: string;
  statement: string;
  type: ClaimType;
  supportLevel: "NONE" | "WEAK" | "MODERATE" | "STRONG" | "INSUFFICIENT_EVIDENCE";
  supportingEvidence: string[];
  contradictingEvidence: string[];
  claims: string[];
  assumptions: string[];
  expectedEvidence: ExpectedEvidence[];
  unknowns: string[];
  agentAssessments: AgentAssessment[];
  iterations: HypothesisIteration[];
  createdAt: number;
  updatedAt: number;
}

export interface ExpectedEvidence {
  id: string;
  description: string;
  status: "FOUND" | "MISSING" | "NEGATIVE" | "UNKNOWN";
  evidenceId?: string;  // if FOUND
  negativeEvidenceId?: string;  // if NEGATIVE
}

export interface AgentAssessment {
  agentId: string;
  modelId: string;
  assessment: "SUPPORTS" | "WEAKENS" | "UNCERTAIN";
  reasoning: string;
  timestamp: number;
}

export interface HypothesisIteration {
  iteration: number;
  timestamp: number;
  previousSupport: Hypothesis["supportLevel"];
  newSupport: Hypothesis["supportLevel"];
  reason: string;
}

// ─── Contradictions ────────────────────────────────────────────────────────
export type ContradictionStatus = "POTENTIAL" | "CONFIRMED" | "EXPLAINED" | "UNRESOLVED";

export interface Contradiction {
  id: string;
  claimA: string;        // claim id or evidence id
  claimB: string;        // claim id or evidence id
  description: string;
  status: ContradictionStatus;
  investigation?: string;   // explanation after investigation
  detectedBy: string;     // agent id
  detectedAt: number;
  resolution?: string;
}

// ─── Devil's Evidence ─────────────────────────────────────────────────────
export interface DevilsEvidence {
  id: string;
  hypothesisId: string;
  evidenceId: string;
  severity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  explanation: string;
  discoveredBy: string;
  discoveredAt: number;
}

// ─── Model Disagreement ──────────────────────────────────────────────────
export interface Disagreement {
  id: string;
  disputedClaimId: string;
  participants: Array<{
    agentId: string;
    modelId: string;
    position: "SUPPORTS" | "WEAKENS" | "UNCERTAIN";
    evidence: string[];
    reasoning: string;
  }>;
  resolutionStatus: "OPEN" | "INVESTIGATING" | "RESOLVED" | "UNRESOLVABLE";
  createdAt: number;
  resolvedAt?: number;
  resolution?: string;
}

// ─── Information Gap ──────────────────────────────────────────────────────
export interface InformationGap {
  id: string;
  question: string;
  importance: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  expectedImpact: string;       // what could change if resolved
  status: "OPEN" | "INVESTIGATING" | "RESOLVED";
  createdFromAdversarial?: boolean;
  createdAt: number;
  resolvedAt?: number;
}

// ─── Research Task ────────────────────────────────────────────────────────
export interface ResearchTask {
  id: string;
  question: string;
  assignedTo: string;      // agent role
  modelId: string;
  status: "PENDING" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED";
  result?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  createdAt: number;
  completedAt?: number;
  fromUserIntervention?: boolean;
}

// ─── Adversarial Challenge ───────────────────────────────────────────────
export interface AdversarialChallenge {
  id: string;
  hypothesisId: string;
  challenges: Array<{
    claimId: string;
    challengeType: string;
    evidence: string;
    assumption: string;
    objection: string;
  }>;
  defenseResponse?: Array<{
    claimId: string;
    classification: "VALID" | "PARTIALLY_VALID" | "INVALID" | "UNRESOLVED";
    explanation: string;
  }>;
  iteration: number;
  status: "OPEN" | "DEFENDED" | "CLOSED";
  createdAt: number;
}

// ─── Assessment ──────────────────────────────────────────────────────────
export interface Assessment {
  investigationId: string;
  summary?: string;
  confidenceLevel: "VERY_LOW" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  hypothesisSummaries: Array<{
    hypothesisId: string;
    hypothesisStatement: string;
    supportLevel: Hypothesis["supportLevel"];
  }>;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  majorAssumptions: string[];
  majorUnknowns: string[];
  strongestCounterargument: string;
  informationGaps: string[];
  multiCausal: boolean;
  lastUpdated: number;
}

// ─── Investigation State ──────────────────────────────────────────────────
export type InvestigationPhase =
  | "CREATED"
  | "PREMISE_AUDIT"
  | "QUESTION_DECOMPOSITION"
  | "HYPOTHESIS_GENERATION"
  | "RESEARCH_PLANNING"
  | "INDEPENDENT_RESEARCH"
  | "EVIDENCE_ANALYSIS"
  | "SOURCE_ANALYSIS"
  | "HYPOTHESIS_TESTING"
  | "ADVERSARIAL_REVIEW"
  | "DISAGREEMENT_REVIEW"
  | "INFORMATION_GAP_ANALYSIS"
  | "TARGETED_RESEARCH"
  | "REASSESSMENT"
  | "CONVERGENCE_REVIEW"
  | "CONVERGED"
  | "PAUSED"
  | "FAILED"
  // Legacy aliases for backward compat
  | "DISCOVERY"
  | "DECOMPOSITION"
  | "COUNCIL_COMPARISON"
  | "GAP_ANALYSIS"
  | "CONVERGENCE";

export interface InvestigationState {
  id: string;
  question: string;
  phase: InvestigationPhase;
  phaseHistory: Array<{ phase: InvestigationPhase; enteredAt: number }>;
  hypotheses: Map<string, Hypothesis>;
  claims: Map<string, Claim>;
  evidence: Map<string, Evidence>;
  sources: Map<string, InvestigationSource>;
  contradictions: Map<string, Contradiction>;
  disagreements: Map<string, Disagreement>;
  devilsEvidence: Map<string, DevilsEvidence>;
  informationGaps: Map<string, InformationGap>;
  researchTasks: Map<string, ResearchTask>;
  adversarialChallenges: Map<string, AdversarialChallenge>;
  assessment: Assessment | null;
  budgetUSD: number;
  spentUSD: number;
  createdAt: number;
  updatedAt: number;
  // ─── Director collections ───────────────────────────────────────────────
  predictions: Map<string, import("./director-types.js").Prediction>;
  failedPredictions: Map<string, import("./director-types.js").FailedPrediction>;
  mindChangingEvidence: Map<string, import("./director-types.js").MindChangingEvidence>;
  hypothesisCompetitions: Map<string, import("./director-types.js").HypothesisCompetition>;
  discriminatingTasks: Map<string, import("./director-types.js").DiscriminatingEvidenceTask>;
  evidenceClusters: Map<string, import("./director-types.js").EvidenceCluster>;
  narrativePatterns: Map<string, import("./director-types.js").NarrativePattern>;
  entities: Map<string, import("./director-types.js").Entity>;
  relationships: Map<string, import("./director-types.js").EntityRelationship>;
  timelines: Map<string, import("./director-types.js").Timeline>;
  causalClaims: Map<string, import("./director-types.js").CausalClaim>;
  investigationMemory: Map<string, import("./director-types.js").InvestigationMemory>;
  assessmentRevisions: Map<string, import("./director-types.js").AssessmentRevision>;
  scorecard: import("./director-types.js").InvestigationScorecard | null;
  userOverrides: Map<string, import("./director-types.js").UserOverrideEvent>;
  convergenceCheck: import("./director-types.js").ConvergenceCheck | null;
  investigationCycle: number;
  maxCycles: number;
  converged: boolean;
  paused: boolean;
}

// ─── Agent Run (for observability) ────────────────────────────────────────
export interface AgentRun {
  id: string;
  investigationId: string;
  agentId: string;
  agentRole: string;
  task: string;
  provider: string;
  model: string;
  input: string;
  output: string;
  sources: string[];
  claims: string[];
  evidence: string[];
  costUSD: number;
  durationMs: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "ERROR";
  error?: string;
  timestamp: number;
  simulated: boolean;
}

// ─── Investigation Event ──────────────────────────────────────────────────
export type EventType =
  | "investigation_started"
  | "premise_audit_started"
  | "premise_issue_found"
  | "hypothesis_created"
  | "agent_assigned"
  | "agent_started"
  | "agent_searching"
  | "agent_found_source"
  | "agent_extracted_evidence"
  | "agent_created_claim"
  | "agent_completed"
  | "council_round_started"
  | "agent_challenged_claim"
  | "contradiction_detected"
  | "source_dependency_detected"
  | "adversarial_round_started"
  | "adversarial_challenge_created"
  | "defense_response"
  | "hypothesis_strength_changed"
  | "information_gap_created"
  | "research_task_created"
  | "devils_evidence_found"
  | "disagreement_detected"
  | "expected_evidence_found"
  | "expected_evidence_missing"
  | "investigation_reassessed"
  | "investigation_converged"
  | "phase_changed"
  | "budget_warning"
  | "budget_exceeded"
  | "cost_recorded"
  | "assessment_updated"
  | "user_intervention"
  // ─── Director event types ───────────────────────────────────────────
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

export interface InvestigationEvent {
  id: string;
  investigationId: string;
  type: EventType;
  agentRole?: string;
  modelId?: string;
  message: string;
  details?: unknown;
  timestamp: number;
}

// ─── Agent Roles ──────────────────────────────────────────────────────────
export type AgentRole =
  | "DIRECTOR"
  | "PREMISE_AUDITOR"
  | "PRIMARY_SOURCE_RESEARCHER"
  | "OSINT_RESEARCHER"
  | "EVIDENCE_ANALYST"
  | "SKEPTIC"
  | "ALTERNATIVE_EXPLANATION"
  | "SYNTHESIS"
  | "ADVERSARIAL"
  | "DEFENSE";

export interface AgentConfig {
  role: AgentRole;
  modelId: string;
  systemPrompt: string;
}
