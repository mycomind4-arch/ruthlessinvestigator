// ─── OPENROUTER PROVIDER ──────────────────────────────────────────────────
// Multi-model gateway. One API key → access to many model families.
// Directive 05: Supports reasoning depth via provider-specific parameters.

import type { AIProvider, AIRequest, AIResponse, ProviderCapabilities } from "./types.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Models that support OpenRouter reasoning_effort parameter
const REASONING_MODELS = new Set([
  "openai/o1", "openai/o1-mini", "openai/o1-pro", "openai/o3", "openai/o3-mini",
  "openai/o4-mini", "anthropic/claude-3.5-sonnet", "anthropic/claude-3.5-opus",
  "anthropic/claude-sonnet-4", "anthropic/claude-opus-4",
]);

export class OpenRouterProvider implements AIProvider {
  readonly id = "openrouter";
  readonly name = "OpenRouter";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  capabilities(): ProviderCapabilities {
    return {
      streaming: false,
      maxOutputTokens: 8192,
      supportsSystemPrompt: true,
      supportsJSON: true,
      supportsTools: true,
      supportsReasoning: true,
      maxReasoningEffort: "maximum",
    };
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const start = Date.now();

    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: request.prompt });

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
    };

    if (request.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    // ─── Directive 05: Reasoning depth ────────────────────────────────
    let reasoningEffort: string | undefined;
    if (request.reasoning && REASONING_MODELS.has(request.model)) {
      const effortMap: Record<string, string> = {
        standard: "low",
        deep: "medium",
        maximum: "high",
      };
      reasoningEffort = effortMap[request.reasoning.effort];
      body.reasoning_effort = reasoningEffort;

      // Increase max tokens for deeper reasoning
      if (request.reasoning.effort !== "standard") {
        body.max_tokens = Math.max(body.max_tokens as number, 8192);
      }
    }

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/mycomind4-arch/ruthlessinvestigator",
        "X-Title": "Ruthless Investigator",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${errText}`);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const text = data.choices[0]?.message?.content ?? "";
    const durationMs = Date.now() - start;

    return {
      text,
      json: request.jsonMode ? this.tryParse(text) : undefined,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        costUSD: 0,
      },
      provider: this.id,
      model: request.model,
      durationMs,
      simulated: false,
      reasoningEffort,
    };
  }

  private tryParse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try { return JSON.parse(match[1]); } catch { /* fallthrough */ }
      }
      return undefined;
    }
  }
}
