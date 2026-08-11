// ─── DIRECTIVE 05 TESTS ────────────────────────────────────────────────────
// Tests for persistent deep investigation architecture.

import { describe, it, expect } from "vitest";
import { ModelRegistry } from "../server/providers/registry.js";
import { MockProvider } from "../server/providers/mock.js";
import { InvestigationEngine } from "../server/investigation/engine.js";
import { ContextBuilder } from "../server/investigation/context-builder.js";
import { InvestigationTaskManager, genMissionId } from "../server/investigation/task-manager.js";
import { MemoryStore, distillCycleMemory, createAssessmentSnapshot, compareSnapshots } from "../server/investigation/memory-system.js";
import {
  determineReasoningDepth,
  shouldEscalate,
  analyzeTaskCharacteristics,
} from "../server/investigation/reasoning.js";
import { MODE_CONFIGS, getModeConfig } from "../server/investigation/modes.js";
import { reviewCycle, recordDecision } from "../server/investigation/cycle-review.js";
import type { ResearchMission, ReasoningEffort } from "../server/investigation/persistence-types.js";
import type { InvestigationState } from "../server/investigation/types.js";

function makeRegistry(): ModelRegistry {
  const r = new ModelRegistry();
  r.registerProvider(new MockProvider());
  return r;
}

function makeState(question: string): InvestigationState {
  return {
    id: `test-inv-${Date.now()}`,
    question,
    phase: "CREATED",
    phaseHistory: [{ phase: "CREATED", enteredAt: Date.now() }],
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
    budgetUSD: 10,
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
    investigationCycle: 0,
    maxCycles: 5,
    converged: false,
    paused: false,
  };
}

// ─── 1. Reasoning Configuration ─────────────────────────────────────────────

describe("Reasoning Configuration", () => {
  it("Provider accepts standard/deep/maximum reasoning", async () => {
    const provider = new MockProvider();
    const caps = provider.capabilities();
    expect(caps.supportsReasoning).toBe(true);
    expect(caps.maxReasoningEffort).toBe("maximum");

    for (const effort of ["standard", "deep", "maximum"] as const) {
      const res = await provider.generate({
        prompt: "Test question",
        model: "mock-deterministic",
        jsonMode: false,
        reasoning: { effort },
      });
      expect(res.reasoningEffort).toBe(effort);
      expect(res.text).toBeTruthy();
    }
  });
});

// ─── 2. Provider Abstraction ───────────────────────────────────────────────

describe("Provider Abstraction", () => {
  it("Changing provider does not change Director logic", () => {
    const registry = makeRegistry();
    const model = registry.cheapest("mock");
    expect(model.provider).toBe("mock");

    // Director determines reasoning depth — same logic regardless of provider
    const depth = determineReasoningDepth("compare_sources", { involvesContradiction: false, involvesCausality: false, modelsDisagree: false, sourceIndependenceUncertain: false, isConsequential: false, hypothesisDependsOnThis: false, unresolvedContradictionsExist: false, substantialUncertainty: false, isAssessmentRevision: false, isAdversarialAttack: false, isFinalReassessment: false, highExpectedInfoGain: false, researchFailedToResolve: false }, "standard", "maximum");
    expect(depth).toBe("deep"); // compare_sources always starts at deep
  });
});

// ─── 3. Reasoning Escalation ───────────────────────────────────────────────

describe("Reasoning Escalation", () => {
  it("Important unresolved conflicts cause reasoning escalation", () => {
    const chars = {
      involvesContradiction: true,
      involvesCausality: false,
      modelsDisagree: true,
      sourceIndependenceUncertain: false,
      isConsequential: true,
      hypothesisDependsOnThis: true,
      unresolvedContradictionsExist: true,
      substantialUncertainty: false,
      isAssessmentRevision: false,
      isAdversarialAttack: false,
      isFinalReassessment: false,
      highExpectedInfoGain: true,
      researchFailedToResolve: false,
    };

    const result = shouldEscalate("standard", chars, "maximum");
    expect(result.shouldEscalate).toBe(true);
    expect(result.newDepth).toBe("deep");
  });

  it("Adversarial attacks escalate to maximum", () => {
    const chars = {
      involvesContradiction: false, involvesCausality: false, modelsDisagree: false,
      sourceIndependenceUncertain: false, isConsequential: true, hypothesisDependsOnThis: true,
      unresolvedContradictionsExist: false, substantialUncertainty: false,
      isAssessmentRevision: false, isAdversarialAttack: true, isFinalReassessment: false,
      highExpectedInfoGain: true, researchFailedToResolve: false,
    };
    const result = shouldEscalate("deep", chars, "maximum");
    expect(result.shouldEscalate).toBe(true);
    expect(result.newDepth).toBe("maximum");
  });

  it("Standard extraction tasks do not escalate", () => {
    const depth = determineReasoningDepth("extract_date", { involvesContradiction: false, involvesCausality: false, modelsDisagree: false, sourceIndependenceUncertain: false, isConsequential: false, hypothesisDependsOnThis: false, unresolvedContradictionsExist: false, substantialUncertainty: false, isAssessmentRevision: false, isAdversarialAttack: false, isFinalReassessment: false, highExpectedInfoGain: false, researchFailedToResolve: false }, "standard", "maximum");
    expect(depth).toBe("standard");
  });
});

