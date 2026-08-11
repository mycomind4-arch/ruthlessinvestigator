// ─── MODEL REGISTRY ──────────────────────────────────────────────────────
// Central source of truth for available models. Research-capable agents
// receive a controlled network-aware provider wrapper.

import type { AIProvider } from "./types.js";
import { ResearchAwareProvider } from "../investigation/research-aware-provider.js";
import { globalToolPermissions } from "../investigation/tool-permissions.js";

export type CostTier = "free" | "cheap" | "moderate" | "expensive";
export interface ModelDefinition { id: string; provider: string; model: string; displayName: string; costTier: CostTier; contextWindow: number; inputCostPer1K?: number; outputCostPer1K?: number; enabled: boolean; }

const BUILT_IN: ModelDefinition[] = [
  { id: "mock/deterministic", provider: "mock", model: "mock-deterministic", displayName: "Mock (Deterministic)", costTier: "free", contextWindow: 128000, inputCostPer1K: 0, outputCostPer1K: 0, enabled: true },
  { id: "openrouter/anthropic/claude-3.5-sonnet", provider: "openrouter", model: "anthropic/claude-3.5-sonnet", displayName: "Claude 3.5 Sonnet (OpenRouter)", costTier: "moderate", contextWindow: 200000, inputCostPer1K: 0.003, outputCostPer1K: 0.015, enabled: true },
  { id: "openrouter/openai/gpt-4o-mini", provider: "openrouter", model: "openai/gpt-4o-mini", displayName: "GPT-4o mini (OpenRouter)", costTier: "cheap", contextWindow: 128000, inputCostPer1K: 0.00015, outputCostPer1K: 0.0006, enabled: true },
  { id: "openrouter/google/gemini-2.0-flash-001", provider: "openrouter", model: "google/gemini-2.0-flash-001", displayName: "Gemini 2.0 Flash (OpenRouter)", costTier: "cheap", contextWindow: 1000000, inputCostPer1K: 0.0001, outputCostPer1K: 0.0004, enabled: true },
  { id: "openrouter/mistral/mistral-large", provider: "openrouter", model: "mistralai/mistral-large", displayName: "Mistral Large (OpenRouter)", costTier: "moderate", contextWindow: 128000, inputCostPer1K: 0.002, outputCostPer1K: 0.006, enabled: true },
  { id: "openrouter/meta/llama-3.3-70b-instruct", provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct", displayName: "Llama 3.3 70B (OpenRouter)", costTier: "cheap", contextWindow: 128000, inputCostPer1K: 0.00023, outputCostPer1K: 0.0004, enabled: true },
  { id: "gemini/gemini-2.0-flash", provider: "gemini", model: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash (Direct)", costTier: "cheap", contextWindow: 1000000, inputCostPer1K: 0.0001, outputCostPer1K: 0.0004, enabled: true },
  { id: "gemini/gemini-2.5-pro", provider: "gemini", model: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro (Direct)", costTier: "moderate", contextWindow: 2000000, inputCostPer1K: 0.00125, outputCostPer1K: 0.005, enabled: true },
];

const RESEARCH_ROLES = ["PRIMARY_SOURCE_RESEARCHER", "OSINT_RESEARCHER", "ADVERSARIAL", "ALTERNATIVE_EXPLANATION"] as const;
function installDefaultResearchPermissions(): void {
  for (const role of RESEARCH_ROLES) for (const toolId of ["web_search", "web_fetch"] as const) {
    if (!globalToolPermissions.list(role).some(g => g.toolId === toolId && g.scope === "PUBLIC_WEB" && g.permission === "ALLOWED")) {
      globalToolPermissions.grant({ agentId: role, toolId, permission: "ALLOWED", scope: "PUBLIC_WEB", reason: "Built-in controlled research capability" });
    }
  }
}

export class ModelRegistry {
  private models = new Map<string, ModelDefinition>();
  private providers = new Map<string, AIProvider>();
  constructor(models: ModelDefinition[] = BUILT_IN) { for (const m of models) this.models.set(m.id, m); installDefaultResearchPermissions(); }
  registerProvider(provider: AIProvider): void { this.providers.set(provider.id, provider); }
  getModel(id: string): ModelDefinition | undefined { return this.models.get(id); }
  listModels(filterFn?: (m: ModelDefinition) => boolean): ModelDefinition[] { const all = [...this.models.values()].filter(m => m.enabled); return filterFn ? all.filter(filterFn) : all; }
  getProvider(providerId: string): AIProvider | undefined { return this.providers.get(providerId); }
  resolve(modelId: string): { model: ModelDefinition; provider: AIProvider } {
    const model = this.models.get(modelId); if (!model) throw new Error(`Unknown model: ${modelId}`);
    const provider = this.providers.get(model.provider); if (!provider) throw new Error(`No provider registered for: ${model.provider}`);
    return { model, provider: model.provider === "mock" ? provider : new ResearchAwareProvider(provider) };
  }
  cheapest(providerId?: string): ModelDefinition {
    const order: CostTier[] = ["free", "cheap", "moderate", "expensive"];
    const candidates = this.listModels(m => !providerId || m.provider === providerId);
    candidates.sort((a, b) => order.indexOf(a.costTier) - order.indexOf(b.costTier));
    return candidates[0];
  }
}
