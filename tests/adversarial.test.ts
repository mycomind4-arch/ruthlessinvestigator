// ─── TESTS: Adversarial Loop ──────────────────────────────────────────────
// Challenge → Defense → Update works.

import { describe, it, expect } from "vitest";
import { InvestigationEngine } from "../server/investigation/engine.js";
import { ModelRegistry } from "../server/providers/registry.js";
import { MockProvider } from "../server/providers/mock.js";

describe("Adversarial Loop", () => {
  it("Adversarial challenge → defense → hypothesis update", async () => {
    const registry = new ModelRegistry();
    registry.registerProvider(new MockProvider());

    const engine = new InvestigationEngine(registry, {
      question: "Why is the United States building so many data centers?",
      forceMock: true,
    });

    const state = await engine.run();

    // Should have created adversarial challenges
    const challenges = [...state.adversarialChallenges.values()];
    expect(challenges.length).toBeGreaterThan(0);

    for (const challenge of challenges) {
      expect(challenge.hypothesisId).toBeTruthy();
      expect(challenge.challenges.length).toBeGreaterThan(0);
    }

    // Should have Devil's evidence
    const devils = [...state.devilsEvidence.values()];
    expect(devils.length).toBeGreaterThan(0);
    for (const dev of devils) {
      expect(dev.hypothesisId).toBeTruthy();
      expect(dev.explanation).toBeTruthy();
      expect(dev.severity).toBeTruthy();
    }

    // Events should show adversarial activity
    const events = engine.getEvents();
    expect(events.some(e => e.type === "adversarial_round_started")).toBe(true);
    expect(events.some(e => e.type === "adversarial_challenge_created")).toBe(true);
    expect(events.some(e => e.type === "devils_evidence_found")).toBe(true);
  });

  it("Information gaps are created from adversarial review", async () => {
    const registry = new ModelRegistry();
    registry.registerProvider(new MockProvider());

    const engine = new InvestigationEngine(registry, {
      question: "Why is the United States building so many data centers?",
      forceMock: true,
    });

    const state = await engine.run();

    // Should have information gaps
    const gaps = [...state.informationGaps.values()];
    expect(gaps.length).toBeGreaterThan(0);

    for (const gap of gaps) {
      expect(gap.question).toBeTruthy();
      expect(gap.importance).toBeTruthy();
      expect(gap.expectedImpact).toBeTruthy();
    }

    // Should have research tasks
    const tasks = [...state.researchTasks.values()];
    expect(tasks.length).toBeGreaterThan(0);

    const events = engine.getEvents();
    expect(events.some(e => e.type === "information_gap_created")).toBe(true);
    expect(events.some(e => e.type === "research_task_created")).toBe(true);
  });

  it("Convergence does not claim certainty", async () => {
    const registry = new ModelRegistry();
    registry.registerProvider(new MockProvider());

    const engine = new InvestigationEngine(registry, {
      question: "Why is the United States building so many data centers?",
      forceMock: true,
    });

    const state = await engine.run();

    expect(["CONVERGENCE_REVIEW", "CONVERGED", "CONVERGENCE"]).toContain(state.phase);
    expect(state.assessment).not.toBeNull();

    // Assessment should acknowledge unknowns
    const assessment = state.assessment!;
    expect(assessment.majorUnknowns ?? assessment.majorAssumptions ?? []).toBeTruthy();

    // Should not claim 100% certainty
    const confidenceLevels = ["VERY_LOW", "LOW", "MODERATE", "HIGH", "VERY_HIGH"];
    expect(confidenceLevels).toContain(assessment.confidenceLevel);
  });
});