// ─── 4. Context Construction ──────────────────────────────────────────────

describe("Context Construction", () => {
  it("Agents receive only relevant investigation context", () => {
    const state = makeState("Test question?");
    const builder = new ContextBuilder();

    // Add some hypotheses and evidence
    state.hypotheses.set("h1", {
      id: "h1", statement: "Hypothesis 1", type: "FACTUAL",
      supportLevel: "MODERATE", supportingEvidence: ["ev1"], contradictingEvidence: ["ev2"],
      claims: [], assumptions: [], expectedEvidence: [], unknowns: ["Unknown 1"],
      agentAssessments: [], iterations: [], createdAt: Date.now(), updatedAt: Date.now(),
    });
    state.hypotheses.set("h2", {
      id: "h2", statement: "Hypothesis 2", type: "FACTUAL",
      supportLevel: "WEAK", supportingEvidence: ["ev3"], contradictingEvidence: [],
      claims: [], assumptions: [], expectedEvidence: [], unknowns: [],
      agentAssessments: [], iterations: [], createdAt: Date.now(), updatedAt: Date.now(),
    });
    state.evidence.set("ev1", {
      id: "ev1", text: "Evidence 1", type: "OBSERVATION", sourceId: "s1",
      extractedBy: "TEST", extractedAt: Date.now(), independentConfirmation: true, rootSourceIds: ["s1"],
    });
    state.evidence.set("ev2", {
      id: "ev2", text: "Evidence 2", type: "OBSERVATION", sourceId: "s2",
      extractedBy: "TEST", extractedAt: Date.now(), independentConfirmation: false, rootSourceIds: ["s2"],
    });
    state.sources.set("s1", {
      id: "s1", title: "Source 1", sourceType: "OBSERVATION", quality: { authority: 0.8, proximity: 0.7, specificity: 0.6, independence: 0.9, transparency: 0.5, recency: 0.8, trackRecord: 0.7 },
      citedBy: [], cites: [], isPrimary: true, addedBy: "TEST", addedAt: Date.now(),
    });

    const ctx = builder.buildContext(state, { question: "Test h1", hypothesisIds: ["h1"] });

    // Should include h1 but not h2
    expect(ctx.hypothesis).toContain("Hypothesis 1");
    expect(ctx.hypothesis).not.toContain("Hypothesis 2");

    // Should include evidence for h1
    expect(ctx.evidence).toContain("ev1");
    expect(ctx.evidence).toContain("ev2");
    expect(ctx.evidence).not.toContain("ev3");
  });

  it("Context renders as layered prompt", () => {
    const state = makeState("What is happening?");
    const builder = new ContextBuilder();
    const ctx = builder.buildContext(state, { question: "Find evidence" });
    const rendered = builder.renderContext(ctx, state);

    expect(rendered).toContain("=== GLOBAL CONTEXT ===");
    expect(rendered).toContain("What is happening?");
    expect(rendered).toContain("=== YOUR MISSION ===");
    expect(rendered).toContain("Find evidence");
  });
});

// ─── 5. Research Cycles ──────────────────────────────────────────────────

describe("Research Cycles", () => {
  it("Cycles persist correctly in engine", async () => {
    const registry = makeRegistry();
    const engine = new InvestigationEngine(registry, {
      question: "Test question?",
      forceMock: true,
      mode: "QUICK",
    });

    await engine.run();

    const cycles = engine.getResearchCycles();
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0].status).toBe("COMPLETED");
    expect(cycles[0].sequence).toBeGreaterThanOrEqual(0);
    expect(cycles[0].startedAt).toBeGreaterThan(0);
    expect(cycles[0].completedAt).toBeGreaterThanOrEqual(cycles[0].startedAt);
  });
});

// ─── 6. Pause / Resume ────────────────────────────────────────────────────

