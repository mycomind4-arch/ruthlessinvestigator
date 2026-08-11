// ─── SKILL SELECTION ENGINE (Directive 05, Step 21) ────────────────────────
// Transparent selection mechanism that evaluates candidate skills
// using multiple dimensions: semantic applicability, input compatibility,
// historical performance, investigation relevance, cost, and known failures.

import type { Skill, SkillInput, SkillStatus } from "./skill-types.js";
import type { SkillRegistry } from "./skill-registry.js";
import type { InvestigationState } from "./types.js";

// ─── Selection Result ────────────────────────────────────────────────────

export interface SkillSelectionCandidate {
  skill: Skill;
  score: number;
  breakdown: SelectionScoreBreakdown;
  requiredInputs: SkillInput[];
  missingInputs: SkillInput[];
  expectedOutputs: string[];
  knownWeaknesses: string[];
  dependencies: string[];
  estimatedCost: number;
  estimatedDuration: number;
}

export interface SelectionScoreBreakdown {
  semanticApplicability: number;   // 0-1: how well the skill's purpose matches the task
  inputCompatibility: number;       // 0-1: fraction of required inputs available
  historicalPerformance: number;    // 0-1: success rate weighted by usage count
  investigationRelevance: number;    // 0-1: relevance to current investigation state
  costScore: number;                // 0-1: lower cost = higher score
  failurePenalty: number;           // 0-1: penalty for known failure modes
  composite: number;                // weighted final score
}

export interface SkillSelectionRequest {
  taskDescription: string;
  taskType: string;                  // e.g. "SEARCH_SOURCES", "EXTRACT_EVIDENCE"
  agentRole?: string;
  availableInputs: Record<string, unknown>;
  investigationState: InvestigationState;
  maxCost?: number;
  minConfidence?: number;
}

export interface SkillSelectionResult {
  selected: SkillSelectionCandidate | null;
  candidates: SkillSelectionCandidate[];
  reason: string;
}

// ─── Weights for composite score ─────────────────────────────────────────

const SELECTION_WEIGHTS = {
  semanticApplicability: 0.25,
  inputCompatibility: 0.20,
  historicalPerformance: 0.20,
  investigationRelevance: 0.15,
  costScore: 0.10,
  failurePenalty: 0.10,
};

// ─── Skill Selection Engine ──────────────────────────────────────────────

export class SkillSelectionEngine {
  constructor(private registry: SkillRegistry) {}

  /**
   * Select the best skill for a given task.
   * Returns all candidates ranked by score, plus the selected skill and reason.
   */
  select(request: SkillSelectionRequest): SkillSelectionResult {
    const allSkills = this.registry.findActiveSkills();
    const candidates: SkillSelectionCandidate[] = [];

    for (const skill of allSkills) {
      const candidate = this.evaluateCandidate(skill, request);
      if (candidate.score > 0) {
        candidates.push(candidate);
      }
    }

    // Sort by composite score descending
    candidates.sort((a, b) => b.score - a.score);

    // Filter by min confidence if specified
    const minConf = request.minConfidence ?? 0.3;
    const viable = candidates.filter(c => c.score >= minConf);

    if (viable.length === 0) {
      return {
        selected: null,
        candidates,
        reason: candidates.length === 0
          ? "No skills match the task requirements."
          : `Best candidate scored ${candidates[0].score.toFixed(2)} but minimum confidence is ${minConf}.`,
      };
    }

    // Filter by max cost if specified
    let filtered = viable;
    if (request.maxCost) {
      filtered = filtered.filter(c => c.estimatedCost <= request.maxCost!);
    }

    const selected = filtered[0] ?? viable[0];

    return {
      selected,
      candidates,
      reason: this.buildSelectionReason(selected, candidates),
    };
  }

  /**
   * Evaluate a single skill against the request.
   */
  private evaluateCandidate(
    skill: Skill,
    request: SkillSelectionRequest,
  ): SkillSelectionCandidate {
    const breakdown = this.scoreSkill(skill, request);
    const requiredInputs = skill.inputs;
    const missingInputs = this.findMissingInputs(skill, request.availableInputs);
    const expectedOutputs = skill.outputs.map(o => o.name);
    const knownWeaknesses = skill.knownFailureModes;
    const dependencies = skill.prerequisites.map(p => p.skillId);

    return {
      skill,
      score: breakdown.composite,
      breakdown,
      requiredInputs,
      missingInputs,
      expectedOutputs,
      knownWeaknesses,
      dependencies,
      estimatedCost: this.estimateCost(skill),
      estimatedDuration: this.estimateDuration(skill),
    };
  }

