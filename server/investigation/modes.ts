// ─── INVESTIGATION MODE CONFIGURATIONS ────────────────────────────────────
// Directive 05: Configurable investigation depth.

import type { InvestigationMode, ModeConfig, ReasoningEffort } from "./persistence-types.js";

export const MODE_CONFIGS: Record<InvestigationMode, ModeConfig> = {
  QUICK: {
    mode: "QUICK",
    maxCycles: 3,
    defaultReasoningDepth: "standard",
    maxReasoningDepth: "deep",
    maxConcurrentAgents: 2,
    adversarialRounds: 1,
    convergenceStrictness: "LOOSE",
    budgetMultiplier: 0.5,
    primarySourceTarget: 3,
    secondPassReview: false,
    multiModelReview: false,
  },
  STANDARD: {
    mode: "STANDARD",
    maxCycles: 8,
    defaultReasoningDepth: "standard",
    maxReasoningDepth: "maximum",
    maxConcurrentAgents: 3,
    adversarialRounds: 2,
    convergenceStrictness: "NORMAL",
    budgetMultiplier: 1.0,
    primarySourceTarget: 8,
    secondPassReview: false,
    multiModelReview: false,
  },
  DEEP: {
    mode: "DEEP",
    maxCycles: 20,
    defaultReasoningDepth: "deep",
    maxReasoningDepth: "maximum",
    maxConcurrentAgents: 4,
    adversarialRounds: 3,
    convergenceStrictness: "STRICT",
    budgetMultiplier: 2.5,
    primarySourceTarget: 20,
    secondPassReview: true,
    multiModelReview: true,
  },
  FORENSIC: {
    mode: "FORENSIC",
    maxCycles: 50,
    defaultReasoningDepth: "deep",
    maxReasoningDepth: "maximum",
    maxConcurrentAgents: 4,
    adversarialRounds: 5,
    convergenceStrictness: "STRICT",
    budgetMultiplier: 5.0,
    primarySourceTarget: 50,
    secondPassReview: true,
    multiModelReview: true,
  },
};

export function getModeConfig(mode: InvestigationMode): ModeConfig {
  return MODE_CONFIGS[mode];
}

export function getDefaultReasoningDepth(mode: InvestigationMode): ReasoningEffort {
  return MODE_CONFIGS[mode].defaultReasoningDepth;
}

export function getMaxReasoningDepth(mode: InvestigationMode): ReasoningEffort {
  return MODE_CONFIGS[mode].maxReasoningDepth;
}