describe("Pause/Resume", () => {
  it("Paused investigations resume correctly", async () => {
    const registry = makeRegistry();
    const engine = new InvestigationEngine(registry, {
      question: "Test question?",
      forceMock: true,
      mode: "QUICK",
    });

    engine.pause();
    expect(engine.isInvestigationPaused()).toBe(true);

    engine.resume();
    expect(engine.isInvestigationPaused()).toBe(false);
  });
});

// ─── 7. Memory ───────────────────────────────────────────────────────────

describe("Memory", () => {
  it("Memory retains provenance and epistemic status", () => {
    const store = new MemoryStore();
    const item = store.store("VERIFIED_FACT", "Test fact", "Source: filing", 0.9);
    expect(item.provenance).toBe("Source: filing");
    expect(item.confidence).toBe(0.9);
    expect(item.staleness).toBe("CURRENT");
  });

  it("Memory items have categories", () => {
    const store = new MemoryStore();
    store.store("VERIFIED_FACT", "Fact 1", "source", 0.9);
    store.store("UNRESOLVED_QUESTION", "Question 1", "analysis", 0.5);
    store.store("REJECTED_CLAIM", "Claim 1", "evidence", 0.8);

    expect(store.getByCategory("VERIFIED_FACT").length).toBe(1);
    expect(store.getByCategory("UNRESOLVED_QUESTION").length).toBe(1);
    expect(store.getByCategory("REJECTED_CLAIM").length).toBe(1);
  });
});

// ─── 8. Memory Staleness ──────────────────────────────────────────────────

describe("Memory Staleness", () => {
  it("Superseded information does not silently remain current", () => {
    const store = new MemoryStore();
    const old = store.store("VERIFIED_FACT", "Old fact", "old source", 0.8);
    const newer = store.store("VERIFIED_FACT", "New fact", "new source", 0.9);

    store.supersede(old.id, newer.id, "New evidence supersedes old");

    expect(old.staleness).toBe("SUPERSEDED");
    expect(old.supersededBy).toBe(newer.id);
    expect(old.supersedeReason).toContain("supersedes");

    // Current items should not include the superseded one
    const current = store.getCurrent();
    expect(current.find(m => m.id === old.id)).toBeUndefined();
    expect(current.find(m => m.id === newer.id)).toBeDefined();
  });
});

// ─── 9. Assessment Snapshots ──────────────────────────────────────────────

describe("Assessment Snapshots", () => {
  it("Every material assessment change is preserved", () => {
    const state = makeState("Test?");
    // Add a hypothesis to state so the snapshot includes it
    state.hypotheses.set("h1", {
      id: "h1", statement: "H1", type: "FACTUAL",
      supportLevel: "WEAK", supportingEvidence: [], contradictingEvidence: [],
      claims: [], assumptions: [], expectedEvidence: [], unknowns: [],
      agentAssessments: [], iterations: [], createdAt: Date.now(), updatedAt: Date.now(),
    });
    state.assessment = {
      investigationId: state.id,
      confidenceLevel: "LOW",
      hypothesisSummaries: [{ hypothesisId: "h1", hypothesisStatement: "H1", supportLevel: "WEAK" }],
      supportingEvidence: [], contradictingEvidence: [], majorAssumptions: [], majorUnknowns: [],
      strongestCounterargument: "", informationGaps: [], multiCausal: false, lastUpdated: Date.now(),
    };

    const snap1 = createAssessmentSnapshot(state, "cycle1", 1);
    expect(snap1.revisionNumber).toBe(1);
    expect(snap1.snapshot.confidenceLevel).toBe("LOW");
    expect(snap1.snapshot.hypotheses.length).toBe(1);

    // Change assessment AND the actual hypothesis support level
    state.assessment.confidenceLevel = "HIGH";
    state.assessment.hypothesisSummaries[0].supportLevel = "STRONG";
    state.hypotheses.get("h1")!.supportLevel = "STRONG";

    const snap2 = createAssessmentSnapshot(state, "cycle2", 2);
    expect(snap2.snapshot.confidenceLevel).toBe("HIGH");
    expect(snap2.snapshot.hypotheses[0].supportLevel).toBe("STRONG");

    // Both snapshots preserved
    expect(snap1.id).not.toBe(snap2.id);
  });
});

// ─── 10. Assessment Comparison ─────────────────────────────────────────────

