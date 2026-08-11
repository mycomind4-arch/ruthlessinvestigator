// ─── INVESTIGATION OPTIMIZATION POLICY ─────────────────────────────────────
// Central deterministic policy for keeping investigations coherent,
// economical, and explainable. The Director owns WHAT to investigate; this
// policy governs HOW MUCH machinery should be used.

export type OptimizationMode = "ECONOMY" | "STANDARD" | "DEEP" | "MAXIMUM";

export type WorkKind =
  | "EXTRACTION"
  | "CLASSIFICATION"
  | "SOURCE_DISCOVERY"
  | "SOURCE_VERIFICATION"
  | "EVIDENCE_EXTRACTION"
  | "COMPARISON"
  | "CONTRADICTION"
  | "CAUSAL_ANALYSIS"
  | "ADVERSARIAL"
  | "SYNTHESIS";

export interface OptimizationInput {
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

export interface OptimizationDecision {
  proceed: boolean;
  mode: OptimizationMode;
  reason: string;
  maxModelEscalations: number;
  maxAttempts: number;
  contextBudgetTokens: number;
  cacheEligible: boolean;
  dedupeKey: string;
}

const DEPTH: Record<OptimizationMode, { context: number; escalations: number; attempts: number }> = {
  ECONOMY: { context: 8_000, escalations: 0, attempts: 1 },
  STANDARD: { context: 24_000, escalations: 1, attempts: 2 },
  DEEP: { context: 64_000, escalations: 2, attempts: 3 },
  MAXIMUM: { context: 128_000, escalations: 3, attempts: 4 },
};

function clamp(value: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

/**
 * Decide how much reasoning to buy for a task before selecting a model.
 * Budget is a hard constraint: a plan may not authorize paid execution when
 * the estimated cost is greater than the remaining budget.
 */
export function decideOptimization(input: OptimizationInput): OptimizationDecision {
  const importance = clamp(input.importance);
  const uncertainty = clamp(input.uncertainty);
  const impact = clamp(input.expectedImpact);
  const evidence = clamp(input.availableEvidence);
  const contradictions = clamp(input.unresolvedContradictions);
  const estimatedCost = Math.max(0, input.estimatedCost);
  const budgetRemaining = Math.max(0, input.budgetRemaining);

  const value = (importance * uncertainty * impact) / 1000;
  const danger = (contradictions * 0.08) + (input.requiresDeepReasoning ? 0.2 : 0);

  let mode: OptimizationMode;
  if (input.userRequestedDepth && budgetRemaining >= estimatedCost) {
    mode = "DEEP";
  } else if (value < 0.08 && evidence >= 7 && contradictions <= 1) {
    mode = "ECONOMY";
  } else if (danger >= 0.45 || input.workKind === "ADVERSARIAL" || input.workKind === "CAUSAL_ANALYSIS") {
    mode = "DEEP";
  } else if (value >= 0.25 || input.workKind === "CONTRADICTION" || input.workKind === "SYNTHESIS") {
    mode = "DEEP";
  } else {
    mode = "STANDARD";
  }

  // A user request can increase desired depth, but never overrides budget.
  const budgetTooLow = estimatedCost > budgetRemaining;
  if (budgetTooLow) mode = "ECONOMY";

  const depth = DEPTH[mode];
  const canAfford = estimatedCost <= budgetRemaining;
  const proceed = canAfford;

  return {
    proceed,
    mode,
    reason: !canAfford
      ? `Execution blocked: estimated cost $${estimatedCost.toFixed(4)} exceeds remaining budget $${budgetRemaining.toFixed(4)}.`
      : budgetTooLow
        ? "Budget constrained the task to the least expensive viable pass."
        : `Selected ${mode} because task value, uncertainty, evidence state, and adversarial risk justify this reasoning depth.`,
    maxModelEscalations: depth.escalations,
    maxAttempts: depth.attempts,
    contextBudgetTokens: depth.context,
    cacheEligible: mode !== "MAXIMUM" && !input.requiresDeepReasoning,
    dedupeKey: createWorkDedupeKey(input),
  };
}

/** Stable key used to prevent paying twice for materially identical work. */
export function createWorkDedupeKey(
  input: Pick<OptimizationInput, "workKind" | "importance" | "uncertainty" | "expectedImpact"> & {
    taskId?: string;
    question?: string;
  },
): string {
  const normalizedQuestion = (input.question ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return [
    input.workKind,
    normalizedQuestion,
    Math.round(input.importance),
    Math.round(input.uncertainty),
    Math.round(input.expectedImpact),
  ].join("|");
}

/** Returns true when a result is strong enough to avoid automatic retry. */
export function isReusableResult(result: {
  confidence: number;
  hasContradiction?: boolean;
  hasMissingCriticalEvidence?: boolean;
}): boolean {
  return result.confidence >= 0.78 && !result.hasContradiction && !result.hasMissingCriticalEvidence;
}

/** Canonical subsystem authority contract. */
export const SUBSYSTEM_AUTHORITY = {
  director: "WHAT_NEXT",
  taskManager: "TASK_LIFECYCLE",
  skillRegistry: "WHICH_PROCEDURE",
  skillExecutor: "HOW_PROCEDURE_RUNS",
  modelRouter: "WHICH_MODEL",
  contextBuilder: "WHICH_CONTEXT",
  costTracker: "WHICH_SPEND_IS_ALLOWED",
  evidenceGraph: "WHAT_EVIDENCE_RELATIONSHIPS_EXIST",
  memory: "WHAT_PRIOR_FINDINGS_MAY_BE_REUSED",
  persistence: "WHAT_SURVIVES_RESTART",
  eventStream: "WHAT_HAPPENED",
} as const;
