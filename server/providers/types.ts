// ─── AI PROVIDER ABSTRACTION ──────────────────────────────────────────────
// The entire investigation system talks to AI models through this interface.
// No vendor-specific imports leak into the orchestration layer.

import type { ReasoningConfig } from "../investigation/persistence-types.js";

export interface ProviderCapabilities {
  streaming: boolean;
  maxOutputTokens: number;
  supportsSystemPrompt: boolean;
  supportsJSON: boolean;
  supportsTools: boolean;
  supportsReasoning: boolean; // Directive 05: reasoning depth support
  maxReasoningEffort: "standard" | "deep" | "maximum";
}

export interface AIRequest {
  /** System-level instruction / role framing */
  systemPrompt?: string;
  /** User message / task prompt */
  prompt: string;
  /** Target model id within this provider */
  model: string;
  /** Max output tokens (provider may cap) */
  maxTokens?: number;
  /** Temperature 0–2 */
  temperature?: number;
  /** If true, provider should attempt JSON-mode and we parse defensively */
  jsonMode?: boolean;
  /** Unique label for cost tracking */
  taskLabel?: string;
  /** Directive 05: Reasoning depth configuration */
  reasoning?: ReasoningConfig;
}

export interface AIResponse {
  /** Generated text */
  text: string;
  /** Parsed JSON if jsonMode was requested and parse succeeded */
  json?: unknown;
  /** Token & cost accounting */
  usage: TokenUsage;
  /** Provider id for traceability */
  provider: string;
  /** Model id that was actually used */
  model: string;
  /** Wall-clock duration in ms */
  durationMs: number;
  /** True if the response is simulated (MockProvider) */
  simulated: boolean;
  /** Reasoning depth that was actually used */
  reasoningEffort?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost in USD */
  costUSD: number;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  generate(request: AIRequest): Promise<AIResponse>;
  capabilities(): ProviderCapabilities;
}
