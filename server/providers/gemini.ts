// ─── GOOGLE GEMINI PROVIDER ───────────────────────────────────────────────
// Direct Gemini API (not via OpenRouter).
// Directive 05: Supports reasoning depth via thinkingBudget configuration.

import type { AIProvider, AIRequest, AIResponse, ProviderCapabilities } from "./types.js";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly name = "Google Gemini (Direct)";
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

    const endpoint = `${GEMINI_URL}/${request.model}:generateContent?key=${this.apiKey}`;

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    const systemInstruction = request.systemPrompt
      ? { parts: [{ text: request.systemPrompt }] }
      : undefined;

    contents.push({ role: "user", parts: [{ text: request.prompt }] });

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
    };

    if (request.jsonMode) {
      generationConfig.responseMimeType = "application/json";
    }

    // ─── Directive 05: Reasoning depth via thinkingBudget ──────────────
    let reasoningEffort: string | undefined;
    if (request.reasoning) {
      const thinkingBudgetMap: Record<string, number> = {
        standard: 0,      // thinking off
        deep: 8192,       // moderate thinking
        maximum: 24576,   // maximum thinking
      };
      const budget = request.reasoning.budgetTokens ?? thinkingBudgetMap[request.reasoning.effort];

      // Gemini 2.5 models support thinkingConfig
      if (/gemini-2\.5|gemini-2\.0-flash-thinking/i.test(request.model)) {
        generationConfig.thinkingConfig = {
          thinkingBudget: budget,
          includeThoughts: false, // never expose chain-of-thought
        };
        reasoningEffort = request.reasoning.effort;
      }
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig,
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini error ${res.status}: ${errText}`);
    }

    const data = await res.json() as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
        finishReason?: string;
      }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; thoughtsTokenCount?: number };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const durationMs = Date.now() - start;

    return {
      text,
      json: request.jsonMode ? this.tryParse(text) : undefined,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0),
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
