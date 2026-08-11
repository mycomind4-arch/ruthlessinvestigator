// ─── INVESTIGATION RECIPE LIBRARY (Directive 05, Steps 24-25) ──────────────
// Proven compositions of skills for classes of problems.
// Recipes are generated from validated skills, not hard-coded assumptions.

import type { Skill } from "./skill-types.js";
import type { SkillRegistry } from "./skill-registry.js";
import type { SkillCompositionEngine } from "./skill-composition.js";
import type { InvestigationState } from "./types.js";

// ─── Recipe Types ─────────────────────────────────────────────────────────

export type ProblemClass =
  | "INFRASTRUCTURE"
  | "CORPORATE"
  | "POLITICAL_INFLUENCE"
  | "REGULATORY"
  | "SCIENTIFIC_CLAIM"
  | "HISTORICAL_EVENT"
  | "FINANCIAL"
  | "PROPERTY"
  | "TECHNOLOGY"
  | "PUBLIC_POLICY"
  | "ENERGY"
  | "DATA_CENTER"
  | "UNKNOWN"
  ;

export interface InvestigationRecipe {
  id: string;
  name: string;
  problemClass: ProblemClass;
  description: string;
  skillIds: string[];
  skillSequence: string[];          // ordered execution
  parallelTasks: string[][];        // tasks that can run concurrently
  estimatedCost: number;
  estimatedDuration: number;
  expectedInformationGain: "LOW" | "MODERATE" | "HIGH";
  successRate: number;              // 0-1, based on historical usage
  timesUsed: number;
  createdAt: number;
  updatedAt: number;
  status: "EXPERIMENTAL" | "VALIDATED" | "MATURE";
  provenance: {
    sourceInvestigations: string[];
    extractedFrom: string;          // how this recipe was created
  };
}

export interface ProblemClassification {
  problemClass: ProblemClass;
  confidence: number;
  reasoning: string;
  detectedKeywords: string[];
  suggestedSkills: string[];
  suggestedRecipes: string[];
}

export interface StrategySelection {
  classification: ProblemClassification;
  selectedRecipe: InvestigationRecipe | null;
  selectedSkills: Skill[];
  estimatedCost: number;
  estimatedDuration: number;
  expectedInformationGain: "LOW" | "MODERATE" | "HIGH";
  alternativeStrategies: StrategyAlternative[];
  reason: string;
  budgetRequired: number;
}

export interface StrategyAlternative {
  name: string;
  estimatedCost: number;
  expectedGain: "LOW" | "MODERATE" | "HIGH";
  tradeoff: string;
}

// ─── Problem Classifier ──────────────────────────────────────────────────

const CLASSIFICATION_KEYWORDS: Record<ProblemClass, string[]> = {
  INFRASTRUCTURE: ["infrastructure", "construction", "building", "facility", "data center", "server farm", "power grid", "utility", "pipeline"],
  CORPORATE: ["corporate", "company", "corporation", "ownership", "subsidiary", "merger", "acquisition", "board", "executive"],
  POLITICAL_INFLUENCE: ["political", "campaign", "lobbying", "influence", "election", "donation", "pac", "super pac", "political action"],
  REGULATORY: ["regulatory", "regulation", "permit", "filing", "compliance", "epa", "fda", "fcc", "regulator", "zoning"],
  SCIENTIFIC_CLAIM: ["scientific", "study", "research", "peer review", "journal", "hypothesis", "experiment", "data", "findings"],
  HISTORICAL_EVENT: ["historical", "history", "past event", "timeline", "what happened", "chronology", "when did"],
  FINANCIAL: ["financial", "revenue", "profit", "investment", "funding", "venture", "capital", "sec filing", "earnings", "financial trail"],
  PROPERTY: ["property", "real estate", "land", "deed", "ownership", "assessment", "parcel", "zoning"],
  TECHNOLOGY: ["technology", "software", "ai", "artificial intelligence", "algorithm", "platform", "tech", "digital"],
  PUBLIC_POLICY: ["public policy", "government", "policy", "legislation", "law", "congress", "senate", "regulation", "public"],
  ENERGY: ["energy", "electricity", "power", "grid", "renewable", "solar", "wind", "nuclear", "coal", "natural gas", "utility"],
  DATA_CENTER: ["data center", "server", "cloud", "compute", "hyperscale", "colocation", "edge", "datacenter"],
  UNKNOWN: [],
};

