// ─── TESTS: State Transitions ─────────────────────────────────────────────
// Investigation moves correctly through its lifecycle.

import { describe, it, expect } from "vitest";
import { canTransition, nextPhases, ALL_PHASES, isValidPhase } from "../server/investigation/state-machine.js";

describe("State Machine", () => {
  it("All phases are valid", () => {
    for (const phase of ALL_PHASES) {
      expect(isValidPhase(phase)).toBe(true);
    }
  });

  it("Correct linear transitions", () => {
    expect(canTransition("DISCOVERY", "PREMISE_AUDIT")).toBe(true);
    expect(canTransition("PREMISE_AUDIT", "DECOMPOSITION")).toBe(true);
    expect(canTransition("DECOMPOSITION", "HYPOTHESIS_GENERATION")).toBe(true);
    expect(canTransition("HYPOTHESIS_GENERATION", "INDEPENDENT_RESEARCH")).toBe(true);
    expect(canTransition("INDEPENDENT_RESEARCH", "EVIDENCE_ANALYSIS")).toBe(true);
    expect(canTransition("EVIDENCE_ANALYSIS", "COUNCIL_COMPARISON")).toBe(true);
    expect(canTransition("COUNCIL_COMPARISON", "ADVERSARIAL_REVIEW")).toBe(true);
    expect(canTransition("ADVERSARIAL_REVIEW", "GAP_ANALYSIS")).toBe(true);
    expect(canTransition("GAP_ANALYSIS", "TARGETED_RESEARCH")).toBe(true);
    expect(canTransition("TARGETED_RESEARCH", "REASSESSMENT")).toBe(true);
    expect(canTransition("REASSESSMENT", "CONVERGENCE")).toBe(true);
  });

  it("Can loop back from reassessment to targeted research", () => {
    expect(canTransition("REASSESSMENT", "TARGETED_RESEARCH")).toBe(true);
    expect(canTransition("REASSESSMENT", "GAP_ANALYSIS")).toBe(true);
  });

  it("Cannot skip phases", () => {
    expect(canTransition("DISCOVERY", "CONVERGENCE")).toBe(false);
    expect(canTransition("PREMISE_AUDIT", "INDEPENDENT_RESEARCH")).toBe(false);
    expect(canTransition("HYPOTHESIS_GENERATION", "COUNCIL_COMPARISON")).toBe(false);
  });

  it("Convergence is terminal", () => {
    expect(nextPhases("CONVERGENCE")).toEqual([]);
  });

  it("GAP_ANALYSIS can go to reassessment or targeted research", () => {
    const next = nextPhases("GAP_ANALYSIS");
    expect(next).toContain("TARGETED_RESEARCH");
    expect(next).toContain("REASSESSMENT");
  });
});
