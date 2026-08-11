// ─── MODEL ROUTER (Directive 05, Step 10) ─────────────────────────────────
// Routes tasks to the least expensive model likely to perform adequately.
// Supports escalation: cheap model → evaluate → escalate if insufficient.

import type { ModelDefinition, CostTier } from "../providers/registry.js";
import type { ModelRegistry } from "../providers/registry.js";

// ─── Task Complexity ──────────────────────────────────────────────────────

export type TaskComplexity =
  | "TRIVIAL"      // deterministic, no reasoning needed
  | "SIMPLE"       // basic extraction, classification
  | "MODERATE"     // comparison, summarization, source analysis
  | "COMPLEX"      // contradiction analysis, causal reasoning
  | "EXPERT"       // multi-source causal analysis, adversarial reasoning
  ;

export interface TaskProfile {
  complexity: TaskComplexity;
  reasoningRequirement: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";
  sourceAnalysisRequirement: "NONE" | "BASIC" | "DEEP" | "FORENSIC";
  contextRequirement: "SMALL" | "MEDIUM" | "LARGE" | "MASSIVE";
  requiredTools: string[];
  accuracyRequirement: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  budgetRemaining: number;
  latencyTolerance: "LOW" | "MEDIUM" | "HIGH";
  skillPreferredModels?: string[];
}

// ─── Complexity → Model Tier Mapping ─────────────────────────────────────

const COMPLEXITY_TO_TIER: Record<TaskComplexity, CostTier[]> = {
  TRIVIAL:   ["free", "cheap", "moderate", "expensive"],
  SIMPLE:    ["free", "cheap", "moderate", "expensive"],
  MODERATE:  ["cheap", "moderate", "expensive", "free"],
  COMPLEX:   ["moderate", "expensive", "cheap", "free"],
  EXPERT:    ["expensive", "moderate", "cheap", "free"],
};

// ─── Routing Decision ────────────────────────────────────────────────────

export interface RoutingDecision {
  modelId: string;
  model: ModelDefinition;
  reason: string;
  alternativesConsidered: RoutingAlternative[];
  estimatedCost: number;
  estimatedTokens: number;
}

export interface RoutingAlternative {
  modelId: string;
  displayName: string;
  costTier: CostTier;
  estimatedCost: number;
  rejected: boolean;
  rejectionReason?: string;
}

// ─── Escalation ──────────────────────────────────────────────────────────

export interface EscalationReason {
  type:
    | "CONFLICTING_RESULTS"
    | "LOW_CONFIDENCE"
    | "INSUFFICIENT_DETAIL"
    | "MISSING_INFORMATION"
    | "COMPLEX_REASONING_REQUIRED"
    | "ADVERSARIAL_CHALLENGE"
    | "USER_REQUEST";
  description: string;
  evidence: string;
}

export interface EscalationRecord {
  id: string;
  investigationId: string;
  taskId: string;
  reason: EscalationReason;
  previousModelId: string;
  previousModel: string;
  newModelId: string;
  newModel: string;
  expectedBenefit: string;
  additionalCost: number;
  actualBenefit: string | null;    // filled in after escalation completes
  timestamp: number;
  resolved: boolean;
}

// ─── Model Router ─────────────────────────────────────────────────────────

export class ModelRouter {
  private escalationHistory: EscalationRecord[] = [];

  constructor(private registry: ModelRegistry) {}

