// ─── MODEL REGISTRY ──────────────────────────────────────────────────────
// Central source of truth for available models.  No model ids are hard-coded
// in the orchestration layer — everything flows through here.

import type { AIProvider } from "./types.js";

export type CostTier = "free" | "cheap" | "moderate" | "expensive";

export interface ModelDefinition {
  id: string;            // unique registry id, e.g. "openrouter/anthropic/claude-3.5-sonnet"
  provider: string;      // provider id: "openrouter" | "gemini" | "mock"
  model: string;         // vendor model id passed to the provider
  displayName: string;    // human-readable
  costTier: CostTier;
  contextWindow: number;
  inputCostPer1K?: number;   // USD per 1K input tokens
  outputCostPer1K?: number;   // USD per 1K output tokens
  enabled: boolean;
}

// ─── Built-in registry ───────────────────────────────────────────────────

const BUILT_IN: ModelDefinition[] = [
  // ── Mock ────────────────────────────────────────────────────────────
  {
    id: "mock/deterministic",
    provider: "mock",
    model: "mock-deterministic",
    displayName: "Mock (Deterministic)",
    costTier: "free",
    contextWindow: 128_000,
    inputCostPer1K: 0,
    outputCostPer1K: 0,
    enabled: true,
  },

  // ── OpenRouter models ───────────────────────────────────────────────
  {
    id: "openrouter/anthropic/claude-3.5-sonnet",
    provider: "openrouter",
    model: "anthropic/claude-3.5-sonnet",
    displayName: "Claude 3.5 Sonnet (OpenRouter)",
    costTier: "moderate",
    contextWindow: 200_000,
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.015,
    enabled: true,
  },
  {
    id: "openrouter/openai/gpt-4o-mini",
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    displayName: "GPT-4o mini (OpenRouter)",
    costTier: "cheap",
    contextWindow: 128_000,
    inputCostPer1K: 0.00015,
    outputCostPer1K: 0.0006,
    enabled: true,
  },
  {
    id: "openrouter/google/gemini-2.0-flash-001",
    provider: "openrouter",
    model: "google/gemini-2.0-flash-001",
    displayName: "Gemini 2.0 Flash (OpenRouter)",
    costTier: "cheap",
    contextWindow: 1_000_000,
    inputCostPer1K: 0.0001,
    outputCostPer1K: 0.0004,
    enabled: true,
  },
  {
    id: "openrouter/mistral/mistral-large",
    provider: "openrouter",
    model: "mistralai/mistral-large",
    displayName: "Mistral Large (OpenRouter)",
    costTier: "moderate",
    contextWindow: 128_000,
    inputCostPer1K: 0.002,
    outputCostPer1K: 0.006,
    enabled: true,
  },
  {
    id: "openrouter/meta/llama-3.3-70b-instruct",
    provider: "openrouter",
    model: "meta-llama/llama-3.3-70b-instruct",
    displayName: "Llama 3.3 70B (OpenRouter)",
    costTier: "cheap",
    contextWindow: 128_000,
    inputCostPer1K: 0.00023,
    outputCostPer1K: 0.0004,
    enabled: true,
  },

  // ── Direct Gemini ───────────────────────────────────────────────────
  {
    id: "gemini/gemini-2.0-flash",
    provider: "gemini",
    model: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash (Direct)",
    costTier: "cheap",
    contextWindow: 1_000_000,
    inputCostPer1K: 0.0001,
    outputCostPer1K: 0.0004,
    enabled: true,
  },
  {
    id: "gemini/gemini-2.5-pro",
    provider: "gemini",
    model: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro (Direct)",
    costTier: "moderate",
    contextWindow: 2_000_000,
    inputCostPer1K: 0.00125,
    outputCostPer1K: 0.005,
    enabled: true,
  },
];

// ─── Registry class ──────────────────────────────────────────────────────

export class ModelRegistry {
  private models: Map<string, ModelDefinition> = new Map();
  private providers: Map<string, AIProvider> = new Map();

  constructor(models: ModelDefinition[] = BUILT_IN) {
    for (const m of models) this.models.set(m.id, m);
  }

  registerProvider(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  getModel(id: string): ModelDefinition | undefined {
    return this.models.get(id);
  }

  listModels(filterFn?: (m: ModelDefinition) => boolean): ModelDefinition[] {
    const all = [...this.models.values()].filter((m) => m.enabled);
    return filterFn ? all.filter(filterFn) : all;
  }

  getProvider(providerId: string): AIProvider | undefined {
    return this.providers.get(providerId);
  }

  /** Resolve a model id to its provider instance */
  resolve(modelId: string): { model: ModelDefinition; provider: AIProvider } {
    const model = this.models.get(modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    const provider = this.providers.get(model.provider);
    if (!provider) throw new Error(`No provider registered for: ${model.provider}`);
    return { model, provider };
  }

  /** Pick a model by cost tier (cheapest first) */
  cheapest(providerId?: string): ModelDefinition {
    const tierOrder: CostTier[] = ["free", "cheap", "moderate", "expensive"];
    const candidates = this.listModels(
      (m) => !providerId || m.provider === providerId
    );
    candidates.sort(
      (a, b) =>
        tierOrder.indexOf(a.costTier) - tierOrder.indexOf(b.costTier)
    );
    return candidates[0];
  }
}
