import { describe, expect, it } from "vitest";
import { SkillLearningEngine } from "./skill-learning.js";
import { SkillRegistry } from "./skill-registry.js";
import type { Skill } from "./skill-types.js";

function makeSkill(id: string, name: string): Skill {
  return {
    id, name, description: name, purpose: name, category: "PROCEDURAL",
    inputs: [{ name: "question", type: "question", required: true, description: "question" }],
    outputs: [{ name: "evidence", type: "evidence", description: "evidence" }],
    prerequisites: [], procedure: [{ id: "s1", type: "SEARCH_SOURCES", description: "search", inputs: ["question"], outputs: ["evidence"] }],
    subskills: [], compatibleAgents: ["PRIMARY_SOURCE_RESEARCHER"], compatibleSources: [],
    validationTests: [], knownFailureModes: [],
    provenance: { type: "BUILT_IN", createdAt: Date.now() },
    version: 1, status: "ACTIVE",
    performance: { usageCount: 1, successCount: 1, failureCount: 0, averageDuration: 1, averageCost: 0.01, evidenceYield: 1, claimYield: 0, contradictionDetectionRate: 0, falsePositiveRate: 0, falseNegativeRate: 0, investigationsUsedIn: [] },
    versions: [], failures: [], maxCompositionDepth: 2, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe("SkillLearningEngine", () => {
  it("tracks a first occurrence instead of immediately creating a skill", () => {
    const engine = new SkillLearningEngine(new SkillRegistry());
    const result = engine.observe({ investigationId: "i1", problem: "verify utility load", existingSkillsUsed: [], workaroundSteps: ["compare utility filings"], success: false, evidenceCreated: 0, contradictionDetected: 0, cost: 0.02 });
    expect(result.action).toBe("TRACK_GAP");
    expect(engine.getGaps()[0].occurrences).toBe(1);
  });

  it("proposes a reusable skill after recurrence", () => {
    const engine = new SkillLearningEngine(new SkillRegistry());
    const input = { problem: "verify utility load", existingSkillsUsed: [], workaroundSteps: ["compare utility filings"], success: false, evidenceCreated: 0, contradictionDetected: 0, cost: 0.02 };
    engine.observe({ ...input, investigationId: "i1" });
    const result = engine.observe({ ...input, investigationId: "i2" });
    expect(result.action).toBe("PROPOSE_SKILL");
    expect(result.proposal?.status).toBe("PROPOSED");
    expect(result.proposal?.createdFromInvestigations).toEqual(["i1", "i2"]);
  });

  it("proposes composition without activating anything", () => {
    const registry = new SkillRegistry();
    registry.registerSkill(makeSkill("parent", "source analysis"));
    registry.registerSkill(makeSkill("child", "independence check"));
    const engine = new SkillLearningEngine(registry);
    const result = engine.findComposition("parent", ["child"]);
    expect(result.action).toBe("PROPOSE_COMPOSITION");
    expect(registry.getSkill("child")?.status).toBe("ACTIVE");
  });
});
