// ─── REASONING ESCALATION ENGINE ──────────────────────────────────────────
// Directive 05: Adaptive reasoning depth — not every task needs maximum reasoning.

import type {
  ReasoningEffort,
  ReasoningEscalation,
  ReasoningEscalationTrigger,
} from "./persistence-types.js";
import type { InvestigationState } from "./types.js";

let escalationCounter = 0;

export function genEscalationId(): string {
  return `esc-${Date.now()}-${++escalationCounter}`;
}

// ─── Task characteristics that suggest deeper reasoning ────────────────────
export interface TaskCharacteristics {
  involvesContradiction: boolean;
  involvesCausality: boolean;
  modelsDisagree: boolean;
  sourceIndependenceUncertain: boolean;
  isConsequential: boolean; // could materially change assessment
  hypothesisDependsOnThis: boolean;
  unresolvedContradictionsExist: boolean;
  substantialUncertainty: boolean;
  isAssessmentRevision: boolean;
  isAdversarialAttack: boolean;
  isFinalReassessment: boolean;
  highExpectedInfoGain: boolean;
  researchFailedToResolve: boolean;
}

// ─── Determine initial reasoning depth for a task ──────────────────────────
export function determineReasoningDepth(
  taskType: string,
  characteristics: TaskCharacteristics,
  defaultDepth: ReasoningEffort,
  maxDepth: ReasoningEffort,
): ReasoningEffort {
  const effortOrder: ReasoningEffort[] = ["standard", "deep", "maximum"];

  // Tasks that always start at standard
  const standardTasks = new Set([
    "extract_date", "extract_financial_figure", "classify_evidence",
    "extract_fact", "search_source", "find_url",
  ]);

  if (standardTasks.has(taskType)) {
    return "standard";
  }

  // Tasks that start at deep
  const deepTasks = new Set([
    "compare_sources", "analyze_contradiction", "identify_discriminating_evidence",
    "analyze_source_independence", "investigate_entity", "reconstruct_timeline",
  ]);

  if (deepTasks.has(taskType)) {
    return "deep";
  }

  // Tasks that start at maximum
  const maximumTasks = new Set([
    "attack_hypothesis", "assess_causal_explanation", "resolve_major_disagreement",
    "final_reassessment", "synthesize_assessment",
  ]);

  if (maximumTasks.has(taskType)) {
    return Math.min(effortOrder.indexOf(maxDepth), effortOrder.indexOf("maximum")) === effortOrder.indexOf("maximum")
      ? "maximum"
      : maxDepth;
  }

  // Default: use the mode's default depth
  return defaultDepth;
}

// ─── Check if a task should escalate ──────────────────────────────────────
export function shouldEscalate(
  currentDepth: ReasoningEffort,
  characteristics: TaskCharacteristics,
  maxDepth: ReasoningEffort,
): { shouldEscalate: boolean; newDepth: ReasoningEffort; reason: string } {
  const effortOrder: ReasoningEffort[] = ["standard", "deep", "maximum"];
  const currentIdx = effortOrder.indexOf(currentDepth);
  const maxIdx = effortOrder.indexOf(maxDepth);

  if (currentIdx >= maxIdx) {
    return { shouldEscalate: false, newDepth: currentDepth, reason: "Already at maximum depth" };
  }

  // Escalation triggers (checked in order of importance)
  if (characteristics.modelsDisagree && currentDepth === "standard") {
    return { shouldEscalate: true, newDepth: "deep", reason: "Three model families disagree" };
  }

  if (characteristics.isConsequential && currentDepth === "standard") {
    return { shouldEscalate: true, newDepth: "deep", reason: "Resolution could materially change the investigation assessment" };
  }

  if (characteristics.involvesCausality && currentDepth === "standard") {
    return { shouldEscalate: true, newDepth: "deep", reason: "Task concerns causality — requires deeper analysis" };
  }

  if (characteristics.isAdversarialAttack && currentDepth !== "maximum") {
    return { shouldEscalate: true, newDepth: effortOrder[Math.min(currentIdx + 1, maxIdx)], reason: "Adversarial attack on leading hypothesis" };
  }

  if (characteristics.isFinalReassessment && currentDepth !== "maximum") {
    return { shouldEscalate: true, newDepth: effortOrder[Math.min(currentIdx + 1, maxIdx)], reason: "Final reassessment — maximum rigor needed" };
  }

  if (characteristics.isAssessmentRevision && currentDepth === "standard") {
    return { shouldEscalate: true, newDepth: "deep", reason: "Major assessment revision triggered" };
  }

  if (characteristics.researchFailedToResolve && currentDepth === "standard") {
    return { shouldEscalate: true, newDepth: "deep", reason: "Initial research failed to resolve the question" };
  }

  if (characteristics.substantialUncertainty && currentDepth === "standard") {
    return { shouldEscalate: true, newDepth: "deep", reason: "First analysis produced substantial uncertainty" };
  }

  if (characteristics.involvesContradiction && currentDepth === "standard") {
    return { shouldEscalate: true, newDepth: "deep", reason: "Evidence conflicts" };
  }

  if (characteristics.sourceIndependenceUncertain && currentDepth === "standard") {
    return { shouldEscalate: true, newDepth: "deep", reason: "Source independence is uncertain" };
  }

  if (characteristics.hypothesisDependsOnThis && currentDepth === "standard") {
    return { shouldEscalate: true, newDepth: "deep", reason: "Leading hypothesis depends on this claim" };
  }

  if (characteristics.highExpectedInfoGain && currentDepth === "standard") {
    return { shouldEscalate: true, newDepth: "deep", reason: "High expected information gain" };
  }

  // Second escalation: deep → maximum
  if (characteristics.isConsequential && characteristics.modelsDisagree && currentDepth === "deep") {
    return { shouldEscalate: true, newDepth: "maximum", reason: "Consequential disagreement — escalating to maximum" };
  }

  if (characteristics.isAdversarialAttack && characteristics.researchFailedToResolve && currentDepth === "deep") {
    return { shouldEscalate: true, newDepth: "maximum", reason: "Adversarial attack unresolved at deep — maximum needed" };
  }

  return { shouldEscalate: false, newDepth: currentDepth, reason: "No escalation triggers met" };
}

