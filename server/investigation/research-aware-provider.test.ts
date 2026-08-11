import { describe, expect, it } from "vitest";
import { ResearchAwareProvider } from "./research-aware-provider.js";
import type { AIProvider, AIRequest } from "../providers/types.js";

const capabilities = { streaming: false, maxOutputTokens: 1000, supportsSystemPrompt: true, supportsJSON: true, supportsTools: false, supportsReasoning: false, maxReasoningEffort: "standard" as const };

function provider(): AIProvider {
  return {
    id: "test-provider",
    name: "Test Provider",
    capabilities: () => capabilities,
    generate: async (request: AIRequest) => ({
      text: request.prompt,
      usage: { inputTokens: 1, outputTokens: 1, costUSD: 0 },
      provider: "test-provider",
      model: request.model,
      durationMs: 1,
      simulated: false,
    }),
  };
}

describe("ResearchAwareProvider", () => {
  it("passes through non-research roles", async () => {
    const wrapped = new ResearchAwareProvider(provider());
    const result = await wrapped.generate({ model: "test", taskLabel: "SYNTHESIS", prompt: "hello" });
    expect(result.text).toBe("hello");
  });

  it("passes through when network research is disabled", async () => {
    const previous = process.env.AGENT_NETWORK_RESEARCH;
    process.env.AGENT_NETWORK_RESEARCH = "false";
    const wrapped = new ResearchAwareProvider(provider());
    const result = await wrapped.generate({ model: "test", taskLabel: "OSINT_RESEARCHER", prompt: "research this" });
    expect(result.text).toBe("research this");
    if (previous === undefined) delete process.env.AGENT_NETWORK_RESEARCH; else process.env.AGENT_NETWORK_RESEARCH = previous;
  });
});
