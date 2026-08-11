// ─── RESEARCH CYCLE REVIEW ────────────────────────────────────────────────
// Directive 05: Structured review at the end of every ResearchCycle.

import type { InvestigationState } from "./types.js";
import type { ResearchCycle, InvestigationDecision } from "./persistence-types.js";
import { distillCycleMemory } from "./memory-system.js";

export interface CycleReview {
  cycleId: string;
  whatWeLearned: string[];
  whatChanged: string[];
  whatBecameLessLikely: string[];
  whatBecameMoreLikely: string[];
  whatWasContradicted: string[];
  predictionsSucceeded: string[];
  predictionsFailed: string[];
  whatRemainsUnknown: string[];
  assumptionsInvalidated: string[];
  highestValueEvidence: string[];
  shouldContinue: boolean;
  why: string;
  distilledMemory: ReturnType<typeof distillCycleMemory>;
  reviewedAt: number;
}

export function reviewCycle(
  state: InvestigationState,
  cycle: ResearchCycle,
): CycleReview {
  const whatWeLearned: string[] = [];
  const whatChanged: string[] = [];
  const whatBecameLessLikely: string[] = [];
  const whatBecameMoreLikely: string[] = [];
  const whatWasContradicted: string[] = [];
  const predictionsSucceeded: string[] = [];
  const predictionsFailed: string[] = [];
  const whatRemainsUnknown: string[] = [];
  const assumptionsInvalidated: string[] = [];
  const highestValueEvidence: string[] = [];

  // Analyze hypothesis changes in this cycle
  for (const change of cycle.hypothesisChanges) {
    const hyp = state.hypotheses.get(change.hypothesisId);
    const hypStatement = hyp?.statement ?? change.hypothesisId;
    whatChanged.push(`${hypStatement}: ${change.previousSupport} → ${change.newSupport} (${change.reason})`);

    if (change.newSupport === "NONE" || change.newSupport === "INSUFFICIENT_EVIDENCE") {
      whatBecameLessLikely.push(hypStatement);
    }
    if (change.newSupport === "STRONG" || change.newSupport === "MODERATE") {
      if (change.previousSupport === "WEAK" || change.previousSupport === "NONE") {
        whatBecameMoreLikely.push(hypStatement);
      }
    }
  }

  // New evidence discovered
  for (const evId of cycle.evidenceDiscovered) {
    const ev = state.evidence.get(evId);
    if (ev) {
      whatWeLearned.push(ev.text);
      if (ev.independentConfirmation) {
        highestValueEvidence.push(`${ev.text} [${ev.id}] — independently confirmed`);
      }
    }
  }

  // Contradictions discovered
  for (const conId of cycle.contradictionsDiscovered) {
    const con = state.contradictions.get(conId);
    if (con) {
      whatWasContradicted.push(con.description);
    }
  }

  // Predictions
  for (const pred of state.predictions?.values() ?? []) {
    if (pred.status === "CONFIRMED") {
      predictionsSucceeded.push(pred.description);
    } else if (pred.status === "FAILED") {
      predictionsFailed.push(`${pred.description} — expected: ${pred.expectedResult}`);
    }
  }

  // Failed predictions invalidate assumptions
  for (const fp of state.failedPredictions?.values() ?? []) {
    assumptionsInvalidated.push(fp.expectedResult);
  }

  // Open information gaps
  for (const gap of state.informationGaps.values()) {
    if (gap.status === "OPEN") {
      whatRemainsUnknown.push(gap.question);
    }
  }

  // Distill memory
  const distilled = distillCycleMemory(state, cycle.id);

  // Determine whether to continue
  const shouldContinue =
    !state.converged &&
    state.investigationCycle < state.maxCycles &&
    whatRemainsUnknown.length > 0 &&
    state.spentUSD < state.budgetUSD;

  const why = state.converged
    ? "Convergence criteria met"
    : state.investigationCycle >= state.maxCycles
      ? "Maximum cycles reached"
      : state.spentUSD >= state.budgetUSD
        ? "Budget exhausted"
        : whatRemainsUnknown.length === 0
          ? "No remaining unknowns"
          : "Uncertainty remains — continuing research";

  return {
    cycleId: cycle.id,
    whatWeLearned,
    whatChanged,
    whatBecameLessLikely,
    whatBecameMoreLikely,
    whatWasContradicted,
    predictionsSucceeded,
    predictionsFailed,
    whatRemainsUnknown,
    assumptionsInvalidated,
    highestValueEvidence,
    shouldContinue,
    why,
    distilledMemory: distilled,
    reviewedAt: Date.now(),
  };
}

// ─── Decision Recorder ────────────────────────────────────────────────────

let decisionCounter = 0;

export function genDecisionId(): string {
  return `dec-${Date.now()}-${++decisionCounter}`;
}

export function recordDecision(
  cycleId: string,
  investigationId: string,
  decisionType: InvestigationDecision["decisionType"],
  decision: string,
  reason: string,
  opts: {
    evidence?: string[];
    assumptions?: string[];
    alternatives?: Array<{ option: string; rejectedBecause: string }>;
    uncertainties?: string[];
    whatWouldChange?: string;
    agent?: string;
    model?: string;
    reasoningDepth?: string;
  } = {},
): InvestigationDecision {
  return {
    id: genDecisionId(),
    investigationId,
    cycleId,
    decisionType,
    decision,
    reason,
    evidence: opts.evidence ?? [],
    assumptions: opts.assumptions ?? [],
    alternativesConsidered: opts.alternatives ?? [],
    uncertainties: opts.uncertainties ?? [],
    whatWouldChangeDecision: opts.whatWouldChange ?? "",
    agent: opts.agent ?? "DIRECTOR",
    model: opts.model ?? "",
    reasoningDepth: (opts.reasoningDepth ?? "standard") as InvestigationDecision["reasoningDepth"],
    timestamp: Date.now(),
  };
}