  /**
   * Route a task to the cheapest adequate model.
   */
  route(profile: TaskProfile): RoutingDecision {
    const tierOrder = COMPLEXITY_TO_TIER[profile.complexity];
    const alternatives: RoutingAlternative[] = [];
    let selected: ModelDefinition | null = null;
    let selectedReason = "";

    // If skill specifies preferred models, try those first
    if (profile.skillPreferredModels && profile.skillPreferredModels.length > 0) {
      for (const modelId of profile.skillPreferredModels) {
        const model = this.registry.getModel(modelId);
        if (model && model.enabled) {
          // Check budget
          const estCost = this.estimateCost(model, profile);
          if (estCost <= profile.budgetRemaining) {
            selected = model;
            selectedReason = `Preferred by skill, cost $${estCost.toFixed(4)} within budget`;
            // Add all other models as alternatives
            this.addAllAlternatives(alternatives, profile, model.id);
            break;
          } else {
            alternatives.push({
              modelId: model.id,
              displayName: model.displayName,
              costTier: model.costTier,
              estimatedCost: estCost,
              rejected: true,
              rejectionReason: "Exceeds remaining budget",
            });
          }
        }
      }
    }

    // If no preferred model selected, route by complexity
    if (!selected) {
      for (const tier of tierOrder) {
        const models = this.registry.listModels(m =>
          m.costTier === tier &&
          this.meetsRequirements(m, profile) &&
          this.estimateCost(m, profile) <= profile.budgetRemaining
        );

        if (models.length > 0) {
          // Pick cheapest within this tier
          models.sort((a, b) => this.estimateCost(a, profile) - this.estimateCost(b, profile));
          selected = models[0];
          selectedReason = `Cheapest ${tier} model for ${profile.complexity} task`;
          this.addAllAlternatives(alternatives, profile, selected.id);
          break;
        }

        // Add rejected alternatives from this tier
        const tierModels = this.registry.listModels(m => m.costTier === tier);
        for (const m of tierModels) {
          const cost = this.estimateCost(m, profile);
          if (cost > profile.budgetRemaining) {
            alternatives.push({
              modelId: m.id,
              displayName: m.displayName,
              costTier: m.costTier,
              estimatedCost: cost,
              rejected: true,
              rejectionReason: "Exceeds remaining budget",
            });
          } else if (!this.meetsRequirements(m, profile)) {
            alternatives.push({
              modelId: m.id,
              displayName: m.displayName,
              costTier: m.costTier,
              estimatedCost: cost,
              rejected: true,
              rejectionReason: "Does not meet requirements",
            });
          }
        }
      }
    }

    // Fallback: if nothing selected (budget too low), use free model
    if (!selected) {
      const free = this.registry.listModels(m => m.costTier === "free");
      if (free.length > 0) {
        selected = free[0];
        selectedReason = "Budget exhausted — using free model";
        this.addAllAlternatives(alternatives, profile, selected.id);
      }
    }

    if (!selected) {
      throw new Error("No models available for routing");
    }

    const estimatedCost = this.estimateCost(selected, profile);
    const estimatedTokens = this.estimateTokens(selected, profile);

    return {
      modelId: selected.id,
      model: selected,
      reason: selectedReason,
      alternativesConsidered: alternatives,
      estimatedCost,
      estimatedTokens,
    };
  }

  /**
   * Determine if escalation is justified.
   */
  shouldEscalate(
    currentModel: ModelDefinition,
    result: { confidence: number; issues: string[] },
    profile: TaskProfile,
  ): { escalate: boolean; reason: EscalationReason | null } {
    // Don't escalate if already using the strongest model
    if (currentModel.costTier === "expensive" || currentModel.costTier === "moderate") {
      return { escalate: false, reason: null };
    }

    // Escalate if confidence is low
    if (result.confidence < 0.4) {
      return {
        escalate: true,
        reason: {
          type: "LOW_CONFIDENCE",
          description: `Model confidence was ${result.confidence.toFixed(2)}, below threshold 0.40`,
          evidence: result.issues.join("; "),
        },
      };
    }

    // Escalate if there are conflicting results
    if (result.issues.some(i => i.toLowerCase().includes("conflict") || i.toLowerCase().includes("contradict"))) {
      return {
        escalate: true,
        reason: {
          type: "CONFLICTING_RESULTS",
          description: "Results contain conflicts or contradictions requiring stronger reasoning",
          evidence: result.issues.filter(i =>
            i.toLowerCase().includes("conflict") || i.toLowerCase().includes("contradict")
          ).join("; "),
        },
      };
    }

    // Escalate if missing information on a complex task
    if (result.issues.some(i => i.toLowerCase().includes("missing")) && profile.complexity === "COMPLEX") {
      return {
        escalate: true,
        reason: {
          type: "MISSING_INFORMATION",
          description: "Complex task produced missing information — stronger model may resolve",
          evidence: result.issues.filter(i => i.toLowerCase().includes("missing")).join("; "),
        },
      };
    }

    // Don't escalate if budget won't allow it
    const nextTier = this.getNextTier(currentModel.costTier);
    const nextModels = this.registry.listModels(m => m.costTier === nextTier);
    const nextCost = nextModels.length > 0 ? this.estimateCost(nextModels[0], profile) : 0;
    if (nextCost > profile.budgetRemaining) {
      return { escalate: false, reason: null };
    }

    return { escalate: false, reason: null };
  }

