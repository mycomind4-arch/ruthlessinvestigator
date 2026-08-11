// ─── SKILL FOUNDRY TYPES ──────────────────────────────────────────────────
// Core domain objects for the Skill system.
// Skills are structured, data-driven investigative methods — NOT executable code.

// ─── Skill Categories ──────────────────────────────────────────────────────
export type SkillCategory = "PROCEDURAL" | "ANALYTICAL" | "STRATEGIC" | "META";

// ─── Skill Status / Lifecycle ──────────────────────────────────────────────
export type SkillStatus =
  | "PROPOSED"      // someone suggested this skill
  | "SANDBOXED"     // running in sandbox for testing
  | "TESTING"       // undergoing validation tests
  | "VALIDATED"     // passed validation, ready for activation
  | "ACTIVE"        // in use by the Director
  | "IMPROVED"      // a new version exists; this is preserved
  | "DEPRECATED"    // retired but preserved
  | "FAILED"        // failed validation
  | "REJECTED"      // user or system rejected the proposal
  | "DISABLED";     // temporarily turned off

// ─── Skill Provenance ──────────────────────────────────────────────────────
export type SkillProvenanceType =
  | "BUILT_IN"
  | "USER_CREATED"
  | "MODEL_PROPOSED"
  | "MODEL_IMPROVED"
  | "COMPOSED"
  | "IMPORTED";

export interface SkillProvenance {
  type: SkillProvenanceType;
  originatingInvestigation?: string;
  originatingAgent?: string;
  provider?: string;
  model?: string;
  promptVersion?: string;
  sourceEvidence?: string[];
  createdFromCapabilityGap?: string;
  createdAt: number;
}

// ─── Skill Inputs / Outputs ────────────────────────────────────────────────
export interface SkillInput {
  name: string;
  type: "text" | "entity" | "source" | "evidence" | "claim" | "hypothesis" | "timeline" | "question";
  required: boolean;
  description: string;
}

export interface SkillOutput {
  name: string;
  type: "evidence" | "claim" | "source" | "assessment" | "classification" | "gap" | "report";
  description: string;
}

// ─── Skill Dependencies ────────────────────────────────────────────────────
export interface SkillDependency {
  skillId: string;
  skillName: string;
  required: boolean;        // must this subskill succeed for parent to succeed?
  description: string;       // why this dependency is needed
}

// ─── Skill Procedure Steps ─────────────────────────────────────────────────
export type SkillStepType =
  | "SEARCH_SOURCES"        // search for information sources
  | "EXTRACT_EVIDENCE"      // extract evidence from found sources
  | "ANALYZE_CLAIM"         // analyze a specific claim
  | "COMPARE_SOURCES"       // compare multiple sources
  | "VERIFY_INDEPENDENCE"   // check source independence
  | "RECONSTRUCT_TIMELINE"  // build a timeline
  | "RESOLVE_ENTITY"        // resolve entity identity
  | "INVESTIGATE_RELATIONSHIP" // investigate relationships
  | "TEST_PREDICTION"       // test a prediction
  | "IDENTIFY_CONTRADICTION" // find contradictions
  | "RESOLVE_CONTRADICTION"  // resolve contradictions
  | "ANALYZE_CAUSALITY"     // analyze causal claims
  | "CHECK_NARRATIVE"       // check for narrative convergence
  | "CLASSIFY_STATUS"       // classify something's status
  | "GENERATE_HYPOTHESIS"   // generate alternative explanations
  | "SYNTHESIZE"            // synthesize findings
  | "INVOKE_SUBSKILL"       // invoke a sub-skill
  | "INVOKE_AGENT"          // invoke an AI agent
  | "RECORD_FINDING"        // record a finding
  | "VALIDATE_OUTPUT";      // validate the output

export interface SkillStep {
  id: string;
  type: SkillStepType;
  description: string;
  agentRole?: string;        // which agent role to use
  subskillId?: string;       // for INVOKE_SUBSKILL
  inputs: string[];          // names of inputs this step uses
  outputs: string[];         // names of outputs this step produces
  promptTemplate?: string;   // template for the prompt to the agent
  expectedOutput?: string;   // description of expected output
  dependsOn?: string[];       // step IDs that must complete first
}

