// ─── TESTS: Provider Abstraction ─────────────────────────────────────────
// A provider can be swapped without changing orchestration.

import { describe, it, expect } from "vitest";
import { MockProvider } from "../server/providers/mock.js";
import type { AIProvider, AIRequest, AIResponse } from "../server/providers/types.js";
import { ModelRegistry } from "../server/providers/registry.js";

describe("Provider Abstraction", () => {
  it("MockProvider implements AIProvider interface", () => {
    const provider: AIProvider = new MockProvider();
    expect(provider.id).toBe("mock");
    expect(provider.name).toBeTruthy();
    expect(typeof provider.generate).toBe("function");
    expect(typeof provider.capabilities).toBe("function");
  });

  it("MockProvider returns simulated responses", async () => {
    const provider = new MockProvider();
    const req: AIRequest = {
      prompt: "Analyze the premise of this question",
      model: "mock-deterministic",
    };
    const res = await provider.generate(req);
    expect(res.simulated).toBe(true);
    expect(res.text).toBeTruthy();
    expect(res.usage.inputTokens).toBeGreaterThan(0);
    expect(res.usage.costUSD).toBe(0);
    expect(res.provider).toBe("mock");
  });

  it("MockProvider can parse JSON in jsonMode", async () => {
    const provider = new MockProvider();
    const res = await provider.generate({
      prompt: "Generate hypotheses for investigation",
      model: "mock-deterministic",
      jsonMode: true,
    });
    expect(res.json).toBeDefined();
    expect(res.json).toHaveProperty("hypotheses");
  });

  it("Provider can be swapped without changing orchestration", async () => {
    const registry = new ModelRegistry();
    const mockProvider = new MockProvider();
    registry.registerProvider(mockProvider);

    // Resolve through registry — no vendor-specific code
    const { model, provider } = registry.resolve("mock/deterministic");
    expect(model.id).toBe("mock/deterministic");
    expect(provider.id).toBe("mock");

    const res = await provider.generate({
      prompt: "Test prompt",
      model: model.model,
    });
    expect(res.simulated).toBe(true);
  });

  it("Registry can list and filter models", () => {
    const registry = new ModelRegistry();
    const all = registry.listModels();
    expect(all.length).toBeGreaterThan(1);

    const mockModels = registry.listModels(m => m.provider === "mock");
    expect(mockModels.length).toBe(1);
    expect(mockModels[0].id).toBe("mock/deterministic");

    const cheap = registry.cheapest();
    expect(cheap.costTier).toBe("free");
  });
});
