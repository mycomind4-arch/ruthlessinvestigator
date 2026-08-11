import { describe, expect, it } from "vitest";
import {
  createWorkDedupeKey,
  decideOptimization,
} from "../server/investigation/optimization-policy.js";
import { OptimizationControlPlane } from "../server/investigation/optimization-control.js";

describe("optimization policy", () => {
  it("blocks paid work when the estimated cost exceeds budget", () => {
    const decision = decideOptimization({
      workKind: "SYNTHESIS",
      importance: 10,
      uncertainty: 10,
      expectedImpact: 10,
      estimatedCost: 2,
      budgetRemaining: 1,
      availableEvidence: 2,
      unresolvedContradictions: 3,
    });

    expect(decision.proceed).toBe(false);
    expect(decision.mode).toBe("ECONOMY");
    expect(decision.maxModelEscalations).toBe(0);
  });

  it("normalizes equivalent questions into the same work key", () => {
    const a = createWorkDedupeKey({
      workKind: "SOURCE_DISCOVERY",
      question: "Find primary sources about data centers",
      importance: 7.2,
      uncertainty: 5.1,
      expectedImpact: 8.4,
    });
    const b = createWorkDedupeKey({
      workKind: "SOURCE_DISCOVERY",
      question: "  FIND   PRIMARY SOURCES ABOUT DATA CENTERS ",
      importance: 7.4,
      uncertainty: 5.4,
      expectedImpact: 8.1,
    });

    expect(a).toBe(b);
  });
});

describe("optimization control plane", () => {
  const task = {
    investigationId: "inv-1",
    taskId: "source-discovery-1",
    question: "Find primary sources about data center construction",
    workKind: "SOURCE_DISCOVERY" as const,
    importance: 7,
    uncertainty: 7,
    expectedImpact: 8,
    estimatedCost: 0.2,
    budgetRemaining: 5,
    availableEvidence: 3,
    unresolvedContradictions: 0,
  };

  it("plans work without becoming an independent Director", () => {
    const control = new OptimizationControlPlane();
    const plan = control.plan(task);

    expect(plan.decision.mode).toBeDefined();
    expect(plan.contextBudgetTokens).toBeGreaterThan(0);
    expect(plan.shouldExecute).toBe(true);
  });

  it("deduplicates materially equivalent completed work", () => {
    const control = new OptimizationControlPlane();
    control.recordCompletion(task, "STANDARD", "result-a");

    const second = control.plan({ ...task, taskId: "source-discovery-99" });

    expect(second.shouldExecute).toBe(false);
    expect(second.reuseRecord?.resultFingerprint).toBe("result-a");
  });

  it("records escalation outcomes for future routing analysis", () => {
    const control = new OptimizationControlPlane();
    control.recordEscalationOutcome({
      taskId: "CONTRADICTION-1",
      fromMode: "STANDARD",
      toMode: "DEEP",
      additionalCost: 0.4,
      beforeConfidence: 0.52,
      afterConfidence: 0.86,
      materialChange: true,
      benefit: "Resolved a source-definition mismatch",
      recordedAt: Date.now(),
    });

    expect(control.getEscalationOutcomes()).toHaveLength(1);
    expect(control.escalationBenefitRate()).toBe(1);
  });
});