export class ProblemClassifier {
  classify(question: string, state?: InvestigationState): ProblemClassification {
    const q = question.toLowerCase();
    const detectedKeywords: string[] = [];
    const scores: Map<ProblemClass, number> = new Map();

    for (const [cls, keywords] of Object.entries(CLASSIFICATION_KEYWORDS)) {
      if (cls === "UNKNOWN") continue;
      let score = 0;
      for (const kw of keywords) {
        if (q.includes(kw)) {
          score += kw.length > 5 ? 2 : 1;
          detectedKeywords.push(kw);
        }
      }
      if (score > 0) {
        scores.set(cls as ProblemClass, score);
      }
    }

    // Sort by score
    const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
      return {
        problemClass: "UNKNOWN",
        confidence: 0.3,
        reasoning: "No specific problem class detected. Will use general investigation strategy.",
        detectedKeywords: [],
        suggestedSkills: [],
        suggestedRecipes: [],
      };
    }

    const topClass = sorted[0][0];
    const topScore = sorted[0][1];
    const totalScore = sorted.reduce((sum, [, s]) => sum + s, 0);
    const confidence = Math.min(topScore / totalScore + 0.3, 1.0);

    // Multi-class detection
    const allClasses = sorted.filter(([, s]) => s >= topScore * 0.5).map(([c]) => c as ProblemClass);

    const reasoning = `Question matches ${allClasses.join(" + ")} (${topScore} keyword score). ` +
      `Primary class: ${topClass} (${Math.round(confidence * 100)}% confidence).`;

    return {
      problemClass: topClass,
      confidence,
      reasoning,
      detectedKeywords: [...new Set(detectedKeywords)],
      suggestedSkills: [],
      suggestedRecipes: [],
    };
  }
}

// ─── Recipe Library ──────────────────────────────────────────────────────

export class RecipeLibrary {
  private recipes: Map<string, InvestigationRecipe> = new Map();

  constructor() {
    this.seedBuiltInRecipes();
  }

