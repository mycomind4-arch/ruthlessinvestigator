// ─── SKILL TYPES EXTENDED (Directive 05) ─────────────────────────────────
// Extended types for the full Skill Foundry: extraction, sandbox, composition,
// specialization, skill graph, trust, learning reports, failure analysis.

import type { Skill, SkillStep, SkillProvenance, SkillPerformance, SkillFailure } from "./skill-types.js";

// ─── Extended Skill Step (Step 3) ────────────────────────────────────────────
export interface ExtendedSkillStep extends SkillStep {
  inputRequirements?: string[];      // what inputs this step needs
  allowedTools?: string[];          // tools this step is allowed to use
  evidenceRequirements?: string[];  // evidence this step needs to be valid
  completionCriteria?: string;      // how to know this step is done
  failureHandling?: StepFailureHandling; // what to do if this step fails
}

export interface StepFailureHandling {
  onFailure: "ABORT" | "SKIP" | "RETRY" | "FALLBACK";
  maxRetries?: number;
  fallbackStepId?: string;
  description?: string;
}

// ─── Extended Skill Provenance (Step 4) ──────────────────────────────────────
export interface ExtendedSkillProvenance extends SkillProvenance {
  sourceInvestigations?: string[];   // investigations this skill was learned from
  sourceTasks?: string[];            // specific successful task sequences
  sourceAgents?: string[];           // agents that contributed to the discovery
  sourceEvidence?: string[];         // evidence items supporting the skill
  sourceResults?: string[];          // results that validated the procedure
  successMetrics?: ProvenanceMetrics; // quantitative evidence of effectiveness
}

export interface ProvenanceMetrics {
  investigationsObserved: number;
  successRate: number;        // fraction of investigations where the pattern succeeded
  averageEvidenceYield: number;
  averageGapReduction: number;
  adversarialSurvivalRate: number; // fraction of adversarial tests survived
}

// ─── Investigation Pattern (Step 5) ──────────────────────────────────────────
export interface InvestigationPattern {
  id: string;
  type: PatternType;
  description: string;
  observedInInvestigations: string[];
  occurrenceCount: number;
  taskSequence?: string[];          // ordered task types
  evidenceTypes?: string[];         // evidence types produced
  sourceTypes?: string[];           // source types used
  agentAssignments?: string[];      // agents that were successful
  successRate: number;
  averageEvidenceYield: number;
  averageGapReduction: number;
  averageCost: number;
  averageDuration: number;
  reproducible: boolean;
  adversarialSurvival: boolean;
  detectedAt: number;
}

export type PatternType =
  | "TASK_SEQUENCE"
  | "EVIDENCE_TYPE"
  | "SOURCE_TYPE"
  | "ENTITY_RELATIONSHIP"
  | "CONTRADICTION_PATTERN"
  | "AGENT_ASSIGNMENT"
  | "GAP_RESOLUTION"
  | "RESEARCH_STRATEGY";

// ─── Skill Candidate (Step 7) — extended ────────────────────────────────────
export interface SkillCandidateExtended {
  id: string;
  pattern: InvestigationPattern;
  proposedSkill: ProposedSkillStructure;
  supportingInvestigations: string[];
  expectedBenefit: string;
  evidenceOfEffectiveness: ProvenanceMetrics;
  knownLimitations: string[];
  validationRequirements: string[];
  riskLevel: SkillRiskLevel;
  createdAt: number;
}

export interface ProposedSkillStructure {
  name: string;
  description: string;
  purpose: string;
  category: string;
  inputs: Array<{ name: string; type: string; required: boolean; description: string }>;
  outputs: Array<{ name: string; type: string; description: string }>;
  procedure: ExtendedSkillStep[];
  applicableInvestigationTypes?: string[];
  applicableEntities?: string[];
  successCriteria: string[];
  failureCriteria: string[];
}

// ─── Skill Risk Level ────────────────────────────────────────────────────────
export type SkillRiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

// ─── Skill Extraction Result (Step 8) ────────────────────────────────────────
export interface SkillExtractionResult {
  skillName: string;
  description: string;
  purpose: string;
  category: string;
  procedure: ExtendedSkillStep[];
  inputs: Array<{ name: string; type: string; required: boolean; description: string }>;
  outputs: Array<{ name: string; type: string; description: string }>;
  successCriteria: string[];
  failureCriteria: string[];
  applicableInvestigationTypes: string[];
  knownLimitations: string[];
  provenance: ExtendedSkillProvenance;
  riskLevel: SkillRiskLevel;
  extractionReasoning: ExtractionReasoning;
}

export interface ExtractionReasoning {
  whatProcedureWasUsed: string;
  whyItWorked: string;
  conditionsForSuccess: string;
  whenNotToUse: string;
  potentialFailureModes: string[];
}