  /**
   * Score a skill across all dimensions.
   */
  private scoreSkill(
    skill: Skill,
    request: SkillSelectionRequest,
  ): SelectionScoreBreakdown {
    const semantic = this.scoreSemanticApplicability(skill, request);
    const inputCompat = this.scoreInputCompatibility(skill, request);
    const performance = this.scoreHistoricalPerformance(skill);
    const relevance = this.scoreInvestigationRelevance(skill, request.investigationState);
    const cost = this.scoreCost(skill);
    const failurePenalty = this.scoreFailurePenalty(skill);

    const composite =
      semantic * SELECTION_WEIGHTS.semanticApplicability +
      inputCompat * SELECTION_WEIGHTS.inputCompatibility +
      performance * SELECTION_WEIGHTS.historicalPerformance +
      relevance * SELECTION_WEIGHTS.investigationRelevance +
      cost * SELECTION_WEIGHTS.costScore +
      failurePenalty * SELECTION_WEIGHTS.failurePenalty;

    return {
      semanticApplicability: semantic,
      inputCompatibility: inputCompat,
      historicalPerformance: performance,
      investigationRelevance: relevance,
      costScore: cost,
      failurePenalty,
      composite,
    };
  }

  /**
   * Semantic applicability: how well does the skill's purpose match the task?
   * Uses keyword overlap between task description and skill name/description/purpose.
   */
  private scoreSemanticApplicability(skill: Skill, request: SkillSelectionRequest): number {
    const taskLower = request.taskDescription.toLowerCase();
    const skillText = `${skill.name} ${skill.description} ${skill.purpose}`.toLowerCase();

    // Keyword extraction from task description
    const taskWords = this.extractKeywords(taskLower);
    const skillWords = this.extractKeywords(skillText);

    if (taskWords.length === 0) return 0;

    // Jaccard similarity
    const intersection = taskWords.filter(w => skillWords.includes(w));
    const union = [...new Set([...taskWords, ...skillWords])];
    const jaccard = intersection.length / union.length;

    // Also check if skill procedure steps match the task type
    const hasMatchingStepType = skill.procedure.some(
      step => step.type === request.taskType
    );

    // Boost if skill has a matching step type
    const score = jaccard + (hasMatchingStepType ? 0.3 : 0);

    return Math.min(score, 1.0);
  }

  /**
   * Input compatibility: fraction of required inputs that are available.
   */
  private scoreInputCompatibility(skill: Skill, request: SkillSelectionRequest): number {
    if (skill.inputs.length === 0) return 1.0;

    const available = Object.keys(request.availableInputs);
    let satisfied = 0;

    for (const input of skill.inputs) {
      if (!input.required) {
        satisfied++;
        continue;
      }
      if (available.includes(input.name)) {
        satisfied++;
      }
    }

    return satisfied / skill.inputs.length;
  }

  /**
   * Historical performance: success rate weighted by usage count.
   * Skills with no history get a neutral score (0.5).
   */
  private scoreHistoricalPerformance(skill: Skill): number {
    const perf = skill.performance;

    if (perf.usageCount === 0) {
      return 0.5; // No history — neutral
    }

    const successRate = perf.successCount / perf.usageCount;

    // Weight by usage count (more usage = more confidence in the score)
    const usageWeight = Math.min(perf.usageCount / 10, 1.0);

    // Penalize false positive/negative rates
    const accuracyPenalty = (perf.falsePositiveRate + perf.falseNegativeRate) / 2;

    return Math.max(0, successRate * usageWeight - accuracyPenalty);
  }

