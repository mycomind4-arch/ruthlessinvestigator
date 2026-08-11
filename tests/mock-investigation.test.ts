// ─── TESTS: Mock Mode Full Investigation ──────────────────────────────────
// The entire investigation can run deterministically without API keys.

import { describe, it, expect } from "vitest";
import { InvestigationEngine } from "../server/investigation/engine.js";
import { ModelRegistry } from "../server/providers/registry.js";
import { MockProvider } from "../server/providers/mock.js";

describe("Mock Mode Investigation", () => {
  it("Runs a complete investigation with MockProvider only", async () => {
    const registry = new ModelRegistry();
    registry.registerProvider(new MockProvider());

    const engine = new InvestigationEngine(registry, {
      question: "Why is the United States building so many data centers?",
      forceMock: true,
      budgetUSD: 10,
    });

    const state = await engine.run();

    // Should have completed
    expect(state.phase).toBe("CONVERGENCE");

    // Should have generated hypotheses
    expect(state.hypotheses.size).toBeGreaterThan(0);

    // Should have collected sources
    expect(state.sources.size).toBeGreaterThan(0);

    // Should have extracted evidence
    expect(state.evidence.size).toBeGreaterThan(0);

    // Should have created claims
    expect(state.claims.size).toBeGreaterThan(0);

    // Should have an assessment
    expect(state.assessment).not.toBeNull();

    // All agent runs should be simulated
    const runs = engine.getAgentRuns();
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every(r => r.simulated)).toBe(true);

    // Cost should be zero (mock provider)
    const cost = engine.getCostSummary();
    expect(cost.spent).toBe(0);
  });

  it("Generates events for every phase", async () => {
    const registry = new ModelRegistry();
    registry.registerProvider(new MockProvider());

    const engine = new InvestigationEngine(registry, {
      question: "Test question",
      forceMock: true,
    });

    await engine.run();

    const events = engine.getEvents();

    // Should have investigation_started event
    expect(events.some(e => e.type === "investigation_started")).toBe(true);

    // Should have phase_changed events
    const phaseChanges = events.filter(e => e.type === "phase_changed");
    expect(phaseChanges.length).toBeGreaterThan(5); // Multiple phases

    // Should have premise_audit_started
    expect(events.some(e => e.type === "premise_audit_started")).toBe(true);

    // Should have hypothesis_created
    expect(events.some(e => e.type === "hypothesis_created")).toBe(true);

    // Should have agent events
    expect(events.some(e => e.type === "agent_started")).toBe(true);
    expect(events.some(e => e.type === "agent_completed")).toBe(true);

    // Should have adversarial events
    expect(events.some(e => e.type === "adversarial_round_started")).toBe(true);

    // Should have converged
    expect(events.some(e => e.type === "investigation_converged")).toBe(true);
  });

  it("Supports user intervention", async () => {
    const registry = new ModelRegistry();
    registry.registerProvider(new MockProvider());

    const engine = new InvestigationEngine(registry, {
      question: "Test question",
      forceMock: true,
    });

    await engine.addUserIntervention("Follow the money.");

    const events = engine.getEvents();
    expect(events.some(e => e.type === "user_intervention")).toBe(true);
    expect(events.some(e => e.type === "research_task_created")).toBe(true);
  });
});
