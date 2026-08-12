import { describe, expect, it } from "vitest";
import { InvestigationEngine } from "./engine.js";
import { ModelRegistry } from "../providers/registry.js";
import { MockProvider } from "../providers/mock.js";
import { ALL_ROLES } from "./agents.js";

describe("Ruthless Investigator MVP council", () => {
  it("defines a complete adversarial multi-role council", () => {
    expect(ALL_ROLES).toEqual([
      "DIRECTOR",
      "PREMISE_AUDITOR",
      "PRIMARY_SOURCE_RESEARCHER",
      "OSINT_RESEARCHER",
      "EVIDENCE_ANALYST",
      "SKEPTIC",
      "ALTERNATIVE_EXPLANATION",
      "SYNTHESIS",
      "ADVERSARIAL",
      "DEFENSE",
    ]);
  });

  it("can run a zero-cost investigation through the real engine path", async () => {
    const registry = new ModelRegistry();
    registry.registerProvider(new MockProvider());

    const engine = new InvestigationEngine(registry, {
      question: "Why are there so many data centers in the United States?",
      budgetUSD: 1,
      forceMock: true,
      mode: "STANDARD",
    });

    await engine.run();

    const state = engine.getState();
    expect(state.question).toContain("data centers");
    expect(state.hypotheses.size).toBeGreaterThan(0);
    expect(state.sources.size).toBeGreaterThan(0);
    expect(state.evidence.size).toBeGreaterThan(0);
    expect(state.assessment).not.toBeNull();
    expect(engine.getAgentRuns().length).toBeGreaterThan(0);
    expect(engine.getCostSummary().spent).toBe(0);
  }, 30000);
});
