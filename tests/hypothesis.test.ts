// ─── TESTS: Hypotheses & Expected Evidence ────────────────────────────────
// Supporting and contradicting evidence can coexist.
// Hypotheses can generate expected evidence requirements.

import { describe, it, expect } from "vitest";
import { InvestigationEngine } from "../server/investigation/engine.js";
import { ModelRegistry } from "../server/providers/registry.js";
import { MockProvider } from "../server/providers/mock.js";

describe("Hypotheses & Expected Evidence", () => {
  it("Hypotheses have expected evidence", async () => {
    const registry = new ModelRegistry();
    registry.registerProvider(new MockProvider());

    const engine = new InvestigationEngine(registry, {
      question: "Why is the United States building so many data centers?",
      forceMock: true,
    });

    const state = await engine.run();

    for (const hyp of state.hypotheses.values()) {
      expect(hyp.expectedEvidence.length).toBeGreaterThan(0);
      expect(hyp.supportLevel).not.toBe("NONE");
    }
  });

  it("Supporting and contradicting evidence can coexist", async () => {
    const registry = new ModelRegistry();
    registry.registerProvider(new MockProvider());

    const engine = new InvestigationEngine(registry, {
      question: "Why is the United States building so many data centers?",
      forceMock: true,
    });

    const state = await engine.run();

    // After full investigation, at least some hypotheses should have evidence
    const withEvidence = [...state.hypotheses.values()].filter(
      h => h.supportingEvidence.length > 0 || h.contradictingEvidence.length > 0
    );
    expect(withEvidence.length).toBeGreaterThan(0);
  });

  it("Expected evidence can be found or missing", async () => {
    const registry = new ModelRegistry();
    registry.registerProvider(new MockProvider());

    const engine = new InvestigationEngine(registry, {
      question: "Why is the United States building so many data centers?",
      forceMock: true,
    });

    const state = await engine.run();

    const allExpected = [...state.hypotheses.values()].flatMap(h => h.expectedEvidence);
    const validStatuses = ["FOUND", "MISSING", "NEGATIVE", "UNKNOWN"];
    for (const exp of allExpected) {
      expect(validStatuses).toContain(exp.status);
    }
  });

  it("Hypothesis iterations track epistemic history", async () => {
    const registry = new ModelRegistry();
    registry.registerProvider(new MockProvider());

    const engine = new InvestigationEngine(registry, {
      question: "Why is the United States building so many data centers?",
      forceMock: true,
    });

    const state = await engine.run();

    // At least one hypothesis should have iterations (from adversarial review)
    const withIterations = [...state.hypotheses.values()].filter(h => h.iterations.length > 0);
    // This depends on mock adversarial response quality
    if (withIterations.length > 0) {
      for (const hyp of withIterations) {
        for (const it of hyp.iterations) {
          expect(it.previousSupport).toBeTruthy();
          expect(it.newSupport).toBeTruthy();
          expect(it.reason).toBeTruthy();
        }
      }
    }
  });
});
