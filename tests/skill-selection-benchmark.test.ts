// ─── SKILL SELECTION & BENCHMARK TESTS (Directive 05, Steps 21 & 24) ──────

import { describe, it, expect, beforeEach } from "vitest";
import { SkillRegistry, defaultPerformance, genSkillId } from "../server/investigation/skill-registry.js";
import { registerBuiltinSkills } from "../server/investigation/builtin-skills.js";
import { SkillSelectionEngine } from "../server/investigation/skill-selection.js";
import { BenchmarkRegistry, BenchmarkRunner } from "../server/investigation/skill-benchmark.js";
import { SkillExecutor } from "../server/investigation/skill-executor.js";
import { ModelRegistry } from "../server/providers/registry.js";
import { MockProvider } from "../server/providers/mock.js";
import type { Skill } from "../server/investigation/skill-types.js";
import type { InvestigationState } from "../server/investigation/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────

function createModelRegistry(): ModelRegistry {
  const reg = new ModelRegistry();
  reg.registerProvider(new MockProvider());
  return reg;
}

function createMockState(): InvestigationState {
  return {
    id: "test-investigation",
    question: "Why is the US building so many data centers?",
    phase: "RESEARCH",
    phaseHistory: [{ phase: "RESEARCH", enteredAt: Date.now() }],
    hypotheses: new Map(),
    claims: new Map(),
    evidence: new Map(),
    sources: new Map(),
    contradictions: new Map(),
    disagreements: new Map(),
    devilsEvidence: new Map(),
    informationGaps: new Map(),
    researchTasks: new Map(),
    adversarialChallenges: new Map(),
    assessment: null,
    budgetUSD: 100,
    spentUSD: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    predictions: new Map(),
    failedPredictions: new Map(),
    mindChangingEvidence: new Map(),
    hypothesisCompetitions: new Map(),
    discriminatingTasks: new Map(),
    evidenceClusters: new Map(),
    narrativePatterns: new Map(),
    entities: new Map(),
    relationships: new Map(),
    timelines: new Map(),
    causalClaims: new Map(),
    investigationMemory: new Map(),
    assessmentRevisions: new Map(),
    scorecard: null,
    userOverrides: new Map(),
    convergenceCheck: null,
    investigationCycle: 1,
    maxCycles: 5,
    converged: false,
    paused: false,
  } as unknown as InvestigationState;
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL SELECTION TESTS (Step 21)
// ═══════════════════════════════════════════════════════════════════════════

describe("Skill Selection Engine", () => {
  let registry: SkillRegistry;
  let selector: SkillSelectionEngine;
  let state: InvestigationState;

  beforeEach(() => {
    registry = new SkillRegistry();
    registerBuiltinSkills(registry);
    selector = new SkillSelectionEngine(registry);
    state = createMockState();
  });

  it("Selects a skill for a search task", () => {
    const result = selector.select({
      taskDescription: "Search for primary sources about data center construction permits",
      taskType: "SEARCH_SOURCES",
      agentRole: "PRIMARY_SOURCE_RESEARCHER",
      availableInputs: { question: "What permits have been filed?" },
      investigationState: state,
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.selected).not.toBeNull();
    expect(result.reason).toBeDefined();
  });

  it("Returns candidates ranked by score", () => {
    const result = selector.select({
      taskDescription: "Extract evidence from research findings",
      taskType: "EXTRACT_EVIDENCE",
      agentRole: "EVIDENCE_ANALYST",
      availableInputs: { findings: [] },
      investigationState: state,
    });

    // Candidates should be sorted by score descending
    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i - 1].score).toBeGreaterThanOrEqual(result.candidates[i].score);
    }
  });

  it("Exposes score breakdown per candidate", () => {
    const result = selector.select({
      taskDescription: "Verify claims about data center construction",
      taskType: "VERIFY_CLAIM",
      agentRole: "EVIDENCE_ANALYST",
      availableInputs: { claims: [] },
      investigationState: state,
    });

    if (result.selected) {
      const b = result.selected.breakdown;
      expect(b.semanticApplicability).toBeGreaterThanOrEqual(0);
      expect(b.semanticApplicability).toBeLessThanOrEqual(1);
      expect(b.inputCompatibility).toBeGreaterThanOrEqual(0);
      expect(b.inputCompatibility).toBeLessThanOrEqual(1);
      expect(b.historicalPerformance).toBeGreaterThanOrEqual(0);
      expect(b.historicalPerformance).toBeLessThanOrEqual(1);
      expect(b.investigationRelevance).toBeGreaterThanOrEqual(0);
      expect(b.investigationRelevance).toBeLessThanOrEqual(1);
      expect(b.costScore).toBeGreaterThanOrEqual(0);
      expect(b.costScore).toBeLessThanOrEqual(1);
      expect(b.failurePenalty).toBeGreaterThanOrEqual(0);
      expect(b.failurePenalty).toBeLessThanOrEqual(1);
      expect(b.composite).toBeGreaterThanOrEqual(0);
    }
  });

  it("Identifies missing inputs", () => {
    const result = selector.select({
      taskDescription: "Reconstruct timeline of events",
      taskType: "SYNTHESIZE",
      agentRole: "SYNTHESIS",
      availableInputs: {}, // No inputs provided
      investigationState: state,
    });

    // Skills with required inputs should show missing inputs
    const candidatesWithMissing = result.candidates.filter(c => c.missingInputs.length > 0);
    expect(candidatesWithMissing.length).toBeGreaterThan(0);
  });

  it("Lists known weaknesses for candidates", () => {
    const result = selector.select({
      taskDescription: "Analyze source independence",
      taskType: "ANALYZE",
      agentRole: "EVIDENCE_ANALYST",
      availableInputs: { sources: [] },
      investigationState: state,
    });

    for (const candidate of result.candidates) {
      expect(Array.isArray(candidate.knownWeaknesses)).toBe(true);
    }
  });

  it("Lists dependencies for candidates", () => {
    const result = selector.select({
      taskDescription: "Perform claim verification",
      taskType: "VERIFY_CLAIM",
      agentRole: "SYNTHESIS",
      availableInputs: { claims: [], sources: [] },
      investigationState: state,
    });

    for (const candidate of result.candidates) {
      expect(Array.isArray(candidate.dependencies)).toBe(true);
    }
  });

  it("Estimates cost and duration", () => {
    const result = selector.select({
      taskDescription: "Search for primary sources",
      taskType: "SEARCH_SOURCES",
      agentRole: "PRIMARY_SOURCE_RESEARCHER",
      availableInputs: { question: "Test" },
      investigationState: state,
    });

    if (result.selected) {
      expect(result.selected.estimatedCost).toBeGreaterThanOrEqual(0);
      expect(result.selected.estimatedDuration).toBeGreaterThan(0);
    }
  });

  it("Boosts skills with matching step type", () => {
    const result = selector.select({
      taskDescription: "Search sources for evidence",
      taskType: "SEARCH_SOURCES",
      agentRole: "PRIMARY_SOURCE_RESEARCHER",
      availableInputs: { question: "Test" },
      investigationState: state,
    });

    // Skills with SEARCH_SOURCES steps should score higher
    const withSearchSteps = result.candidates.filter(c =>
      c.skill.procedure.some(s => s.type === "SEARCH_SOURCES")
    );
    const withoutSearchSteps = result.candidates.filter(c =>
      !c.skill.procedure.some(s => s.type === "SEARCH_SOURCES")
    );

    if (withSearchSteps.length > 0 && withoutSearchSteps.length > 0) {
      const avgWith = withSearchSteps.reduce((s, c) => s + c.score, 0) / withSearchSteps.length;
      const avgWithout = withoutSearchSteps.reduce((s, c) => s + c.score, 0) / withoutSearchSteps.length;
      expect(avgWith).toBeGreaterThanOrEqual(avgWithout);
    }
  });

  it("Gives neutral performance score to unused skills", () => {
    const result = selector.select({
      taskDescription: "Search for primary sources",
      taskType: "SEARCH_SOURCES",
      agentRole: "PRIMARY_SOURCE_RESEARCHER",
      availableInputs: { question: "Test" },
      investigationState: state,
    });

    // Built-in skills have 0 usage — should get 0.5 performance score
    for (const candidate of result.candidates) {
      if (candidate.skill.performance.usageCount === 0) {
        expect(candidate.breakdown.historicalPerformance).toBeCloseTo(0.5, 1);
      }
    }
  });

  it("Returns reason explaining selection", () => {
    const result = selector.select({
      taskDescription: "Search for primary sources about permits",
      taskType: "SEARCH_SOURCES",
      agentRole: "PRIMARY_SOURCE_RESEARCHER",
      availableInputs: { question: "What permits have been filed?" },
      investigationState: state,
    });

    expect(result.reason).toContain("Score:");
    expect(result.reason).toContain("Semantic:");
  });

  it("Respects minConfidence filter", () => {
    const result = selector.select({
      taskDescription: "completely unrelated to any skill",
      taskType: "UNKNOWN_TYPE",
      agentRole: "UNKNOWN",
      availableInputs: {},
      investigationState: state,
      minConfidence: 0.99,
    });

    expect(result.selected).toBeNull();
  });

  it("Considers open information gaps for relevance", () => {
    state.informationGaps.set("gap1", {
      id: "gap1",
      question: "What primary sources verify these claims?",
      status: "OPEN",
    } as any);

    const result = selector.select({
      taskDescription: "Search for primary source verification",
      taskType: "SEARCH_SOURCES",
      agentRole: "PRIMARY_SOURCE_RESEARCHER",
      availableInputs: { question: "Primary sources" },
      investigationState: state,
    });

    // Skills matching gap keywords should have higher relevance
    const sourceRelevant = result.candidates.find(c =>
      c.skill.name.toLowerCase().includes("primary") || c.skill.name.toLowerCase().includes("source")
    );
    if (sourceRelevant) {
      expect(sourceRelevant.breakdown.investigationRelevance).toBeGreaterThan(0.3);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BENCHMARK SUITE TESTS (Step 24)
// ═══════════════════════════════════════════════════════════════════════════

describe("Benchmark Suite", () => {
  let benchmarkRegistry: BenchmarkRegistry;

  beforeEach(() => {
    benchmarkRegistry = new BenchmarkRegistry();
  });

  it("Has built-in benchmark suites", () => {
    const suites = benchmarkRegistry.getAllSuites();
    expect(suites.length).toBeGreaterThanOrEqual(3);
  });

  it("Includes source independence benchmarks", () => {
    const suite = benchmarkRegistry.getSuite("bench-source-independence");
    expect(suite).toBeDefined();
    expect(suite!.name).toContain("Source Independence");
    expect(suite!.cases.length).toBeGreaterThanOrEqual(3);
  });

  it("Includes timeline reconstruction benchmarks", () => {
    const suite = benchmarkRegistry.getSuite("bench-timeline-reconstruction");
    expect(suite).toBeDefined();
    expect(suite!.name).toContain("Timeline");
    expect(suite!.cases.length).toBeGreaterThanOrEqual(3);
  });

  it("Includes claim verification benchmarks", () => {
    const suite = benchmarkRegistry.getSuite("bench-claim-verification");
    expect(suite).toBeDefined();
    expect(suite!.name).toContain("Claim Verification");
    expect(suite!.cases.length).toBeGreaterThanOrEqual(3);
  });

  it("Each case has expected evidence", () => {
    const suites = benchmarkRegistry.getAllSuites();
    for (const suite of suites) {
      for (const testCase of suite.cases) {
        expect(testCase.expectedEvidence.length).toBeGreaterThan(0);
        for (const ev of testCase.expectedEvidence) {
          expect(ev.type).toBeDefined();
          expect(ev.description).toBeDefined();
          expect(ev.minCount).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("Each case has known pitfalls", () => {
    const suites = benchmarkRegistry.getAllSuites();
    for (const suite of suites) {
      for (const testCase of suite.cases) {
        expect(testCase.knownPitfalls.length).toBeGreaterThan(0);
      }
    }
  });

  it("Each case has difficulty level", () => {
    const suites = benchmarkRegistry.getAllSuites();
    for (const suite of suites) {
      for (const testCase of suite.cases) {
        expect(["EASY", "MEDIUM", "HARD", "EXPERT"]).toContain(testCase.difficulty);
      }
    }
  });

  it("Finds suites for a skill by name", () => {
    const skillRegistry = new SkillRegistry();
    registerBuiltinSkills(skillRegistry);
    const skills = skillRegistry.findActiveSkills();

    const timelineSkill = skills.find(s => s.name === "Timeline Reconstruction");
    if (timelineSkill) {
      const suites = benchmarkRegistry.findSuitesForSkill(timelineSkill);
      expect(suites.length).toBeGreaterThan(0);
    }
  });

  it("Finds cases for a skill by category", () => {
    const skillRegistry = new SkillRegistry();
    registerBuiltinSkills(skillRegistry);
    const skills = skillRegistry.findActiveSkills();

    const proceduralSkill = skills.find(s => s.category === "PROCEDURAL");
    if (proceduralSkill) {
      const cases = benchmarkRegistry.findCasesForSkill(proceduralSkill);
      expect(cases.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BENCHMARK RUNNER TESTS (Step 24)
// ═══════════════════════════════════════════════════════════════════════════

describe("Benchmark Runner", () => {
  let registry: SkillRegistry;
  let modelRegistry: ModelRegistry;
  let benchmarkRegistry: BenchmarkRegistry;
  let runner: BenchmarkRunner;
  let executor: SkillExecutor;
  let state: InvestigationState;

  beforeEach(() => {
    registry = new SkillRegistry();
    registerBuiltinSkills(registry);
    modelRegistry = createModelRegistry();
    benchmarkRegistry = new BenchmarkRegistry();
    runner = new BenchmarkRunner(registry, modelRegistry, benchmarkRegistry);
    state = createMockState();
    executor = new SkillExecutor(registry, modelRegistry, "test-inv");
  });

  it("Runs a benchmark suite against a skill", async () => {
    const skill = registry.findActiveSkills().find(s => s.name === "Timeline Reconstruction");
    if (!skill) return;

    const suite = benchmarkRegistry.getSuite("bench-timeline-reconstruction");
    if (!suite) return;

    const result = await runner.runSuite(suite, skill, state, executor);

    expect(result.suiteId).toBe(suite.id);
    expect(result.skillId).toBe(skill.id);
    expect(result.totalCases).toBe(suite.cases.length);
    expect(result.results.length).toBe(suite.cases.length);
    expect(result.executionTime).toBeGreaterThan(0);
  });

  it("Produces detailed results per case", async () => {
    const skill = registry.findActiveSkills().find(s => s.name === "Timeline Reconstruction");
    if (!skill) return;

    const suite = benchmarkRegistry.getSuite("bench-timeline-reconstruction");
    if (!suite) return;

    const result = await runner.runSuite(suite, skill, state, executor);

    for (const caseResult of result.results) {
      expect(caseResult.caseId).toBeDefined();
      expect(caseResult.caseName).toBeDefined();
      expect(caseResult.details.length).toBeGreaterThan(0);
      expect(caseResult.score).toBeGreaterThanOrEqual(0);
      expect(caseResult.score).toBeLessThanOrEqual(1);
    }
  });

  it("Tracks false positives and false negatives", async () => {
    const skill = registry.findActiveSkills().find(s => s.name === "Timeline Reconstruction");
    if (!skill) return;

    const suite = benchmarkRegistry.getSuite("bench-timeline-reconstruction");
    if (!suite) return;

    const result = await runner.runSuite(suite, skill, state, executor);

    for (const caseResult of result.results) {
      expect(typeof caseResult.falsePositives).toBe("number");
      expect(typeof caseResult.falseNegatives).toBe("number");
    }
  });

  it("Computes pass/fail and threshold", async () => {
    const skill = registry.findActiveSkills().find(s => s.name === "Timeline Reconstruction");
    if (!skill) return;

    const suite = benchmarkRegistry.getSuite("bench-timeline-reconstruction");
    if (!suite) return;

    const result = await runner.runSuite(suite, skill, state, executor);

    expect(result.passed + result.failed).toBe(result.totalCases);
    expect(typeof result.passedThreshold).toBe("boolean");
  });

  it("Records expected vs actual outputs", async () => {
    const skill = registry.findActiveSkills().find(s => s.name === "Timeline Reconstruction");
    if (!skill) return;

    const suite = benchmarkRegistry.getSuite("bench-timeline-reconstruction");
    if (!suite) return;

    const result = await runner.runSuite(suite, skill, state, executor);

    for (const caseResult of result.results) {
      expect(caseResult.expectedVsActual.length).toBeGreaterThan(0);
    }
  });

  it("Can run all applicable benchmarks for a skill", async () => {
    const skill = registry.findActiveSkills().find(s => s.name === "Timeline Reconstruction");
    if (!skill) return;

    const results = await runner.runAllApplicableBenchmarks(skill, state, executor);

    expect(results.length).toBeGreaterThan(0);
  });

  it("Handles execution errors gracefully", async () => {
    const skill = registry.findActiveSkills()[0];
    const suite = benchmarkRegistry.getAllSuites()[0];

    // Run with a mock state that will cause minimal issues
    const result = await runner.runSuite(suite, skill, state, executor);

    // Even if the skill doesn't perfectly match, it shouldn't crash
    expect(result.totalCases).toBe(suite.cases.length);
  });
});
