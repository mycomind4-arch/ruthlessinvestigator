// ─── SKILL-AWARE OPTIMIZATION ─────────────────────────────────────────────
// Chooses investigative procedures using observed skill performance.
//
// Authority boundary:
//   Director -> WHAT to investigate
//   Optimization policy -> HOW MUCH effort
//   Skill optimizer -> WHICH proven procedure
//   Model router -> WHICH model
//
// This is advisory and deterministic. It never creates or mutates a skill.

import type { Skill, SkillPerformance, SkillStepType } from "./skill-types.js";
import type { SkillRegistry } from "./skill-registry.js";
import type { WorkKind } from "./optimization-policy.js";

export interface SkillSelectionRequest {
  workKind: WorkKind;
  agentRole?: string;
  inputType?: string;
  outputType?: string;
  domain?: string;
  budgetRemaining: number;
  maxCost?: number;
  preferredSkillId?: string;
  minimumSuccessRate?: number;
}

export interface SkillSelectionDecision {
  skill: Skill;
  score: number;
  reason: string;
  estimatedCost: number;
  performance: {
    successRate: number;
    evidenceYield: number;
    claimYield: number;
    contradictionDetectionRate: number;
  };
  alternatives: Array<{
    skillId: string;
    name: string;
    score: number;
    estimatedCost: number;
    reason: string;
  }>;
}

const WORK_TO_STEPS: Record<WorkKind, SkillStepType[]> = {
  EXTRACTION: ["EXTRACT_EVIDENCE", "SEARCH_SOURCES"],
  CLASSIFICATION: ["CLASSIFY_STATUS", "ANALYZE_CLAIM"],
  SOURCE_DISCOVERY: ["SEARCH_SOURCES", "RESOLVE_ENTITY"],
  SOURCE_VERIFICATION: ["VERIFY_INDEPENDENCE", "COMPARE_SOURCES"],
  EVIDENCE_EXTRACTION: ["EXTRACT_EVIDENCE", "RECORD_FINDING"],
  COMPARISON: ["COMPARE_SOURCES", "TEST_PREDICTION"],
  CONTRADICTION: ["IDENTIFY_CONTRADICTION", "RESOLVE_CONTRADICTION"],
  CAUSAL_ANALYSIS: ["ANALYZE_CAUSALITY", "RECONSTRUCT_TIMELINE"],
  ADVERSARIAL: ["GENERATE_HYPOTHESIS", "ANALYZE_CLAIM", "IDENTIFY_CONTRADICTION"],
  SYNTHESIS: ["SYNTHESIZE", "VALIDATE_OUTPUT"],
};

function performanceStats(performance: SkillPerformance) {
  const successRate = performance.usageCount > 0
    ? performance.successCount / performance.usageCount
    : 0.5;
  return {
    successRate,
    evidenceYield: performance.evidenceYield,
    claimYield: performance.claimYield,
    contradictionDetectionRate: performance.contradictionDetectionRate,
  };
}

function stepFit(skill: Skill, workKind: WorkKind): number {
  const desired = WORK_TO_STEPS[workKind];
  const steps = new Set(skill.procedure.map(step => step.type));
  return desired.reduce((score, type) => score + (steps.has(type) ? 1 : 0), 0) / Math.max(desired.length, 1);
}

function compatibilityFit(skill: Skill, request: SkillSelectionRequest): number {
  let fit = stepFit(skill, request.workKind);
  if (request.agentRole && skill.compatibleAgents.includes(request.agentRole)) fit += 0.25;
  if (request.inputType && skill.inputs.some(input => input.type === request.inputType)) fit += 0.2;
  if (request.outputType && skill.outputs.some(output => output.type === request.outputType)) fit += 0.2;
  if (request.domain && skill.domain === request.domain) fit += 0.15;
  return Math.min(fit, 1.8);
}