  /**
   * Get the next model to escalate to.
   */
  getEscalationModel(currentModel: ModelDefinition, profile: TaskProfile): ModelDefinition | null {
    const nextTier = this.getNextTier(currentModel.costTier);
    const candidates = this.registry.listModels(m =>
      m.costTier === nextTier &&
      this.estimateCost(m, profile) <= profile.budgetRemaining
    );

    if (candidates.length === 0) return null;

    // Pick cheapest of the next tier
    candidates.sort((a, b) => this.estimateCost(a, profile) - this.estimateCost(b, profile));
    return candidates[0];
  }

  /**
   * Record an escalation.
   */
  recordEscalation(record: Omit<EscalationRecord, "id" | "timestamp" | "resolved">): EscalationRecord {
    const full: EscalationRecord = {
      ...record,
      id: `esc-${this.escalationHistory.length + 1}`,
      timestamp: Date.now(),
      resolved: false,
    };
    this.escalationHistory.push(full);
    return full;
  }

  /**
   * Resolve an escalation with the actual benefit observed.
   */
  resolveEscalation(id: string, actualBenefit: string): void {
    const record = this.escalationHistory.find(e => e.id === id);
    if (record) {
      record.actualBenefit = actualBenefit;
      record.resolved = true;
    }
  }

  getEscalationHistory(): EscalationRecord[] {
    return [...this.escalationHistory];
  }

