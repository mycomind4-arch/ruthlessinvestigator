// ─── OPENROUTER PROVIDER ──────────────────────────────────────────────────
// Multi-model gateway. One API key → access to many model families.

import type { AIProvider, AIRequest, AIResponse, ProviderCapabilities } from "./types.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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
        costUSD: 0, // OpenRouter doesn't always return cost; computed by cost tracker from model registry
      },
      provider: this.id,
      model: request.model,
      durationMs,
      simulated: false,
    };
  }

  private tryParse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      // Try extracting JSON from markdown code blocks
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try { return JSON.parse(match[1]); } catch { /* fallthrough */ }
      }
      return undefined;
    }
  }
}