function scoreSkill(skill: Skill, request: SkillSelectionRequest) {
  const performance = performanceStats(skill.performance);
  const compatibility = compatibilityFit(skill, request);
  const cost = Math.max(0, skill.performance.averageCost);
  const affordable = cost <= request.budgetRemaining && (request.maxCost === undefined || cost <= request.maxCost);

  if (!affordable) return { score: -Infinity, cost, performance, compatibility };

  // New skills get a neutral prior instead of being treated as failures.
  // Observed performance then dominates as executions accumulate.
  const reliability = 0.55 * performance.successRate;
  const yieldValue = Math.min(0.25, performance.evidenceYield * 0.025 + performance.claimYield * 0.01);
  const contradictionValue = Math.min(0.15, performance.contradictionDetectionRate * 0.15);
  const costEfficiency = cost > 0 ? Math.min(0.2, 0.02 / cost) : 0.2;
  const score = compatibility * 0.45 + reliability + yieldValue + contradictionValue + costEfficiency;

  return { score, cost, performance, compatibility };
}

export function selectSkill(registry: SkillRegistry, request: SkillSelectionRequest): SkillSelectionDecision | null {
  const skills = registry.searchSkills({
    status: "ACTIVE",
    domain: request.domain,
    compatibleAgent: request.agentRole,
    inputType: request.inputType,
    outputType: request.outputType,
    minSuccessRate: request.minimumSuccessRate,
  });

  const ranked = skills
    .map(skill => ({ skill, ...scoreSkill(skill, request) }))
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score);

  if (request.preferredSkillId) {
    const preferred = ranked.find(item => item.skill.id === request.preferredSkillId);
    if (preferred) ranked.unshift(...ranked.splice(ranked.indexOf(preferred), 1));
  }

  if (ranked.length === 0) return null;

  const winner = ranked[0];
  const alternatives = ranked.slice(1, 4).map(item => ({
    skillId: item.skill.id,
    name: item.skill.name,
    score: Number(item.score.toFixed(4)),
    estimatedCost: item.cost,
    reason: explainSelection(item.skill, item.score, item.compatibility, item.performance),
  }));

  return {
    skill: winner.skill,
    score: Number(winner.score.toFixed(4)),
    reason: explainSelection(winner.skill, winner.score, winner.compatibility, winner.performance),
    estimatedCost: winner.cost,
    performance: winner.performance,
    alternatives,
  };
}

function explainSelection(
  skill: Skill,
  score: number,
  compatibility: number,
  performance: ReturnType<typeof performanceStats>,
): string {
  return `${skill.name} scored ${score.toFixed(3)} from procedure fit ${compatibility.toFixed(2)}, success rate ${(performance.successRate * 100).toFixed(0)}%, evidence yield ${performance.evidenceYield.toFixed(2)}, and average cost $${skill.performance.averageCost.toFixed(4)}.`;
}

export interface SkillOutcome {
  skillId: string;
  success: boolean;
  duration: number;
  cost: number;
  evidenceCount: number;
  claimCount: number;
  investigationId: string;
  contradictionDetected?: boolean;
}

/** Feed execution outcomes back into the existing Skill Foundry performance ledger. */
export function recordSkillOutcome(registry: SkillRegistry, outcome: SkillOutcome): void {
  registry.recordExecution(
    outcome.skillId,
    outcome.success,
    outcome.duration,
    outcome.cost,
    outcome.evidenceCount,
    outcome.claimCount,
    outcome.investigationId,
  );

  const skill = registry.getSkill(outcome.skillId);
  if (skill && outcome.contradictionDetected !== undefined) {
    // Running average rather than a binary overwrite.
    const n = skill.performance.usageCount;
    const prior = skill.performance.contradictionDetectionRate;
    const observed = outcome.contradictionDetected ? 1 : 0;
    skill.performance.contradictionDetectionRate = ((prior * Math.max(n - 1, 0)) + observed) / Math.max(n, 1);
  }
}