  getEscalationsForInvestigation(investigationId: string): EscalationRecord[] {
    return this.escalationHistory.filter(e => e.investigationId === investigationId);
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private getNextTier(tier: CostTier): CostTier {
    const order: CostTier[] = ["free", "cheap", "moderate", "expensive"];
    const idx = order.indexOf(tier);
    return idx < order.length - 1 ? order[idx + 1] : tier;
  }

  private meetsRequirements(model: ModelDefinition, profile: TaskProfile): boolean {
    // Check context window
    const contextNeeded: Record<string, number> = {
      SMALL: 4_000,
      MEDIUM: 32_000,
      LARGE: 128_000,
      MASSIVE: 500_000,
    };
    const needed = contextNeeded[profile.contextRequirement] ?? 4_000;
    if (model.contextWindow < needed) return false;

    return true;
  }

  private estimateCost(model: ModelDefinition, profile: TaskProfile): number {
    const tokens = this.estimateTokens(model, profile);
    const inCost = (model.inputCostPer1K ?? 0) * (tokens * 0.7) / 1000;
    const outCost = (model.outputCostPer1K ?? 0) * (tokens * 0.3) / 1000;
    return inCost + outCost;
  }

  private estimateTokens(model: ModelDefinition, profile: TaskProfile): number {
    // Rough estimates based on complexity
    const baseTokens: Record<TaskComplexity, number> = {
      TRIVIAL: 200,
      SIMPLE: 500,
      MODERATE: 1500,
      COMPLEX: 3000,
      EXPERT: 6000,
    };
    return baseTokens[profile.complexity];
  }

  private addAllAlternatives(
    alternatives: RoutingAlternative[],
    profile: TaskProfile,
    selectedId: string,
  ): void {
    const all = this.registry.listModels();
    for (const m of all) {
      if (m.id === selectedId) continue;
      if (alternatives.some(a => a.modelId === m.id)) continue;
      alternatives.push({
        modelId: m.id,
        displayName: m.displayName,
        costTier: m.costTier,
        estimatedCost: this.estimateCost(m, profile),
        rejected: true,
        rejectionReason: "Not selected by routing",
      });
    }
  }
}

// ─── Task Profiler ────────────────────────────────────────────────────────
// Profiles a task to determine its complexity and requirements.

export class TaskProfiler {
  /**
   * Profile a task based on its description and type.
   */
  static profile(
    taskType: string,
    taskDescription: string,
    budgetRemaining: number,
    options?: {
      requiredTools?: string[];
      accuracyRequirement?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      skillPreferredModels?: string[];
    },
  ): TaskProfile {
    const complexity = this.assessComplexity(taskType, taskDescription);
    const reasoning = this.assessReasoning(taskType, taskDescription);
    const sourceAnalysis = this.assessSourceAnalysis(taskType, taskDescription);
    const context = this.assessContext(taskType, taskDescription);

    return {
      complexity,
      reasoningRequirement: reasoning,
      sourceAnalysisRequirement: sourceAnalysis,
      contextRequirement: context,
      requiredTools: options?.requiredTools ?? [],
      accuracyRequirement: options?.accuracyRequirement ?? "MEDIUM",
      budgetRemaining,
      latencyTolerance: "MEDIUM",
      skillPreferredModels: options?.skillPreferredModels,
    };
  }

  private static assessComplexity(taskType: string, desc: string): TaskComplexity {
    const d = desc.toLowerCase();
    // Check for expert-level descriptions first
    if (d.includes("multi-source") || d.includes("causal chain") || d.includes("adversarial")) return "EXPERT";
    if (taskType === "EXTRACT" || taskType === "CLASSIFY") return "SIMPLE";
    if (taskType === "SUMMARIZE" || taskType === "COMPARE") return "MODERATE";
    if (taskType === "SEARCH_SOURCES" || taskType === "VERIFY_CLAIM") return "MODERATE";
    if (taskType === "CONTRADICTION" || taskType === "CAUSAL_ANALYSIS") return "COMPLEX";
    if (taskType === "ADVERSARIAL" || taskType === "SYNTHESIZE") return "COMPLEX";
    return "MODERATE";
  }

  private static assessReasoning(taskType: string, desc: string): TaskProfile["reasoningRequirement"] {
    const d = desc.toLowerCase();
    if (d.includes("causal") || d.includes("adversarial") || d.includes("contradiction")) return "HIGH";
    if (d.includes("compare") || d.includes("analyze") || d.includes("synthesize")) return "MEDIUM";
    if (d.includes("extract") || d.includes("classify")) return "LOW";
    return "MEDIUM";
  }

  private static assessSourceAnalysis(taskType: string, desc: string): TaskProfile["sourceAnalysisRequirement"] {
    const d = desc.toLowerCase();
    if (d.includes("primary source") || d.includes("source lineage")) return "DEEP";
    if (d.includes("source") || d.includes("verify")) return "BASIC";
    if (taskType === "SEARCH_SOURCES" || taskType === "VERIFY_CLAIM") return "DEEP";
    return "BASIC";
  }

  private static assessContext(taskType: string, desc: string): TaskProfile["contextRequirement"] {
    const d = desc.toLowerCase();
    if (d.includes("multi-source") || d.includes("comprehensive") || d.includes("all evidence")) return "LARGE";
    if (d.includes("summarize") || d.includes("synthesis")) return "MEDIUM";
    return "SMALL";
  }
}
