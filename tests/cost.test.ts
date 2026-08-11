// ─── TESTS: Budget Enforcement ────────────────────────────────────────────
// The system stops or pauses when the configured budget is reached.

import { describe, it, expect } from "vitest";
import { CostTracker } from "../server/investigation/cost-tracker.js";
import type { AIResponse } from "../server/providers/types.js";
import type { ModelDefinition } from "../server/providers/registry.js";

describe("Cost Tracker & Budget Enforcement", () => {
  const mockModel: ModelDefinition = {
    id: "test", provider: "mock", model: "test-model", displayName: "Test",
    costTier: "cheap", contextWindow: 1000, inputCostPer1K: 0.001, outputCostPer1K: 0.002, enabled: true,
  };

  function makeResponse(cost: number, simulated = false): AIResponse {
    return {
      text: "response", json: undefined,
      usage: { inputTokens: 1000, outputTokens: 500, costUSD: cost },
      provider: "test", model: "test-model", durationMs: 100, simulated,
    };
  }

  it("Tracks cost across multiple calls", () => {
    const tracker = new CostTracker(10);
    tracker.record(makeResponse(1.5), mockModel, "DIRECTOR", "task1");
    tracker.record(makeResponse(0.5), mockModel, "SKEPTIC", "task2");

    expect(tracker.getSpent()).toBe(2.0);
    expect(tracker.getRemaining()).toBe(8.0);
    expect(tracker.getSummary().calls).toBe(2);
  });

  it("Detects budget warning at 80%", () => {
    const tracker = new CostTracker(10);
    tracker.record(makeResponse(8.0), mockModel, "DIRECTOR", "task1");

    expect(tracker.isBudgetWarning()).toBe(true);
    expect(tracker.isBudgetExceeded()).toBe(false);
  });

  it("Detects budget exceeded", () => {
    const tracker = new CostTracker(10);
    tracker.record(makeResponse(10.0), mockModel, "DIRECTOR", "task1");

    expect(tracker.isBudgetExceeded()).toBe(true);
    expect(tracker.getRemaining()).toBe(0);
  });

  it("Records cost details for observability", () => {
    const tracker = new CostTracker(10);
    const record = tracker.record(makeResponse(0.05), mockModel, "SKEPTIC", "challenge");

    expect(record.agentRole).toBe("SKEPTIC");
    expect(record.taskLabel).toBe("challenge");
    expect(record.costUSD).toBe(0.05);
    expect(record.inputTokens).toBe(1000);
    expect(record.outputTokens).toBe(500);
  });

  it("Computes cost from model rates when provider returns 0", () => {
    const tracker = new CostTracker(10);
    const modelWithRates: ModelDefinition = {
      ...mockModel,
      inputCostPer1K: 0.003,
      outputCostPer1K: 0.015,
    };

    // Response with costUSD = 0 but not simulated → should compute from rates
    const res = makeResponse(0, false);
    res.usage = { inputTokens: 1000, outputTokens: 500, costUSD: 0 };
    const record = tracker.record(res, modelWithRates, "TEST", "test");

    // 0.003 * 1 + 0.015 * 0.5 = 0.003 + 0.0075 = 0.0105
    expect(record.costUSD).toBeCloseTo(0.0105, 4);
  });
});