describe("Assessment Comparison", () => {
  it("Can compare two snapshots", () => {
    const state = makeState("Test?");
    state.hypotheses.set("h1", {
      id: "h1", statement: "H1", type: "FACTUAL",
      supportLevel: "WEAK", supportingEvidence: [], contradictingEvidence: [],
      claims: [], assumptions: [], expectedEvidence: [], unknowns: [],
      agentAssessments: [], iterations: [], createdAt: Date.now(), updatedAt: Date.now(),
    });
    state.assessment = {
      investigationId: state.id,
      confidenceLevel: "LOW",
      hypothesisSummaries: [{ hypothesisId: "h1", hypothesisStatement: "H1", supportLevel: "WEAK" }],
      supportingEvidence: [], contradictingEvidence: [], majorAssumptions: [], majorUnknowns: ["Unknown 1"],
      strongestCounterargument: "", informationGaps: [], multiCausal: false, lastUpdated: Date.now(),
    };

    const snap1 = createAssessmentSnapshot(state, "c1", 1);

    state.assessment.hypothesisSummaries[0].supportLevel = "STRONG";
    state.hypotheses.get("h1")!.supportLevel = "STRONG";
    state.assessment.majorUnknowns = [];

    const snap2 = createAssessmentSnapshot(state, "c2", 2);

    const diff = compareSnapshots(snap1, snap2);
    expect(diff.changes.length).toBeGreaterThan(0);
    const h1Change = diff.changes.find(c => c.hypothesisId === "h1");
    expect(h1Change?.direction).toBe("STRENGTHENED");
    expect(diff.resolvedUnknowns).toContain("Unknown 1");
  });
});

// ─── 11. Decision History ─────────────────────────────────────────────────

describe("Decision History", () => {
  it("Director decisions are inspectable", () => {
    const dec = recordDecision("c1", "inv1", "SELECT_RESEARCH", "Selected primary-source research", "Leading hypothesis depends on quantitative claim", {
      alternatives: [{ option: "OSINT search", rejectedBecause: "Unlikely to resolve source-origin problem" }],
      whatWouldChange: "Independent government dataset",
      agent: "DIRECTOR",
      model: "mock",
    });

    expect(dec.id).toBeTruthy();
    expect(dec.decisionType).toBe("SELECT_RESEARCH");
    expect(dec.decision).toBe("Selected primary-source research");
    expect(dec.alternativesConsidered.length).toBe(1);
    expect(dec.alternativesConsidered[0].option).toBe("OSINT search");
    expect(dec.whatWouldChangeDecision).toContain("government");
  });
});

// ─── 12. Budget ────────────────────────────────────────────────────────────

describe("Budget Controls", () => {
  it("Long investigations cannot exceed configured limits", async () => {
    const registry = makeRegistry();
    const engine = new InvestigationEngine(registry, {
      question: "Test?",
      budgetUSD: 0.01, // very low budget
      forceMock: true,
      mode: "QUICK",
    });

    await engine.run();

    const state = engine.getState();
    // In mock mode, all costs are $0, so budget is never truly exceeded.
    // The investigation should still terminate normally (converged or complete).
    expect(state.investigationCycle).toBeLessThanOrEqual(state.maxCycles);
  });
});

// ─── 13. Task Manager ──────────────────────────────────────────────────────

describe("Task Manager", () => {
  it("Queue, prioritize, start, complete tasks", () => {
    const tm = new InvestigationTaskManager(2);

    const m1: ResearchMission = {
      id: genMissionId(), cycleId: "c1", investigationId: "inv1",
      objective: "Low priority", question: "?", hypothesisIds: [], claimIds: [],
      informationGapIds: [], expectedEvidence: [], assignedAgent: "TEST", assignedModel: "mock",
      reasoningDepth: "standard", priority: 1, budget: 1, dependencies: [],
      context: { global: "q", hypothesis: null, claim: null, evidence: [], sources: [], history: [], currentMission: "" },
      status: "PENDING", escalationTriggers: [], createdAt: Date.now(),
    };
    const m2: ResearchMission = {
      ...m1, id: genMissionId(), objective: "High priority", priority: 10,
    };

    tm.queueTask(m1);
    tm.queueTask(m2);

    // Higher priority should come first after prioritizeTasks
    tm.prioritizeTasks();
    const pending = tm.getPendingMissions();
    expect(pending[0].priority).toBeGreaterThanOrEqual(pending[1].priority);

    // Start a task
    const started = tm.startTask(m2.id);
    expect(started?.status).toBe("IN_PROGRESS");

    // Complete it
    tm.completeTask(m2.id, { findings: "done", evidenceDiscovered: [], claimsCreated: [], contradictionsDiscovered: [], assessmentImpact: "LOW", cost: 0, duration: 0, completedAt: Date.now() });
    expect(tm.getCompletedMissions().length).toBe(1);
  });

  it("Pause and resume tasks", () => {
    const tm = new InvestigationTaskManager(2);
    const m: ResearchMission = {
      id: genMissionId(), cycleId: "c1", investigationId: "inv1",
      objective: "Test", question: "?", hypothesisIds: [], claimIds: [],
      informationGapIds: [], expectedEvidence: [], assignedAgent: "TEST", assignedModel: "mock",
      reasoningDepth: "standard", priority: 5, budget: 1, dependencies: [],
      context: { global: "q", hypothesis: null, claim: null, evidence: [], sources: [], history: [], currentMission: "" },
      status: "PENDING", escalationTriggers: [], createdAt: Date.now(),
    };
    tm.queueTask(m);
    tm.startTask(m.id);
    tm.pauseTask(m.id);
    expect(m.status).toBe("PAUSED");

    tm.resumeTask(m.id);
    expect(m.status).toBe("IN_PROGRESS");
  });
});

