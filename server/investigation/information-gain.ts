// ─── INFORMATION GAIN ASSESSMENT (Directive 05, Step 6) ────────────────────
// Estimates the expected information gain of a research task.
// The Director should prefer high expected information gain per dollar.

import type { InvestigationState, InformationGap, Hypothesis } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────

export type UncertaintyLevel = "NEGLIGIBLE" | "LOW" | "MODERATE" | "HIGH" | "EXTREME";
export type InformationGainLevel = "NEGLIGIBLE" | "LOW" | "MODERATE" | "HIGH" | "EXTREME";

export interface InformationGainAssessment {
  id: string;
  taskId: string;
  taskDescription: string;
  currentUncertainty: UncertaintyLevel;
  potentialUncertaintyReduction: number;  // 0-1
  potentialHypothesisImpact: number;       // 0-1
  researchCost: number;                    // estimated USD
  expectedInformationGain: InformationGainLevel;
  gainPerDollar: number;                    // normalized score
  reasoning: string;
  cheaperAlternative?: {
    description: string;
    estimatedCost: number;
    expectedGain: InformationGainLevel;
    tradeoff: string;
  };
  moreExpensiveAlternative?: {
    description: string;
    estimatedCost: number;
    expectedGain: InformationGainLevel;
    tradeoff: string;
  };
  recommendation: "PROCEED" | "CHEAPER_FIRST" | "EXPENSIVE_JUSTIFIED" | "DEFER" | "ABORT";
  recommendationReason: string;
  createdAt: number;
}

// ─── Information Gain Calculator ──────────────────────────────────────────