// ─── Skill Tests / Benchmarks ──────────────────────────────────────────────
export interface SkillTest {
  id: string;
  name: string;
  description: string;
  input: Record<string, unknown>;
  expectedBehavior: string;
  expectedEvidence?: string[];
  expectedOutput?: Record<string, unknown>;
  knownPitfalls: string[];
  lastResult?: "PASS" | "FAIL" | "ERROR";
  lastRunAt?: number;
}

export interface BenchmarkCase {
  id: string;
  name: string;
  description: string;
  input: Record<string, unknown>;
  expectedBehavior: string;
  expectedEvidence: string[];
  expectedOutput: Record<string, unknown>;
  knownPitfalls: string[];
}

// ─── Skill Validation Result ───────────────────────────────────────────────
export interface SkillValidationResult {
  skillId: string;
  skillVersion: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  falsePositives: number;
  falseNegatives: number;
  executionCost: number;
  executionDuration: number;
  details: Array<{
    testId: string;
    testName: string;
    result: "PASS" | "FAIL" | "ERROR";
    expectedBehavior: string;
    observedBehavior: string;
    notes: string;
  }>;
  overallPass: boolean;
  validatedAt: number;
}

// ─── Skill Performance ────────────────────────────────────────────────────
export interface SkillPerformance {
  usageCount: number;
  successCount: number;
  failureCount: number;
  averageDuration: number;
  averageCost: number;
  evidenceYield: number;       // average evidence items per execution
  claimYield: number;          // average claims per execution
  contradictionDetectionRate: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  investigationsUsedIn: string[];
  lastUsedAt?: number;
}

// ─── Skill Version History ─────────────────────────────────────────────────
export interface SkillVersion {
  version: number;
  parentVersion: number | null;
  changeReason: string;
  changes: string[];
  validationResults?: SkillValidationResult;
  performanceDifference?: string;
  createdAt: number;
}

// ─── Skill Failure ──────────────────────────────────────────────────────────
export interface SkillFailure {
  id: string;
  skillId: string;
  skillVersion: number;
  investigationId: string;
  taskId?: string;
  failureType: "EXECUTION_ERROR" | "INCORRECT_OUTPUT" | "MISSING_EVIDENCE" | "TIMEOUT" | "BUDGET_EXCEEDED" | "DEPENDENCY_FAILED" | "FALSE_POSITIVE" | "FALSE_NEGATIVE";
  expectedBehavior: string;
  observedBehavior: string;
  evidence: string[];
  possibleCause: string;
  recoverable: boolean;
  recommendedChange: string;
  createdAt: number;
}

// ─── Skill Proposal ────────────────────────────────────────────────────────
export interface SkillProposal {
  id: string;
  problem: string;
  whyExistingSkillsAreInsufficient: string;
  proposedSkillName: string;
  proposedSkillCategory: SkillCategory;
  proposedSkillDescription: string;
  inputs: SkillInput[];
  outputs: SkillOutput[];
  procedure: SkillStep[];
  candidateSubskills: string[];
  expectedBenefit: string;
  exampleUseCases: string[];
  knownRisks: string[];
  validationPlan: string;
  createdFromInvestigations: string[];
  status: "PROPOSED" | "REVIEWED" | "APPROVED" | "REJECTED" | "GENERATED";
  provenance: SkillProvenance;
  createdAt: number;
}

// ─── Capability Gap ──────────────────────────────────────────────────────────
export interface CapabilityGap {
  id: string;
  problem: string;
  existingSkillsUsed: string[];
  missingCapability: string;
  occurrences: number;
  investigationIds: string[];
  candidateSkillName: string;
  candidateSkillCategory: SkillCategory;
  detectedAt: number;
  firstDetectedAt: number;
}

// ─── Skill Candidate (from learning) ────────────────────────────────────────
export interface SkillCandidate {
  id: string;
  name: string;
  observedInInvestigations: string[];
  occurrenceCount: number;
  recurringProblem: string;
  existingWorkaround: string[];
  potentialReuse: "HIGH" | "MODERATE" | "LOW";
  proposedCategory: SkillCategory;
  detectedAt: number;
}

// ─── Skill Execution Result ────────────────────────────────────────────────
export interface SkillExecutionResult {
  skillId: string;
  skillVersion: number;
  investigationId: string;
  inputs: Record<string, unknown>;
  stepsExecuted: string[];
  outputs: Record<string, unknown>;
  evidenceCreated: string[];
  claimsCreated: string[];
  sourcesDiscovered: string[];
  subskillsExecuted: Array<{ skillId: string; result: SkillExecutionResult }>;
  failures: string[];
  warnings: string[];
  duration: number;
  cost: number;
  success: boolean;
  executedAt: number;
}

