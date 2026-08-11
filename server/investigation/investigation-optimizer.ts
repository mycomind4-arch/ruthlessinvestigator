// ─── INVESTIGATION OPTIMIZER ───────────────────────────────────────────────
// Composes the existing optimization policy/control plane with the Skill
// Foundry. This is the bridge that turns historical skill performance into
// future execution choices.

import { OptimizationControlPlane, type OptimizationTask } from "./optimization-control.js";
import { selectSkill, type SkillSelectionDecision } from "./skill-optimizer.js";
import type { SkillRegistry } from "./skill-registry.js";

export interface InvestigationExecutionRequest extends OptimizationTask {
  agentRole?: string;
  inputType?: string;
  outputType?: string;
  domain?: string;
  maxSkillCost?: number;
  preferredSkillId?: string;
}

export interface InvestigationExecutionPlan {
  allowed: boolean;
  reason: string;
  optimization: ReturnType<OptimizationControlPlane["plan"]>;
  skill: SkillSelectionDecision | null;
}

/**
 * One deterministic planning call for the execution layer.
 *
 * The Director remains outside this service. It supplies the task; this
 * service decides whether to spend money and which validated procedure should
 * receive that work.
 */
export function planInvestigationExecution(
  registry: SkillRegistry,
  controlPlane: OptimizationControlPlane,
  request: InvestigationExecutionRequest,
): InvestigationExecutionPlan {
  const optimization = controlPlane.plan(request);

  if (!optimization.decision.proceed) {
    return {
      allowed: false,
      reason: optimization.decision.reason,
      optimization,
      skill: null,
    };
  }

  if (optimization.reuseRecord) {
    return {
      allowed: false,
      reason: `Equivalent work already completed at ${new Date(optimization.reuseRecord.completedAt).toISOString()}; reuse the recorded result instead of paying twice.`,
      optimization,
      skill: null,
    };
  }

  const skill = selectSkill(registry, {
    workKind: request.workKind,
    agentRole: request.agentRole,
    inputType: request.inputType,
    outputType: request.outputType,
    domain: request.domain,
    budgetRemaining: request.budgetRemaining,
    maxCost: request.maxSkillCost,
    preferredSkillId: request.preferredSkillId,
  });

  if (!skill) {
    return {
      allowed: false,
      reason: "No active skill satisfies the execution constraints. Do not silently substitute an unvalidated procedure.",
      optimization,
      skill: null,
    };
  }

  return {
    allowed: true,
    reason: `Execution authorized in ${optimization.decision.mode} mode using ${skill.skill.name}. ${skill.reason}`,
    optimization,
    skill,
  };
}