  private seedBuiltInRecipes(): void {
    // Built-in recipe templates — these start as EXPERIMENTAL
    // and are validated through actual investigation use
    const templates: Omit<InvestigationRecipe, "id" | "createdAt" | "updatedAt">[] = [
      {
        name: "Infrastructure Investigation",
        problemClass: "INFRASTRUCTURE",
        description: "Investigate physical infrastructure projects: permits, construction, ownership, financing",
        skillIds: [],
        skillSequence: [],
        parallelTasks: [],
        estimatedCost: 1.5,
        estimatedDuration: 60000,
        expectedInformationGain: "HIGH",
        successRate: 0,
        timesUsed: 0,
        status: "EXPERIMENTAL",
        provenance: { sourceInvestigations: [], extractedFrom: "built-in template" },
      },
      {
        name: "Corporate Investigation",
        problemClass: "CORPORATE",
        description: "Investigate corporate entities: ownership, relationships, financial connections",
        skillIds: [],
        skillSequence: [],
        parallelTasks: [],
        estimatedCost: 2.0,
        estimatedDuration: 90000,
        expectedInformationGain: "HIGH",
        successRate: 0,
        timesUsed: 0,
        status: "EXPERIMENTAL",
        provenance: { sourceInvestigations: [], extractedFrom: "built-in template" },
      },
      {
        name: "Energy / Data Center Investigation",
        problemClass: "DATA_CENTER",
        description: "Investigate data center construction, energy consumption, and infrastructure drivers",
        skillIds: [],
        skillSequence: [],
        parallelTasks: [],
        estimatedCost: 1.8,
        estimatedDuration: 75000,
        expectedInformationGain: "HIGH",
        successRate: 0,
        timesUsed: 0,
        status: "EXPERIMENTAL",
        provenance: { sourceInvestigations: [], extractedFrom: "built-in template" },
      },
      {
        name: "Scientific Claim Verification",
        problemClass: "SCIENTIFIC_CLAIM",
        description: "Verify scientific claims: check primary sources, methodology, peer review status",
        skillIds: [],
        skillSequence: [],
        parallelTasks: [],
        estimatedCost: 1.2,
        estimatedDuration: 60000,
        expectedInformationGain: "MODERATE",
        successRate: 0,
        timesUsed: 0,
        status: "EXPERIMENTAL",
        provenance: { sourceInvestigations: [], extractedFrom: "built-in template" },
      },
      {
        name: "Financial Trail Analysis",
        problemClass: "FINANCIAL",
        description: "Follow financial connections: SEC filings, funding rounds, investment trails",
        skillIds: [],
        skillSequence: [],
        parallelTasks: [],
        estimatedCost: 2.5,
        estimatedDuration: 120000,
        expectedInformationGain: "HIGH",
        successRate: 0,
        timesUsed: 0,
        status: "EXPERIMENTAL",
        provenance: { sourceInvestigations: [], extractedFrom: "built-in template" },
      },
    ];

    for (const template of templates) {
      const id = `recipe-${template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      this.recipes.set(id, {
        ...template,
        id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  addRecipe(recipe: InvestigationRecipe): void {
    this.recipes.set(recipe.id, recipe);
  }

  getRecipe(id: string): InvestigationRecipe | undefined {
    return this.recipes.get(id);
  }

  getAllRecipes(): InvestigationRecipe[] {
    return [...this.recipes.values()];
  }

  findRecipesForClass(problemClass: ProblemClass): InvestigationRecipe[] {
    return [...this.recipes.values()].filter(r =>
      r.problemClass === problemClass &&
      r.status === "EXPERIMENTAL" || r.status === "VALIDATED" || r.status === "MATURE"
    );
  }

  updateRecipeUsage(id: string, success: boolean, cost: number): void {
    const recipe = this.recipes.get(id);
    if (!recipe) return;
    recipe.timesUsed++;
    const prevSuccessRate = recipe.successRate;
    recipe.successRate = (prevSuccessRate * (recipe.timesUsed - 1) + (success ? 1 : 0)) / recipe.timesUsed;
    recipe.estimatedCost = (recipe.estimatedCost * (recipe.timesUsed - 1) + cost) / recipe.timesUsed;
    recipe.updatedAt = Date.now();

    // Promote recipe based on usage
    if (recipe.timesUsed >= 5 && recipe.successRate >= 0.7 && recipe.status === "EXPERIMENTAL") {
      recipe.status = "VALIDATED";
    } else if (recipe.timesUsed >= 10 && recipe.successRate >= 0.8 && recipe.status === "VALIDATED") {
      recipe.status = "MATURE";
    }
  }
}

// ─── Strategy Selector ────────────────────────────────────────────────────

export class StrategySelector {
  constructor(
    private skillRegistry: SkillRegistry,
    private recipeLibrary: RecipeLibrary,
  ) {}

  selectStrategy(
    question: string,
    budget: number,
    state: InvestigationState,
  ): StrategySelection {
    const classifier = new ProblemClassifier();
    const classification = classifier.classify(question, state);

    // Find applicable recipes
    const recipes = this.recipeLibrary.findRecipesForClass(classification.problemClass);
    let selectedRecipe: InvestigationRecipe | null = recipes[0] ?? null;

    // If no recipe matches, create a default strategy
    if (!selectedRecipe) {
      selectedRecipe = null;
    }

    // Find applicable skills
    const allSkills = this.skillRegistry.findActiveSkills();
    const suggestedSkills = this.matchSkillsToClass(allSkills, classification.problemClass);

    // Estimate cost
    const skillCost = suggestedSkills.reduce((sum, s) =>
      sum + (s.performance.averageCost > 0 ? s.performance.averageCost : 0.05), 0
    );
    const recipeCost = selectedRecipe?.estimatedCost ?? skillCost;
    const estimatedCost = Math.min(recipeCost, budget);

    // Build alternative strategies
    const alternativeStrategies: StrategyAlternative[] = [];

    // Cheaper alternative: fewer skills
    alternativeStrategies.push({
      name: "Minimal: cached knowledge + basic search",
      estimatedCost: Math.max(estimatedCost * 0.3, 0.05),
      expectedGain: "LOW",
      tradeoff: "Much cheaper but may miss important evidence",
    });

    // More expensive alternative
    alternativeStrategies.push({
      name: "Deep multi-model investigation",
      estimatedCost: estimatedCost * 3,
      expectedGain: "HIGH",
      tradeoff: "More thorough but costs 3x more",
    });

    const reason = selectedRecipe
      ? `Recipe "${selectedRecipe.name}" selected for ${classification.problemClass} problems. ` +
        `Expected gain: ${selectedRecipe.expectedInformationGain}. ` +
        `Cost $${estimatedCost.toFixed(2)} within budget $${budget.toFixed(2)}.`
      : `No validated recipe for ${classification.problemClass}. Using ${suggestedSkills.length} applicable skills. ` +
        `Cost $${estimatedCost.toFixed(2)} within budget $${budget.toFixed(2)}.`;

    return {
      classification,
      selectedRecipe,
      selectedSkills: suggestedSkills,
      estimatedCost,
      estimatedDuration: selectedRecipe?.estimatedDuration ?? suggestedSkills.length * 10000,
      expectedInformationGain: selectedRecipe?.expectedInformationGain ?? "MODERATE",
      alternativeStrategies,
      reason,
      budgetRequired: estimatedCost,
    };
  }

  private matchSkillsToClass(skills: Skill[], problemClass: ProblemClass): Skill[] {
    // Match skills based on their compatible investigation types
    const classToSkillKeywords: Record<string, string[]> = {
      INFRASTRUCTURE: ["source", "timeline", "evidence", "primary"],
      CORPORATE: ["source", "ownership", "relationship", "financial"],
      DATA_CENTER: ["source", "timeline", "evidence", "claim"],
      SCIENTIFIC_CLAIM: ["claim", "verification", "source", "evidence"],
      FINANCIAL: ["source", "financial", "ownership", "timeline"],
      UNKNOWN: ["source", "evidence", "claim"],
    };

    const keywords = classToSkillKeywords[problemClass] ?? classToSkillKeywords.UNKNOWN;

    return skills.filter(s => {
      const skillText = `${s.name} ${s.description} ${s.purpose}`.toLowerCase();
      return keywords.some(kw => skillText.includes(kw));
    });
  }
}

// ─── Skill De-Duplication (Directive 05, Step 17) ──────────────────────────

export interface SkillSimilarityResult {
  skillAId: string;
  skillBId: string;
  skillAName: string;
  skillBName: string;
  similarity: number;       // 0-1
  similarityType: "DUPLICATE" | "OVERLAPPING" | "RELATED" | "DISTINCT";
  sharedInputs: string[];
  sharedOutputs: string[];
  sharedKeywords: string[];
  recommendation: "MERGE" | "KEEP_BOTH" | "RETIRE_ONE" | "NONE";
  reason: string;
}

export class SkillDeduplicator {
  constructor(private registry: SkillRegistry) {}

  findSimilarSkills(): SkillSimilarityResult[] {
    const skills = this.registry.findActiveSkills();
    const results: SkillSimilarityResult[] = [];

    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        const result = this.compareSkills(skills[i], skills[j]);
        if (result.similarityType !== "DISTINCT") {
          results.push(result);
        }
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  private compareSkills(a: Skill, b: Skill): SkillSimilarityResult {
    // Compare inputs
    const aInputs = new Set(a.inputs.map(i => i.name));
    const bInputs = new Set(b.inputs.map(i => i.name));
    const sharedInputs = [...aInputs].filter(x => bInputs.has(x));

    // Compare outputs
    const aOutputs = new Set(a.outputs.map(o => o.name));
    const bOutputs = new Set(b.outputs.map(o => o.name));
    const sharedOutputs = [...aOutputs].filter(x => bOutputs.has(x));

    // Compare keywords
    const aWords = this.extractKeywords(`${a.name} ${a.description} ${a.purpose}`);
    const bWords = this.extractKeywords(`${b.name} ${b.description} ${b.purpose}`);
    const sharedKeywords = aWords.filter(w => bWords.includes(w));

    // Calculate Jaccard similarity for keywords
    const union = [...new Set([...aWords, ...bWords])];
    const jaccard = union.length > 0 ? sharedKeywords.length / union.length : 0;

    // Input/output overlap
    const inputOverlap = aInputs.size > 0 && bInputs.size > 0
      ? sharedInputs.length / Math.max(aInputs.size, bInputs.size)
      : 0;
    const outputOverlap = aOutputs.size > 0 && bOutputs.size > 0
      ? sharedOutputs.length / Math.max(aOutputs.size, bOutputs.size)
      : 0;

    // Composite similarity
    const similarity = jaccard * 0.5 + inputOverlap * 0.25 + outputOverlap * 0.25;

    let similarityType: SkillSimilarityResult["similarityType"];
    let recommendation: SkillSimilarityResult["recommendation"];
    let reason: string;

    if (similarity >= 0.85) {
      similarityType = "DUPLICATE";
      recommendation = "MERGE";
      reason = `Skills are ${Math.round(similarity * 100)}% similar — likely duplicates. Consider merging.`;
    } else if (similarity >= 0.6) {
      similarityType = "OVERLAPPING";
      recommendation = "RETIRE_ONE";
      reason = `Skills are ${Math.round(similarity * 100)}% similar — significant overlap. Consider retiring the weaker one.`;
    } else if (similarity >= 0.35) {
      similarityType = "RELATED";
      recommendation = "KEEP_BOTH";
      reason = `Skills are ${Math.round(similarity * 100)}% similar — related but distinct. Keep both.`;
    } else {
      similarityType = "DISTINCT";
      recommendation = "NONE";
      reason = `Skills are only ${Math.round(similarity * 100)}% similar — distinct capabilities.`;
    }

    return {
      skillAId: a.id,
      skillBId: b.id,
      skillAName: a.name,
      skillBName: b.name,
      similarity,
      similarityType,
      sharedInputs,
      sharedOutputs,
      sharedKeywords,
      recommendation,
      reason,
    };
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set(["the", "a", "an", "is", "are", "of", "to", "in", "for", "on", "with", "and", "or"]);
    return text.toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ""))
      .filter(w => w.length > 2 && !stopWords.has(w));
  }
}

// ─── Post-Investigation Postmortem (Directive 05, Step 20) ────────────────

export interface InvestigationPostmortem {
  id: string;
  investigationId: string;
  question: string;
  completedAt: number;
  summary: string;
  usefulTasks: PostmortemTask[];
  wastefulTasks: PostmortemTask[];
  unnecessaryAgents: string[];
  unnecessarySpending: number;
  missedInvestigations: string[];
  lateSkills: string[];
  effectiveSkills: string[];
  escalationAnalysis: PostmortemEscalationAnalysis;
  adversarialImpact: "NONE" | "MINOR" | "MODERATE" | "SIGNIFICANT" | "CRITICAL";
  directorLessons: string[];
  skillCandidates: string[];
  costEfficiency: {
    totalSpent: number;
    usefulSpent: number;
    wastedSpent: number;
    ratio: number;
  };
  recommendations: string[];
}

export interface PostmortemTask {
  taskId: string;
  description: string;
  cost: number;
  evidenceProduced: number;
  informationGain: "LOW" | "MODERATE" | "HIGH";
  useful: boolean;
  reason: string;
}

export interface PostmortemEscalationAnalysis {
  totalEscalations: number;
  justifiedEscalations: number;
  unjustifiedEscalations: number;
  totalEscalationCost: number;
  lessons: string[];
}

export class PostInvestigationReviewer {
  generatePostmortem(
    state: InvestigationState,
    costRecords: Array<{ taskLabel: string; costUSD: number; agentRole: string }>,
    escalationRecords: Array<{ reason: string; additionalCost: number; actualBenefit: string | null }>,
  ): InvestigationPostmortem {
    const evidenceCount = state.evidence.size;
    const totalSpent = costRecords.reduce((sum, r) => sum + r.costUSD, 0);

    // Classify tasks
    const usefulTasks: PostmortemTask[] = [];
    const wastefulTasks: PostmortemTask[] = [];

    for (const record of costRecords) {
      const taskEvidence = this.estimateTaskEvidence(record.taskLabel, state);
      const gain: "LOW" | "MODERATE" | "HIGH" =
        taskEvidence > 3 ? "HIGH" : taskEvidence > 1 ? "MODERATE" : "LOW";
      const useful = gain !== "LOW" || taskEvidence > 0;

      const task: PostmortemTask = {
        taskId: record.taskLabel,
        description: record.taskLabel,
        cost: record.costUSD,
        evidenceProduced: taskEvidence,
        informationGain: gain,
        useful,
        reason: useful
          ? `Produced ${taskEvidence} evidence items with ${gain} information gain`
          : `Produced ${taskEvidence} evidence items — low information gain for $${record.costUSD.toFixed(2)}`,
      };

      if (useful) {
        usefulTasks.push(task);
      } else {
        wastefulTasks.push(task);
      }
    }

    // Escalation analysis
    const justifiedEscalations = escalationRecords.filter(e => e.actualBenefit && e.actualBenefit.length > 0).length;
    const unjustifiedEscalations = escalationRecords.filter(e => !e.actualBenefit).length;
    const totalEscalationCost = escalationRecords.reduce((sum, e) => sum + e.additionalCost, 0);

    const escalationLessons: string[] = [];
    if (justifiedEscalations > 0 && unjustifiedEscalations === 0) {
      escalationLessons.push("All escalations were justified — escalation criteria are well-calibrated.");
    } else if (unjustifiedEscalations > justifiedEscalations) {
      escalationLessons.push("Most escalations were unjustified — consider tightening escalation criteria.");
    }

    // Adversarial impact
    const adversarialChallenges = state.adversarialChallenges?.size ?? 0;
    const contradictionsFromAdversarial = Array.from(state.contradictions?.values() ?? []).filter(c =>
      c.description?.toLowerCase().includes("adversarial")
    ).length;
    let adversarialImpact: InvestigationPostmortem["adversarialImpact"] = "NONE";
    if (contradictionsFromAdversarial > 3) adversarialImpact = "CRITICAL";
    else if (contradictionsFromAdversarial > 1) adversarialImpact = "SIGNIFICANT";
    else if (adversarialChallenges > 0) adversarialImpact = "MODERATE";
    else if (adversarialChallenges > 0) adversarialImpact = "MINOR";

    // Director lessons
    const directorLessons: string[] = [];
    if (wastefulTasks.length > usefulTasks.length) {
      directorLessons.push("More wasteful tasks than useful ones — Director should be more selective.");
    }
    if (totalSpent > 0 && evidenceCount < 5) {
      directorLessons.push("Low evidence yield relative to spending — prioritize primary source research.");
    }
    const usefulSpent = usefulTasks.reduce((s, t) => s + t.cost, 0);
    const wastedSpent = wastefulTasks.reduce((s, t) => s + t.cost, 0);
    if (wastedSpent > totalSpent * 0.3) {
      directorLessons.push(`${Math.round(wastedSpent / totalSpent * 100)}% of spending was on low-value tasks.`);
    }

    // Recommendations
    const recommendations: string[] = [];
    if (wastefulTasks.length > 0) {
      recommendations.push(`Avoid task types similar to: ${wastefulTasks.slice(0, 3).map(t => t.description).join(", ")}`);
    }
    if (usefulTasks.length > 0) {
      recommendations.push(`Prioritize task types similar to: ${usefulTasks.slice(0, 3).map(t => t.description).join(", ")}`);
    }
    if (escalationLessons.length > 0) {
      recommendations.push(escalationLessons[0]);
    }

    return {
      id: `postmortem-${state.id}-${Date.now()}`,
      investigationId: state.id,
      question: state.question,
      completedAt: Date.now(),
      summary: `Investigation produced ${evidenceCount} evidence items at a cost of $${totalSpent.toFixed(2)}. ` +
        `${usefulTasks.length} useful tasks, ${wastefulTasks.length} wasteful tasks. ` +
        `Adversarial impact: ${adversarialImpact}.`,
      usefulTasks,
      wastefulTasks,
      unnecessaryAgents: this.findUnnecessaryAgents(costRecords),
      unnecessarySpending: wastedSpent,
      missedInvestigations: this.identifyMissedAreas(state),
      lateSkills: [],
      effectiveSkills: [],
      escalationAnalysis: {
        totalEscalations: escalationRecords.length,
        justifiedEscalations,
        unjustifiedEscalations,
        totalEscalationCost,
        lessons: escalationLessons,
      },
      adversarialImpact,
      directorLessons,
      skillCandidates: [],
      costEfficiency: {
        totalSpent,
        usefulSpent,
        wastedSpent,
        ratio: totalSpent > 0 ? usefulSpent / totalSpent : 0,
      },
      recommendations,
    };
  }

  private estimateTaskEvidence(taskLabel: string, state: InvestigationState): number {
    // Heuristic: count evidence that might relate to this task
    const label = taskLabel.toLowerCase();
    let count = 0;
    for (const evidence of state.evidence.values()) {
      const evText = (evidence.text || "").toLowerCase();
      if (label.split(/\s+/).some(w => w.length > 3 && evText.includes(w))) {
        count++;
      }
    }
    return count;
  }

  private findUnnecessaryAgents(costRecords: Array<{ agentRole: string; costUSD: number; taskLabel: string }>): string[] {
    const agentCosts: Map<string, number> = new Map();
    for (const r of costRecords) {
      agentCosts.set(r.agentRole, (agentCosts.get(r.agentRole) ?? 0) + r.costUSD);
    }
    // Flag agents with very low spending (likely didn't do much)
    return [...agentCosts.entries()]
      .filter(([, cost]) => cost < 0.01)
      .map(([role]) => role);
  }

  private identifyMissedAreas(state: InvestigationState): string[] {
    const missed: string[] = [];
    const openGaps = Array.from(state.informationGaps?.values() ?? []).filter(g => g.status === "OPEN");
    for (const gap of openGaps) {
      missed.push(`Unresolved information gap: ${gap.question}`);
    }
    return missed;
  }
}
