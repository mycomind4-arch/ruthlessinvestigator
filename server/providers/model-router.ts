// ─── COST / CAPABILITY AWARE MODEL ROUTER ─────────────────────────────────
// Chooses an execution model without taking investigative direction away from
// the Director. The router answers: "which model is sufficient for this task?"

import type { ModelDefinition, ModelRegistry, CostTier } from "./registry.js";

export type RoutingObjective = "CHEAPEST_SUFFICIENT" | "BEST_VALUE" | "MAXIMUM_RIGOR";
export type RoutingCapability = "extraction" | "research" | "comparison" | "adversarial" | "synthesis" | "long_context" | "reasoning";

export interface ModelRoutingRequest {
  objective: RoutingObjective;
  capabilities: RoutingCapability[];
  minimumContext?: number;
  minimumReasoning?: "standard" | "deep" | "maximum";
  budgetRemaining: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  excludeModels?: string[];
  preferredProvider?: string;
}

export interface ModelRoutingDecision {
  model: ModelDefinition;
  estimatedCost: number;
  score: number;
  reason: string;
  alternatives: Array<{ modelId: string; estimatedCost: number; reason: string }>;
}

const TIER_RANK: Record<CostTier, number> = { free: 0, cheap: 1, moderate: 2, expensive: 3 };
const REASONING_RANK = { standard: 1, deep: 2, maximum: 3 } as const;

function estimateCost(model: ModelDefinition, inputTokens: number, outputTokens: number): number {
  return ((model.inputCostPer1K ?? 0) * inputTokens + (model.outputCostPer1K ?? 0) * outputTokens) / 1000;
}

function capabilityFit(model: ModelDefinition, capabilities: RoutingCapability[]): number {
  const id = model.id.toLowerCase();
  let score = 0;
  for (const capability of capabilities) {
    if (capability === "long_context" && model.contextWindow >= 200_000) score += 2;
    if (capability === "reasoning" && (id.includes("claude") || id.includes("pro") || id.includes("gpt"))) score += 2;
    if (capability === "research" && (id.includes("claude") || id.includes("gemini"))) score += 1;
    if (capability === "adversarial" && (id.includes("claude") || id.includes("pro"))) score += 2;
    if (capability === "synthesis" && (id.includes("claude") || id.includes("gpt") || id.includes("pro"))) score += 1;
    if (capability === "extraction" && (model.costTier === "cheap" || model.costTier === "free")) score += 1;
    if (capability === "comparison" && (id.includes("claude") || id.includes("pro") || id.includes("mistral"))) score += 1;
  }
  return score;
}

export function routeModel(registry: ModelRegistry, request: ModelRoutingRequest): ModelRoutingDecision {
  const excluded = new Set(request.excludeModels ?? []);
  const minContext = request.minimumContext ?? 0;
  const minReasoning = request.minimumReasoning ?? "standard";
  const candidates = registry.listModels(m =>
    !excluded.has(m.id) &&
    m.contextWindow >= minContext &&
    (!request.preferredProvider || m.provider === request.preferredProvider)
  );

  const ranked = candidates.map(model => {
    const cost = estimateCost(model, request.estimatedInputTokens, request.estimatedOutputTokens);
    const fit = capabilityFit(model, request.capabilities);
    const budgetFit = cost <= request.budgetRemaining ? 10 : -100;
    const tier = TIER_RANK[model.costTier];
    let score = fit * 10 + budgetFit;

    if (request.objective === "CHEAPEST_SUFFICIENT") score += (3 - tier) * 12;
    if (request.objective === "BEST_VALUE") score += fit * 4 - cost * 100;
    if (request.objective === "MAXIMUM_RIGOR") score += tier * 8 + fit * 6;

    // Very small jobs should not pay for a premium model merely because it exists.
    if (request.estimatedInputTokens + request.estimatedOutputTokens < 4000 && tier >= 2 && request.objective !== "MAXIMUM_RIGOR") score -= 15;

    const contextPenalty = REASONING_RANK[minReasoning] >= 3 && model.contextWindow < 100_000 ? 20 : 0;
    score -= contextPenalty;
    return { model, cost, score };
  }).filter(x => x.cost <= request.budgetRemaining || request.budgetRemaining <= 0);

  if (ranked.length === 0) {
    throw new Error(`No model can satisfy the routing constraints within the remaining budget of $${request.budgetRemaining.toFixed(4)}`);
  }

  ranked.sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  const alternatives = ranked.slice(1, 4).map(x => ({
    modelId: x.model.id,
    estimatedCost: x.cost,
    reason: `score ${x.score.toFixed(1)} vs winner ${winner.score.toFixed(1)}`,
  }));

  return {
    model: winner.model,
    estimatedCost: winner.cost,
    score: winner.score,
    reason: `${request.objective}: selected ${winner.model.displayName}; estimated cost $${winner.cost.toFixed(4)}, capability fit ${capabilityFit(winner.model, request.capabilities)}.` ,
    alternatives,
  };
}

export { estimateCost };