// ─── Skill Sandbox (Step 10) ─────────────────────────────────────────────────
export interface SandboxExecutionConfig {
  restrictedTools: string[];        // tools NOT available in sandbox
  restrictedAgents: string[];       // agents NOT available in sandbox
  maxCost: number;
  maxDuration: number;
  maxSteps: number;
  preventExternalEffects: boolean;
  recordAllOperations: boolean;
}

export interface SandboxExecutionResult {
  skillId: string;
  config: SandboxExecutionConfig;
  operations: SandboxOperation[];
  outputs: Record<string, unknown>;
  expectedVsActual: Array<{
    expected: string;
    actual: string;
    match: boolean;
  }>;
  totalCost: number;
  totalDuration: number;
  stepCount: number;
  success: boolean;
  violations: string[];             // security or policy violations
  executedAt: number;
}

export interface SandboxOperation {
  stepId: string;
  stepType: string;
  description: string;
  agentRole: string;
  inputs: string[];
  outputs: string[];
  duration: number;
  cost: number;
  result: "SUCCESS" | "FAILURE" | "SKIPPED";
  notes?: string;
}

// ─── Skill Trust (Step 26) ────────────────────────────────────────────────────
export type SkillTrustLevel =
  | "UNTRUSTED"      // newly created, no validation
  | "EXPERIMENTAL"   // in sandbox/early testing
  | "PROVISIONAL"    // passed basic validation, not fully trusted
  | "TRUSTED"        // passed full validation + adversarial testing
  | "DEPRECATED"     // retired
  | "SUSPENDED";     // temporarily disabled due to failures

// ─── Composite Skill (Step 14) ───────────────────────────────────────────────
export interface CompositeSkill extends Skill {
  componentSkills: string[];        // IDs of component skills
  executionOrder: string[][];        // ordered groups of skill IDs (parallel within group)
  dependencies: Array<{
    fromSkillId: string;
    toSkillId: string;
    type: "PRODUCES_INPUT_FOR" | "SHARES_EVIDENCE" | "CONFLICTS_WITH" | "DEPENDS_ON";
    description: string;
  }>;
  sharedInputs: string[];           // inputs shared across components
  intermediateOutputs: Array<{
    fromSkillId: string;
    outputName: string;
    toSkillId: string;
    inputName: string;
  }>;
  conflictRules: Array<{
    skillA: string;
    skillB: string;
    conflict: string;
    resolution: "PREFER_A" | "PREFER_B" | "REPORT_BOTH" | "MERGE";
  }>;
  finalOutputs: string[];           // output names from the composite
}

// ─── Skill Composition Plan (Step 15) ────────────────────────────────────────
export interface SkillCompositionPlan {
  componentSkillIds: string[];
  executionOrder: string[][];
  sharedEntities: string[];
  sharedClaims: string[];
  sharedEvidence: string[];
  duplicateTasks: string[];
  conflictingAssumptions: string[];
  dependencyConnections: Array<{
    fromSkillId: string;
    outputName: string;
    toSkillId: string;
    inputName: string;
    connectionReason: string;
  }>;
  estimatedCost: number;
  estimatedDuration: number;
  riskAssessment: string;
}

// ─── Skill Graph (Step 18) ───────────────────────────────────────────────────
export interface SkillGraph {
  nodes: SkillGraphNode[];
  edges: SkillGraphEdge[];
}

export interface SkillGraphNode {
  skillId: string;
  name: string;
  category: string;
  status: string;
  trustLevel: SkillTrustLevel;
  performance: SkillPerformance;
}

export interface SkillGraphEdge {
  fromSkillId: string;
  toSkillId: string;
  type: SkillGraphEdgeType;
  description: string;
}

export type SkillGraphEdgeType =
  | "REQUIRES"
  | "PRODUCES_INPUT_FOR"
  | "IMPROVES"
  | "CONFLICTS_WITH"
  | "SPECIALIZES"
  | "GENERALIZES"
  | "COMPOSED_FROM";

// ─── Skill Failure Analysis (Step 19) ────────────────────────────────────────
export interface SkillFailureAnalysis {
  id: string;
  failure: SkillFailure;
  rootCause: FailureRootCause;
  category: FailureCategory;
  analysis: string;
  recommendedChanges: string[];
  newVersionNeeded: boolean;
  confidenceInAnalysis: number;    // 0-1
  analyzedAt: number;
}

export type FailureRootCause =
  | "WRONG_PREREQUISITE"
  | "WRONG_SOURCE"
  | "WRONG_AGENT"
  | "INSUFFICIENT_EVIDENCE"
  | "INCORRECT_ASSUMPTION"
  | "BAD_SEQUENCING"
  | "TOOL_LIMITATION"
  | "INVESTIGATION_SPECIFIC"
  | "OVERFITTING"
  | "SOURCE_CONTAMINATION"
  | "UNKNOWN";

