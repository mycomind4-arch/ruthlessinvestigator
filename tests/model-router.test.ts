import { describe, expect, it } from "vitest";
import { ModelRegistry } from "../server/providers/registry.js";
import { estimateCost, routeModel } from "../server/providers/model-router.js";

describe("model router", () => {
  it("prefers a cheap sufficient model for extraction", () => {
    const registry = new ModelRegistry();
    const decision = routeModel(registry, {
      objective: "CHEAPEST_SUFFICIENT",
      capabilities: ["extraction"],
      budgetRemaining: 1,
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 500,
    });

    expect(decision.model.costTier).toBe("free");
    expect(decision.estimatedCost).toBe(0);
  });

  it("can select a stronger model when maximum rigor is requested", () => {
    const registry = new ModelRegistry();
    const decision = routeModel(registry, {
      objective: "MAXIMUM_RIGOR",
      capabilities: ["reasoning", "adversarial", "long_context"],
      minimumContext: 100_000,
      minimumReasoning: "maximum",
      budgetRemaining: 1,
      estimatedInputTokens: 20_000,
      estimatedOutputTokens: 8_000,
    });

    expect(decision.model.contextWindow).toBeGreaterThanOrEqual(100_000);
    expect(decision.estimatedCost).toBeLessThanOrEqual(1);
  });

  it("never routes to a model whose estimated cost exceeds budget", () => {
    const registry = new ModelRegistry();
    const decision = routeModel(registry, {
      objective: "BEST_VALUE",
      capabilities: ["research"],
      budgetRemaining: 0.0002,
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 1000,
    });

    expect(decision.estimatedCost).toBeLessThanOrEqual(0.0002);
  });

  it("respects model exclusions", () => {
    const registry = new ModelRegistry();
    const decision = routeModel(registry, {
      objective: "CHEAPEST_SUFFICIENT",
      capabilities: ["extraction"],
      budgetRemaining: 1,
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 500,
      excludeModels: ["mock/deterministic"],
    });

    expect(decision.model.id).not.toBe("mock/deterministic");
  });

  it("estimates provider cost from registry pricing", () => {
    const registry = new ModelRegistry();
    const model = registry.getModel("openrouter/openai/gpt-4o-mini")!;
    expect(estimateCost(model, 1000, 1000)).toBeCloseTo(0.00075);
  });
});
