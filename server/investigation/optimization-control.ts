// ─── OPTIMIZATION CONTROL PLANE ───────────────────────────────────────────
// Runtime guardrail for economical, evidence-first investigations.
//
// Authority boundary:
//   Director       -> WHAT should happen next
//   Control Plane  -> HOW much machinery that task deserves
//   Skill Selector -> WHICH procedure
//   Model Router   -> WHICH model
//   Context Builder-> WHICH context
//
// This module never redirects an investigation. It only constrains execution.

import {
  createWorkDedupeKey,
  decideOptimization,
  type OptimizationDecision,
  type OptimizationInput,
  type WorkKind,
} from "./optimization-policy.js";

export interface OptimizationTask {
  investigationId: string;
  taskId: string;
  question: string;
  workKind: WorkKind;
  importance: number;
  uncertainty: number;
  expectedImpact: number;
  estimatedCost: number;
  budgetRemaining: number;
  availableEvidence: number;
  unresolvedContradictions: number;
  requiresDeepReasoning?: boolean;
  userRequestedDepth?: boolean;
}

export interface WorkRecord {
  key: string;
  taskId: string;
  question: string;
  completedAt: number;
  mode: OptimizationDecision["mode"];
  resultFingerprint?: string;
}

export interface EscalationOutcome {
  taskId: string;
  fromMode: OptimizationDecision["mode"];
  toMode: OptimizationDecision["mode"];
  additionalCost: number;
  beforeConfidence: number;
  afterConfidence: number;
  materialChange: boolean;
  benefit: string;
  recordedAt: number;
}

export interface ExecutionPlan {
  decision: OptimizationDecision;
  dedupeKey: string;
  shouldExecute: boolean;
  reuseRecord?: WorkRecord;
  escalationAllowed: boolean;
  contextBudgetTokens: number;
}

/**
 * Small in-memory control plane. Persistence can be layered on later without
 * changing the policy contract.
 */
export class OptimizationControlPlane {
  private completed = new Map<string, WorkRecord>();
  private escalationOutcomes: EscalationOutcome[] = [];

  plan(task: OptimizationTask): ExecutionPlan {
    const input: OptimizationInput = {
      workKind: task.workKind,
      importance: task.importance,
      uncertainty: task.uncertainty,
      expectedImpact: task.expectedImpact,
      estimatedCost: task.estimatedCost,
      budgetRemaining: task.budgetRemaining,
      availableEvidence: task.availableEvidence,
      unresolvedContradictions: task.unresolvedContradictions,
      requiresDeepReasoning: task.requiresDeepReasoning,
      userRequestedDepth: task.userRequestedDepth,
    };

    const decision = decideOptimization(input);
    const dedupeKey = createWorkDedupeKey({
      ...input,
      taskId: task.taskId,
      question: task.question,
    });
    const reuseRecord = this.completed.get(dedupeKey);

    return {
      decision,
      dedupeKey,
      shouldExecute: decision.proceed && !reuseRecord,
      reuseRecord,
      escalationAllowed: decision.maxModelEscalations > 0 && decision.mode !== "ECONOMY",
      contextBudgetTokens: decision.contextBudgetTokens,
    };
  }

  recordCompletion(task: OptimizationTask, mode: OptimizationDecision["mode"], resultFingerprint?: string): WorkRecord {
    const key = createWorkDedupeKey({
      workKind: task.workKind,
      importance: task.importance,
      uncertainty: task.uncertainty,
      expectedImpact: task.expectedImpact,
      taskId: task.taskId,
      question: task.question,
    });
    const record: WorkRecord = {
      key,
      taskId: task.taskId,
      question: task.question,
      completedAt: Date.now(),
      mode,
      resultFingerprint,
    };
    this.completed.set(key, record);
    return record;
  }

  recordEscalationOutcome(outcome: EscalationOutcome): void {
    this.escalationOutcomes.push(outcome);
  }

  /**
   * Returns whether escalation has historically produced useful change for a
   * work kind. This is advisory only; the Director still owns task selection.
   */
  escalationBenefitRate(workKind?: WorkKind): number {
    const outcomes = this.escalationOutcomes.filter(o => {
      if (!workKind) return true;
      // task IDs can encode work kind, but callers may also use the global rate.
      return o.taskId.toLowerCase().includes(workKind.toLowerCase());
    });
    if (outcomes.length === 0) return 1;
    return outcomes.filter(o => o.materialChange).length / outcomes.length;
  }

  shouldPreferReuse(task: OptimizationTask): boolean {
    return !!this.plan(task).reuseRecord;
  }

  clear(): void {
    this.completed.clear();
    this.escalationOutcomes = [];
  }

  getCompleted(): WorkRecord[] {
    return [...this.completed.values()];
  }

  getEscalationOutcomes(): EscalationOutcome[] {
    return [...this.escalationOutcomes];
  }
}