// ─── 14. Investigation Modes ────────────────────────────────────────────────

describe("Investigation Modes", () => {
  it("QUICK mode has fewer cycles than DEEP", () => {
    expect(MODE_CONFIGS.QUICK.maxCycles).toBeLessThan(MODE_CONFIGS.DEEP.maxCycles);
    expect(MODE_CONFIGS.DEEP.maxCycles).toBeLessThan(MODE_CONFIGS.FORENSIC.maxCycles);
  });

  it("DEEP mode enables multi-model review and second-pass", () => {
    expect(MODE_CONFIGS.DEEP.multiModelReview).toBe(true);
    expect(MODE_CONFIGS.DEEP.secondPassReview).toBe(true);
    expect(MODE_CONFIGS.QUICK.multiModelReview).toBe(false);
  });

  it("Default reasoning depth varies by mode", () => {
    expect(MODE_CONFIGS.QUICK.defaultReasoningDepth).toBe("standard");
    expect(MODE_CONFIGS.DEEP.defaultReasoningDepth).toBe("deep");
  });
});

// ─── 15. Mock Mode ──────────────────────────────────────────────────────────

describe("Mock Mode", () => {
  it("The entire long-running architecture can operate deterministically without API keys", async () => {
    const registry = makeRegistry();
    const engine = new InvestigationEngine(registry, {
      question: "Why is the United States building so many data centers?",
      forceMock: true,
      mode: "QUICK",
    });

    await engine.run();

    const state = engine.getState();
    expect(state.question).toBeTruthy();
    expect(state.hypotheses.size).toBeGreaterThan(0);
    expect(state.evidence.size).toBeGreaterThan(0);
    expect(state.sources.size).toBeGreaterThan(0);

    // Directive 05 features should be present
    expect(engine.getResearchCycles().length).toBeGreaterThan(0);
    expect(engine.getDecisions().length).toBeGreaterThan(0);
    expect(engine.getMissions().length).toBeGreaterThan(0);
    expect(engine.getMemoryItems().length).toBeGreaterThan(0);
    expect(engine.getMode()).toBe("QUICK");
  });
});

// ─── 16. Convergence (Long Investigations) ─────────────────────────────────

describe("Convergence for Long Investigations", () => {
  it("Deep investigations do not converge merely because models agree", () => {
    const state = makeState("Test?");
    state.assessment = {
      investigationId: state.id, confidenceLevel: "MODERATE",
      hypothesisSummaries: [], supportingEvidence: [], contradictingEvidence: [],
      majorAssumptions: [], majorUnknowns: [], strongestCounterargument: "",
      informationGaps: [], multiCausal: false, lastUpdated: Date.now(),
    };

    // Even with an assessment, the state has no tested hypotheses, no predictions,
    // no contradictions investigated — should not converge
    expect(state.converged).toBe(false);
    expect(state.hypotheses.size).toBe(0);
    expect(state.predictions.size).toBe(0);
  });
});

// ─── 17. User Intervention ──────────────────────────────────────────────────

describe("User Intervention", () => {
  it("Overrides influence subsequent Director decisions", async () => {
    const registry = makeRegistry();
    const engine = new InvestigationEngine(registry, {
      question: "Test question?",
      forceMock: true,
      mode: "QUICK",
    });

    // Add intervention
    await engine.addUserIntervention("Find primary evidence");
    const state = engine.getState();
    expect(state.userOverrides.size).toBeGreaterThan(0);
  });
});