// ─── Skill ──────────────────────────────────────────────────────────────────
export interface Skill {
  id: string;
  name: string;
  description: string;
  purpose: string;
  category: SkillCategory;
  inputs: SkillInput[];
  outputs: SkillOutput[];
  prerequisites: SkillDependency[];
  procedure: SkillStep[];
  subskills: string[];
  compatibleAgents: string[];
  compatibleSources: string[];
  validationTests: SkillTest[];
  knownFailureModes: string[];
  provenance: SkillProvenance;
  version: number;
  status: SkillStatus;
  performance: SkillPerformance;
  versions: SkillVersion[];
  failures: SkillFailure[];
  domain?: string;
  maxCompositionDepth: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Skill Registry Query ────────────────────────────────────────────────────
export interface SkillSearchQuery {
  name?: string;
  category?: SkillCategory;
  domain?: string;
  status?: SkillStatus;
  compatibleAgent?: string;
  inputType?: string;
  outputType?: string;
  minSuccessRate?: number;
  maxCost?: number;
}

// ─── Skill Event Types ──────────────────────────────────────────────────────
export type SkillEventType =
  | "skill_proposed"
  | "skill_reviewed"
  | "skill_sandboxed"
  | "skill_validation_started"
  | "skill_validation_completed"
  | "skill_validated"
  | "skill_rejected"
  | "skill_activated"
  | "skill_deactivated"
  | "skill_deprecated"
  | "skill_version_created"
  | "skill_composed"
  | "skill_execution_started"
  | "skill_execution_completed"
  | "skill_execution_failed"
  | "skill_capability_gap_detected"
  | "skill_improvement_proposed"
  | "skill_step_started"
  | "skill_step_completed"
  | "skill_subskill_invoked"
  | "skill_evidence_created"
  | "skill_claim_created"
  | "skill_failure_recorded"
  | "skill_candidate_created";

// ─── Security: Allowed Operations ───────────────────────────────────────────
export const ALLOWED_AGENT_ROLES = [
  "DIRECTOR",
  "PREMISE_AUDITOR",
  "PRIMARY_SOURCE_RESEARCHER",
  "OSINT_RESEARCHER",
  "EVIDENCE_ANALYST",
  "SKEPTIC",
  "ALTERNATIVE_EXPLANATION",
  "SYNTHESIS",
  "ADVERSARIAL",
  "DEFENSE",
] as const;

export const ALLOWED_STEP_TYPES: SkillStepType[] = [
  "SEARCH_SOURCES",
  "EXTRACT_EVIDENCE",
  "ANALYZE_CLAIM",
  "COMPARE_SOURCES",
  "VERIFY_INDEPENDENCE",
  "RECONSTRUCT_TIMELINE",
  "RESOLVE_ENTITY",
  "INVESTIGATE_RELATIONSHIP",
  "TEST_PREDICTION",
  "IDENTIFY_CONTRADICTION",
  "RESOLVE_CONTRADICTION",
  "ANALYZE_CAUSALITY",
  "CHECK_NARRATIVE",
  "CLASSIFY_STATUS",
  "GENERATE_HYPOTHESIS",
  "SYNTHESIZE",
  "INVOKE_SUBSKILL",
  "INVOKE_AGENT",
  "RECORD_FINDING",
  "VALIDATE_OUTPUT",
];

export const ALLOWED_SOURCE_TYPES = [
  "OBSERVATION",
  "MEASUREMENT",
  "DOCUMENTED_EVENT",
  "STATEMENT",
  "PROJECTION",
  "ESTIMATE",
  "INFERENCE",
  "TESTIMONY",
  "FINANCIAL_RECORD",
  "GOVERNMENT_RECORD",
  "ACADEMIC_FINDING",
  "DATASET",
  "CORRESPONDENCE",
  "SECONDARY_REPORT",
] as const;

// ─── Cost Control Limits ────────────────────────────────────────────────────
export const SKILL_FOUNDRY_LIMITS = {
  maxSkillProposalsPerInvestigation: 3,
  maxSkillGenerationCalls: 5,
  maxValidationBudget: 2.0,
  maxCompositionDepth: 5,
  maxSkillExecutionTime: 120000,     // 2 minutes
  maxSkillsPerInvestigation: 10,
  maxSubskillRecursion: 10,
} as const;