export type FailureCategory =
  | "STRUCTURAL"      // the procedure itself is flawed
  | "CONTEXTUAL"      // wrong context for this skill
  | "RESOURCE"        // insufficient resources (cost, time, tools)
  | "EPISTEMIC"       // wrong reasoning or assumption
  | "ENVIRONMENTAL";  // external factors

// ─── Skill Learning Report (Step 29) ─────────────────────────────────────────
export interface InvestigationLearningReport {
  investigationId: string;
  patternsDiscovered: InvestigationPattern[];
  potentialSkills: SkillCandidateExtended[];
  skillsUsed: Array<{
    skillId: string;
    skillName: string;
    succeeded: boolean;
    evidenceProduced: number;
    contradictionsFound: number;
  }>;
  skillsSucceeded: string[];
  skillsFailed: string[];
  newSkillCandidates: SkillCandidateExtended[];
  existingSkillsRevised: Array<{
    skillId: string;
    revisionReason: string;
    newVersion: number;
  }>;
  newCompositionsDiscovered: SkillCompositionPlan[];
  methodologicalLessons: string[];
  generatedAt: number;
}

// ─── Skill Lifecycle Event (Step 24) ─────────────────────────────────────────
export type SkillLifecycleEvent =
  | "skill_pattern_detected"
  | "skill_candidate_created"
  | "skill_extraction_started"
  | "skill_extracted"
  | "skill_validation_started"
  | "skill_validation_failed"
  | "skill_sandbox_started"
  | "skill_sandbox_completed"
  | "skill_promoted"
  | "skill_rejected"
  | "skill_used"
  | "skill_failed"
  | "skill_failure_analyzed"
  | "skill_revision_created"
  | "skill_deprecated"
  | "skill_composed"
  | "skill_specialized"
  | "skill_generalized"
  | "skill_suspended"
  | "skill_trust_changed";

export interface SkillLifecycleEventRecord {
  id: string;
  eventType: SkillLifecycleEvent;
  skillId?: string;
  investigationId?: string;
  message: string;
  details?: unknown;
  timestamp: number;
}

// ─── Director Skill Actions (Step 22) ────────────────────────────────────────
export type DirectorSkillAction =
  | "USE_SKILL"
  | "COMPOSE_SKILLS"
  | "LEARN_SKILL"
  | "VALIDATE_SKILL"
  | "REVISE_SKILL"
  | "SUSPEND_SKILL";

// ─── Skill Discovery Context (Step 13) ──────────────────────────────────────
export interface SkillDiscoveryContext {
  questionType?: string;
  entities?: string[];
  hypotheses?: string[];
  evidenceState?: string;
  informationGaps?: string[];
  investigationPhase?: string;
  requiredOutputs?: string[];
  availableTools?: string[];
}

// ─── Skill Specialization (Step 16) ──────────────────────────────────────────
export interface SkillSpecialization {
  id: string;
  parentSkillId: string;
  parentSkillName: string;
  specializedName: string;
  domain: string;
  observedInInvestigations: string[];
  specializationReason: string;
  performanceDifference: string;
  newVersionId?: string;
  createdAt: number;
}

// ─── Skill Generalization (Step 17) ─────────────────────────────────────────
export interface SkillGeneralization {
  id: string;
  childSkillIds: string[];
  childSkillNames: string[];
  generalizedName: string;
  commonStructure: string;
  observedInInvestigations: string[];
  generalizationReason: string;
  newVersionId?: string;
  createdAt: number;
}

// ─── Extended Skill (Step 2) ─────────────────────────────────────────────────
export interface ExtendedSkill extends Skill {
  requiredEvidence?: string[];
  expectedEvidence?: string[];
  applicableInvestigationTypes?: string[];
  applicableEntities?: string[];
  applicableHypotheses?: string[];
  successCriteria?: string[];
  failureCriteria?: string[];
  riskLevel?: SkillRiskLevel;
  trustLevel?: SkillTrustLevel;
  learnedFrom?: ExtendedSkillProvenance;
}

// ─── Default Sandbox Config ──────────────────────────────────────────────────
export function defaultSandboxConfig(): SandboxExecutionConfig {
  return {
    restrictedTools: ["SHELL_EXEC", "FILE_WRITE", "NETWORK_RAW", "SECRET_ACCESS"],
    restrictedAgents: [],
    maxCost: 2.0,
    maxDuration: 60000,
    maxSteps: 20,
    preventExternalEffects: true,
    recordAllOperations: true,
  };
}
