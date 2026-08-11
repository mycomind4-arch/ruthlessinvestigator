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

  it("Correct linear transitions (new phases)", () => {
    expect(canTransition("CREATED", "PREMISE_AUDIT")).toBe(true);
    expect(canTransition("PREMISE_AUDIT", "QUESTION_DECOMPOSITION")).toBe(true);
    expect(canTransition("QUESTION_DECOMPOSITION", "HYPOTHESIS_GENERATION")).toBe(true);
    expect(canTransition("HYPOTHESIS_GENERATION", "RESEARCH_PLANNING")).toBe(true);
    expect(canTransition("RESEARCH_PLANNING", "INDEPENDENT_RESEARCH")).toBe(true);
    expect(canTransition("INDEPENDENT_RESEARCH", "EVIDENCE_ANALYSIS")).toBe(true);
    expect(canTransition("EVIDENCE_ANALYSIS", "SOURCE_ANALYSIS")).toBe(true);
    expect(canTransition("SOURCE_ANALYSIS", "HYPOTHESIS_TESTING")).toBe(true);
    expect(canTransition("HYPOTHESIS_TESTING", "ADVERSARIAL_REVIEW")).toBe(true);
    expect(canTransition("ADVERSARIAL_REVIEW", "DISAGREEMENT_REVIEW")).toBe(true);
    expect(canTransition("DISAGREEMENT_REVIEW", "INFORMATION_GAP_ANALYSIS")).toBe(true);
    expect(canTransition("INFORMATION_GAP_ANALYSIS", "TARGETED_RESEARCH")).toBe(true);
    expect(canTransition("TARGETED_RESEARCH", "REASSESSMENT")).toBe(true);
    expect(canTransition("REASSESSMENT", "CONVERGENCE_REVIEW")).toBe(true);
    expect(canTransition("CONVERGENCE_REVIEW", "CONVERGED")).toBe(true);
  });

  it("Legacy phase aliases still work", () => {
    expect(canTransition("DISCOVERY", "PREMISE_AUDIT")).toBe(true);
    expect(canTransition("PREMISE_AUDIT", "DECOMPOSITION")).toBe(true);
    expect(canTransition("DECOMPOSITION", "HYPOTHESIS_GENERATION")).toBe(true);
  });

  it("Can loop back from reassessment to targeted research", () => {
    expect(canTransition("REASSESSMENT", "TARGETED_RESEARCH")).toBe(true);
    expect(canTransition("REASSESSMENT", "INFORMATION_GAP_ANALYSIS")).toBe(true);
    expect(canTransition("REASSESSMENT", "HYPOTHESIS_TESTING")).toBe(true);
  });

  it("Cannot skip phases", () => {
    expect(canTransition("CREATED", "CONVERGED")).toBe(false);
    expect(canTransition("PREMISE_AUDIT", "INDEPENDENT_RESEARCH")).toBe(false);
    expect(canTransition("HYPOTHESIS_GENERATION", "ADVERSARIAL_REVIEW")).toBe(false);
  });

  it("Convergence is reversible — can reopen", () => {
    const phases = nextPhases("CONVERGED");
    expect(phases).toContain("REASSESSMENT");
  });

  it("INFORMATION_GAP_ANALYSIS can go to reassessment or targeted research", () => {
    const next = nextPhases("INFORMATION_GAP_ANALYSIS");
    expect(next).toContain("TARGETED_RESEARCH");
    expect(next).toContain("REASSESSMENT");
  });
});