export class InformationGainCalculator {
  /**
   * Assess the expected information gain of a research task.
   */
  assess(
    taskDescription: string,
    taskId: string,
    state: InvestigationState,
    estimatedCost: number,
    options?: {
      cheaperAlt?: { description: string; estimatedCost: number };
      expensiveAlt?: { description: string; estimatedCost: number };
    },
  ): InformationGainAssessment {
    // 1. Assess current uncertainty
    const currentUncertainty = this.assessUncertainty(state);

    // 2. Assess potential uncertainty reduction
    const potentialReduction = this.assessPotentialReduction(taskDescription, state);

    // 3. Assess potential hypothesis impact
    const hypothesisImpact = this.assessHypothesisImpact(taskDescription, state);

    // 4. Calculate expected information gain
    const gainScore = potentialReduction * 0.6 + hypothesisImpact * 0.4;
    const gainLevel = this.scoreToLevel(gainScore);

    // 5. Calculate gain per dollar
    const gainPerDollar = estimatedCost > 0 ? gainScore / estimatedCost : gainScore * 100;

    // 6. Assess alternatives
    const cheaperAlternative = options?.cheaperAlt
      ? {
          description: options.cheaperAlt.description,
          estimatedCost: options.cheaperAlt.estimatedCost,
          expectedGain: this.estimateAlternativeGain(options.cheaperAlt.description, state, options.cheaperAlt.estimatedCost),
          tradeoff: this.assessTradeoff(estimatedCost, options.cheaperAlt.estimatedCost, gainLevel),
        }
      : undefined;

    const moreExpensiveAlternative = options?.expensiveAlt
      ? {
          description: options.expensiveAlt.description,
          estimatedCost: options.expensiveAlt.estimatedCost,
          expectedGain: this.estimateAlternativeGain(options.expensiveAlt.description, state, options.expensiveAlt.estimatedCost),
          tradeoff: this.assessTradeoff(estimatedCost, options.expensiveAlt.estimatedCost, gainLevel),
        }
      : undefined;

    // 7. Make recommendation
    const { recommendation, recommendationReason } = this.recommend(
      gainLevel,
      gainPerDollar,
      estimatedCost,
      cheaperAlternative,
      moreExpensiveAlternative,
      currentUncertainty,
    );

    return {
      id: `ig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      taskId,
      taskDescription,
      currentUncertainty,
      potentialUncertaintyReduction: potentialReduction,
      potentialHypothesisImpact: hypothesisImpact,
      researchCost: estimatedCost,
      expectedInformationGain: gainLevel,
      gainPerDollar,
      reasoning: this.buildReasoning(taskDescription, currentUncertainty, gainLevel, potentialReduction, hypothesisImpact, estimatedCost),
      cheaperAlternative,
      moreExpensiveAlternative,
      recommendation,
      recommendationReason,
      createdAt: Date.now(),
    };
  }

  // ─── Private assessment methods ────────────────────────────────────────

  private assessUncertainty(state: InvestigationState): UncertaintyLevel {
    const openGaps = Array.from(state.informationGaps.values()).filter(g => g.status === "OPEN");
    const unresolvedContradictions = Array.from(state.contradictions.values()).filter(c => c.status === "UNRESOLVED");
    const hypotheses = Array.from(state.hypotheses.values());
    const competingHypotheses = hypotheses.filter(h => h.supportLevel !== "NONE" && h.supportLevel !== "INSUFFICIENT_EVIDENCE").length;

    // Count factors
    let score = 0;
    score += Math.min(openGaps.length * 0.1, 0.4);
    score += Math.min(unresolvedContradictions.length * 0.15, 0.3);
    score += competingHypotheses > 1 ? 0.2 : 0;
    score += state.evidence.size < 5 ? 0.1 : 0;

    return this.scoreToUncertainty(score);
  }

  private assessPotentialReduction(taskDescription: string, state: InvestigationState): number {
    const desc = taskDescription.toLowerCase();
    let score = 0.3; // Base

    // Does the task address open information gaps?
    const openGaps = Array.from(state.informationGaps.values()).filter(g => g.status === "OPEN");
    if (openGaps.length > 0) {
      const gapText = openGaps.map(g => g.question || "").join(" ").toLowerCase();
      const taskWords = this.extractKeywords(desc);
      const gapWords = this.extractKeywords(gapText);
      const overlap = taskWords.filter(w => gapWords.includes(w));
      if (gapWords.length > 0) {
        score += 0.3 * (overlap.length / gapWords.length);
      }
    }

    // Does the task address unresolved contradictions?
    const openContradictions = Array.from(state.contradictions.values()).filter(c => c.status === "UNRESOLVED");
    if (openContradictions.length > 0 && (desc.includes("contradict") || desc.includes("conflict") || desc.includes("resolve"))) {
      score += 0.25;
    }

    // Is this a primary source search?
    if (desc.includes("primary source") || desc.includes("primary")) {
      score += 0.15;
    }

    // Is this a verification task?
    if (desc.includes("verify") || desc.includes("confirm")) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  private assessHypothesisImpact(taskDescription: string, state: InvestigationState): number {
    const desc = taskDescription.toLowerCase();
    let score = 0.2; // Base

    const activeHypotheses = Array.from(state.hypotheses.values()).filter(h => h.supportLevel !== "NONE" && h.supportLevel !== "INSUFFICIENT_EVIDENCE");
    if (activeHypotheses.length === 0) return score;

    // Does the task potentially discriminate between hypotheses?
    if (desc.includes("test") || desc.includes("discriminat") || desc.includes("distinguish")) {
      score += 0.3;
    }

    // Does it challenge a leading hypothesis?
    if (desc.includes("challenge") || desc.includes("adversarial") || desc.includes("attack")) {
      score += 0.25;
    }

    // Does it support or weaken a specific hypothesis?
    if (desc.includes("support") || desc.includes("weaken") || desc.includes("evidence for") || desc.includes("evidence against")) {
      score += 0.2;
    }

    // More competing hypotheses = higher potential impact
    if (activeHypotheses.length > 2) {
      score += 0.15;
    }

    return Math.min(score, 1.0);
  }

  private estimateAlternativeGain(
    description: string,
    state: InvestigationState,
    cost: number,
  ): InformationGainLevel {
    // Simple heuristic: cheaper alternatives have slightly lower gain
    const score = this.assessPotentialReduction(description, state);
    // Cost penalty
    const adjusted = score * (1 - Math.min(cost * 0.1, 0.2));
    return this.scoreToLevel(adjusted);
  }

  private assessTradeoff(
    mainCost: number,
    altCost: number,
    mainGain: InformationGainLevel,
  ): string {
    const costDiff = mainCost - altCost;
    if (costDiff > 0) {
      return `Saves $${costDiff.toFixed(2)} but may have lower information gain`;
    }
    return `Costs $${(-costDiff).toFixed(2)} more but may yield higher information gain`;
  }

  private recommend(
    gainLevel: InformationGainLevel,
    gainPerDollar: number,
    cost: number,
    cheaperAlt?: InformationGainAssessment["cheaperAlternative"],
    expensiveAlt?: InformationGainAssessment["moreExpensiveAlternative"],
    uncertainty?: UncertaintyLevel,
  ): { recommendation: InformationGainAssessment["recommendation"]; recommendationReason: string } {
    // If gain is negligible, defer
    if (gainLevel === "NEGLIGIBLE") {
      return {
        recommendation: "DEFER",
        recommendationReason: "Expected information gain is negligible. Defer this task.",
      };
    }

    // If cheaper alternative exists with reasonable gain, try cheaper first
    if (cheaperAlt && cheaperAlt.estimatedCost < cost) {
      const cheaperGainLevel = this.levelToScore(cheaperAlt.expectedGain);
      const mainGainLevel = this.levelToScore(gainLevel);
      const costRatio = cheaperAlt.estimatedCost / cost;

      // If cheaper alternative gives >70% of the gain at <50% of the cost
      if (cheaperGainLevel >= mainGainLevel * 0.7 && costRatio < 0.5) {
        return {
          recommendation: "CHEAPER_FIRST",
          recommendationReason: `Cheaper alternative ("${cheaperAlt.description}") offers ${Math.round(cheaperGainLevel / mainGainLevel * 100)}% of expected gain at ${Math.round(costRatio * 100)}% of cost. Try cheaper first.`,
        };
      }
    }

    // If gain is high and cost is justified
    if (gainLevel === "HIGH" || gainLevel === "EXTREME") {
      if (expensiveAlt && expensiveAlt.estimatedCost > cost) {
        const expGainScore = this.levelToScore(expensiveAlt.expectedGain);
        const mainGainScore = this.levelToScore(gainLevel);
        if (expGainScore > mainGainScore * 1.3) {
          return {
            recommendation: "EXPENSIVE_JUSTIFIED",
            recommendationReason: `More expensive alternative ("${expensiveAlt.description}") offers significantly higher expected gain. Justified by ${uncertainty ?? "unknown"} uncertainty.`,
          };
        }
      }
      return {
        recommendation: "PROCEED",
        recommendationReason: `Expected information gain is ${gainLevel}. Cost of $${cost.toFixed(2)} is justified.`,
      };
    }

    // Low gain + high cost = abort
    if (gainLevel === "LOW" && cost > 0.5) {
      return {
        recommendation: "ABORT",
        recommendationReason: `Expected gain is LOW but cost is $${cost.toFixed(2)}. Not worth pursuing.`,
      };
    }

    return {
      recommendation: "PROCEED",
      recommendationReason: `Expected information gain is ${gainLevel}. Proceed with cost $${cost.toFixed(2)}.`,
    };
  }

  // ─── Utility ────────────────────────────────────────────────────────────

  private scoreToLevel(score: number): InformationGainLevel {
    if (score >= 0.7) return "EXTREME";
    if (score >= 0.5) return "HIGH";
    if (score >= 0.3) return "MODERATE";
    if (score >= 0.15) return "LOW";
    return "NEGLIGIBLE";
  }

  private levelToScore(level: InformationGainLevel): number {
    const map: Record<InformationGainLevel, number> = {
      NEGLIGIBLE: 0.05,
      LOW: 0.2,
      MODERATE: 0.4,
      HIGH: 0.6,
      EXTREME: 0.85,
    };
    return map[level];
  }

  private scoreToUncertainty(score: number): UncertaintyLevel {
    if (score >= 0.7) return "EXTREME";
    if (score >= 0.5) return "HIGH";
    if (score >= 0.3) return "MODERATE";
    if (score >= 0.15) return "LOW";
    return "NEGLIGIBLE";
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set(["the", "a", "an", "is", "are", "of", "to", "in", "for", "on", "with", "and", "or", "what", "why", "how", "this", "that"]);
    return text
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ""))
      .filter(w => w.length > 2 && !stopWords.has(w));
  }

  private buildReasoning(
    task: string,
    uncertainty: UncertaintyLevel,
    gain: InformationGainLevel,
    reduction: number,
    impact: number,
    cost: number,
  ): string {
    const lines: string[] = [];
    lines.push(`Task: ${task}`);
    lines.push(`Current uncertainty: ${uncertainty}`);
    lines.push(`Potential uncertainty reduction: ${(reduction * 100).toFixed(0)}%`);
    lines.push(`Potential hypothesis impact: ${(impact * 100).toFixed(0)}%`);
    lines.push(`Expected information gain: ${gain}`);
    lines.push(`Estimated cost: $${cost.toFixed(2)}`);
    const gainScore = gain === "EXTREME" ? 0.85 : gain === "HIGH" ? 0.6 : gain === "MODERATE" ? 0.4 : gain === "LOW" ? 0.2 : 0.05;
    lines.push(`Gain per dollar: ${(gainScore / Math.max(cost, 0.001)).toFixed(1)}`);
    return lines.join("\n");
  }
}

// ─── Cost Efficiency Metrics (Directive 05, Step 27) ──────────────────────

export interface CostEfficiencyMetrics {
  totalSpent: number;
  evidenceItemsProduced: number;
  informationGapsResolved: number;
  contradictionsDiscovered: number;
  hypothesisRevisions: number;
  claimsValidated: number;
  meaningfulAssessmentChanges: number;
  costPerEvidence: number;
  costPerGapResolved: number;
  costPerContradiction: number;
  costPerHypothesisRevision: number;
  costPerValidatedClaim: number;
  costPerAssessmentChange: number;
  costAvoided: {
    skillReuse: number;
    cheapModelRouting: number;
    earlyTaskTermination: number;
    total: number;
  };
}

export class CostEfficiencyTracker {
  private skillReuseSavings: number = 0;
  private routingSavings: number = 0;
  private terminationSavings: number = 0;

  recordSkillReuseSavings(amount: number): void {
    this.skillReuseSavings += amount;
  }

  recordRoutingSavings(amount: number): void {
    this.routingSavings += amount;
  }

  recordTerminationSavings(amount: number): void {
    this.terminationSavings += amount;
  }

  compute(
    totalSpent: number,
    state: InvestigationState,
  ): CostEfficiencyMetrics {
    const evidenceCount = state.evidence.size;
    const gapsResolved = Array.from(state.informationGaps.values()).filter(g => g.status !== "OPEN").length;
    const contradictions = state.contradictions.size;
    const hypothesisRevisions = state.hypothesisCompetitions?.size ?? 0;
    const claimsValidated = Array.from(state.claims.values()).filter(c => c.status === "SUPPORTED" || c.status === "EXPLAINED").length;
    const assessmentChanges = state.assessmentRevisions?.size ?? 0;

    return {
      totalSpent,
      evidenceItemsProduced: evidenceCount,
      informationGapsResolved: gapsResolved,
      contradictionsDiscovered: contradictions,
      hypothesisRevisions,
      claimsValidated,
      meaningfulAssessmentChanges: assessmentChanges,
      costPerEvidence: evidenceCount > 0 ? totalSpent / evidenceCount : 0,
      costPerGapResolved: gapsResolved > 0 ? totalSpent / gapsResolved : 0,
      costPerContradiction: contradictions > 0 ? totalSpent / contradictions : 0,
      costPerHypothesisRevision: hypothesisRevisions > 0 ? totalSpent / hypothesisRevisions : 0,
      costPerValidatedClaim: claimsValidated > 0 ? totalSpent / claimsValidated : 0,
      costPerAssessmentChange: assessmentChanges > 0 ? totalSpent / assessmentChanges : 0,
      costAvoided: {
        skillReuse: this.skillReuseSavings,
        cheapModelRouting: this.routingSavings,
        earlyTaskTermination: this.terminationSavings,
        total: this.skillReuseSavings + this.routingSavings + this.terminationSavings,
      },
    };
  }
}