  /**
   * Investigation relevance: how relevant is this skill to the current investigation?
   * Checks if the skill's compatible agents match agents already used,
   * and if the skill's outputs could address current information gaps.
   */
  private scoreInvestigationRelevance(skill: Skill, state: InvestigationState): number {
    let score = 0.3; // Base relevance

    // Check if skill has been used in this investigation before
    if (perf_includes_investigation(skill, state.id)) {
      score += 0.2; // Previously used — likely relevant
    }

    // Check if skill addresses any open information gaps
    const openGaps = Array.from(state.informationGaps.values()).filter(g => g.status === "OPEN");
    if (openGaps.length > 0) {
      const gapText = openGaps.map(g => g.question || "").join(" ").toLowerCase();
      const skillText = `${skill.name} ${skill.purpose}`.toLowerCase();
      const gapWords = this.extractKeywords(gapText);
      const skillWords = this.extractKeywords(skillText);
      const overlap = gapWords.filter(w => skillWords.includes(w));
      if (gapWords.length > 0) {
        score += 0.3 * (overlap.length / gapWords.length);
      }
    }

    // Check if skill addresses any unresolved contradictions
    const openContradictions = Array.from(state.contradictions.values()).filter(c => c.status === "UNRESOLVED");
    if (openContradictions.length > 0 && skill.category === "ANALYTICAL") {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Cost score: lower cost = higher score.
   */
  private scoreCost(skill: Skill): number {
    const avgCost = skill.performance.averageCost;
    if (avgCost === 0) return 1.0;
    // Exponential decay — $0.50 is moderate, $2+ is expensive
    return Math.max(0, 1.0 - avgCost / 2.0);
  }

  /**
   * Failure penalty: reduces score for skills with known failure modes.
   */
  private scoreFailurePenalty(skill: Skill): number {
    const failureRate = skill.performance.failureCount / Math.max(skill.performance.usageCount, 1);
    const knownFailureCount = skill.knownFailureModes.length;

    // Start at 1.0 (no penalty) and reduce
    let score = 1.0;

    // Penalize high failure rate
    score -= failureRate * 0.3;

    // Penalize known failure modes
    score -= Math.min(knownFailureCount * 0.1, 0.3);

    return Math.max(0, score);
  }

  /**
   * Find which required inputs are missing.
   */
  private findMissingInputs(skill: Skill, available: Record<string, unknown>): SkillInput[] {
    return skill.inputs.filter(input => {
      if (!input.required) return false;
      return !(input.name in available);
    });
  }

  /**
   * Estimate cost based on procedure steps.
   */
  private estimateCost(skill: Skill): number {
    // Use historical average if available
    if (skill.performance.averageCost > 0) {
      return skill.performance.averageCost;
    }

    // Otherwise estimate based on procedure steps
    const stepCost = 0.05; // Estimated cost per step
    return skill.procedure.length * stepCost;
  }

  /**
   * Estimate duration based on procedure steps.
   */
  private estimateDuration(skill: Skill): number {
    if (skill.performance.averageDuration > 0) {
      return skill.performance.averageDuration;
    }
    return skill.procedure.length * 2000; // 2s per step
  }

  /**
   * Extract meaningful keywords from text.
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "must", "can", "of", "to", "in", "for",
      "on", "with", "at", "by", "from", "as", "into", "about", "and", "or",
      "not", "but", "if", "then", "this", "that", "these", "those", "it",
      "its", "they", "them", "their", "we", "us", "our", "you", "your",
      "he", "she", "his", "her", "i", "me", "my", "what", "which", "who",
      "when", "where", "why", "how", "all", "each", "every", "both", "few",
      "more", "most", "other", "some", "such", "no", "nor", "only", "own",
      "same", "so", "than", "too", "very", "just", "now", "also",
    ]);

    return text
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ""))
      .filter(w => w.length > 2 && !stopWords.has(w));
  }

  /**
   * Build a human-readable selection reason.
   */
  private buildSelectionReason(
    selected: SkillSelectionCandidate,
    allCandidates: SkillSelectionCandidate[],
  ): string {
    const lines: string[] = [];

    lines.push(`Selected: ${selected.skill.name} v${selected.skill.version}`);
    lines.push(`Score: ${selected.score.toFixed(2)}`);
    lines.push(`Semantic: ${selected.breakdown.semanticApplicability.toFixed(2)}`);
    lines.push(`Input compatibility: ${selected.breakdown.inputCompatibility.toFixed(2)}`);
    lines.push(`Performance: ${selected.breakdown.historicalPerformance.toFixed(2)}`);
    lines.push(`Relevance: ${selected.breakdown.investigationRelevance.toFixed(2)}`);
    lines.push(`Cost: $${selected.estimatedCost.toFixed(3)}`);

    if (selected.missingInputs.length > 0) {
      lines.push(`Missing inputs: ${selected.missingInputs.map(i => i.name).join(", ")}`);
    }

    if (selected.knownWeaknesses.length > 0) {
      lines.push(`Known weaknesses: ${selected.knownWeaknesses.join(", ")}`);
    }

    if (allCandidates.length > 1) {
      lines.push(`\nAlternatives considered: ${allCandidates.length - 1}`);
      for (let i = 1; i < Math.min(4, allCandidates.length); i++) {
        const alt = allCandidates[i];
        lines.push(`  ${alt.skill.name}: ${alt.score.toFixed(2)}`);
      }
    }

    return lines.join("\n");
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function perf_includes_investigation(skill: Skill, investigationId: string): boolean {
  return skill.performance.investigationsUsedIn.includes(investigationId);
}