// ─── Create an escalation record ──────────────────────────────────────────
export function createEscalationRecord(
  taskId: string,
  cycleId: string,
  initialDepth: ReasoningEffort,
  trigger: { from: ReasoningEffort; to: ReasoningEffort; reason: string },
): ReasoningEscalation {
  const fullTrigger: ReasoningEscalationTrigger = {
    ...trigger,
    timestamp: Date.now(),
  };
  return {
    id: genEscalationId(),
    taskId,
    cycleId,
    initialDepth,
    currentDepth: trigger.to,
    triggers: [fullTrigger],
    timestamp: Date.now(),
  };
}

export function addEscalationTrigger(
  escalation: ReasoningEscalation,
  trigger: ReasoningEscalationTrigger,
): ReasoningEscalation {
  escalation.triggers.push(trigger);
  escalation.currentDepth = trigger.to;
  return escalation;
}

// ─── Analyze task characteristics from state ──────────────────────────────
export function analyzeTaskCharacteristics(
  state: InvestigationState,
  taskType: string,
  targetHypothesisId?: string,
  targetClaimId?: string,
  targetContradictionId?: string,
): TaskCharacteristics {
  const hasOpenContradictions = [...state.contradictions.values()].some(
    (c) => c.status === "POTENTIAL" || c.status === "UNRESOLVED"
  );

  const hasModelDisagreements = [...state.disagreements.values()].some(
    (d) => d.resolutionStatus === "OPEN" || d.resolutionStatus === "INVESTIGATING"
  );

  const hypothesisDepends = targetHypothesisId
    ? state.hypotheses.get(targetHypothesisId)?.supportLevel === "STRONG" ||
      state.hypotheses.get(targetHypothesisId)?.supportLevel === "MODERATE"
    : false;

  const isConsequential = taskType === "attack_hypothesis" ||
    taskType === "resolve_major_disagreement" ||
    taskType === "final_reassessment" ||
    taskType === "synthesize_assessment";

  return {
    involvesContradiction: !!targetContradictionId || taskType === "analyze_contradiction",
    involvesCausality: taskType === "assess_causal_explanation" || taskType === "check_causality",
    modelsDisagree: hasModelDisagreements,
    sourceIndependenceUncertain: [...state.evidenceClusters?.values() ?? []].some(
      (c) => c.independentRoots < c.totalSources * 0.5
    ),
    isConsequential,
    hypothesisDependsOnThis: hypothesisDepends,
    unresolvedContradictionsExist: hasOpenContradictions,
    substantialUncertainty: state.assessment?.confidenceLevel === "LOW" || state.assessment?.confidenceLevel === "VERY_LOW",
    isAssessmentRevision: taskType === "final_reassessment" || taskType === "synthesize_assessment",
    isAdversarialAttack: taskType === "attack_hypothesis",
    isFinalReassessment: taskType === "final_reassessment",
    highExpectedInfoGain: targetHypothesisId !== undefined && hypothesisDepends,
    researchFailedToResolve: false, // set dynamically by caller
  };
}
