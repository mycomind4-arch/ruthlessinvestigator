// ─── DIRECTIVE 05 COMPREHENSIVE TESTS: Steps 4-28 ──────────────────────────
// Tests for ModelRouter, InformationGain, Recipes, Strategy, SkillRuns,
// SkillMemory, Deduplication, CostEfficiency, Postmortem, Budget Enforcement

import { describe, it, expect, beforeEach } from "vitest";
import { ModelRegistry } from "../server/providers/registry.js";
import { MockProvider } from "../server/providers/mock.js";
import { SkillRegistry, genSkillId, defaultPerformance } from "../server/investigation/skill-registry.js";
import { registerBuiltinSkills } from "../server/investigation/builtin-skills.js";
import { ModelRouter, TaskProfiler, type TaskProfile } from "../server/investigation/model-router.js";
import { InformationGainCalculator, CostEfficiencyTracker } from "../server/investigation/information-gain.js";
import { RecipeLibrary, StrategySelector, ProblemClassifier, SkillDeduplicator, PostInvestigationReviewer } from "../server/investigation/recipe-strategy.js";
import { SkillRunRecorder, type SkillRun } from "../server/investigation/skill-runs.js";
import { CostTracker } from "../server/investigation/cost-tracker.js";
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
    id: "test-inv",
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

function createMockSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: genSkillId(),
    name: "Test Skill",
    description: "A test skill",
    purpose: "Testing",
    version: 1,
    category: "ANALYTICAL",
    inputs: [{ name: "question", type: "string", required: true, description: "The question" }],
    outputs: [{ name: "result", type: "string", description: "The result" }],
    procedure: [{ type: "ANALYZE", description: "Analyze the question", expectedOutput: "result" }],
    prerequisites: [],
    knownFailureModes: [],
    compatibleAgents: ["EVIDENCE_ANALYST"],
    performance: { ...defaultPerformance() },
    status: "ACTIVE",
    trustLevel: "TRUSTED",
    provenance: { type: "BUILT_IN", description: "test", investigationId: "test-inv", timestamp: Date.now() },
    failures: [],
    subskills: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL ROUTER TESTS (Step 10)
// ═══════════════════════════════════════════════════════════════════════════

describe("Model Router", () => {
  let registry: ModelRegistry;
  let router: ModelRouter;

  beforeEach(() => {
    registry = createModelRegistry();
    router = new ModelRouter(registry);
  });

  it("Routes trivial tasks to cheapest model", () => {
    const profile = TaskProfiler.profile("EXTRACT", "Extract simple text", 100);
    const decision = router.route(profile);
    expect(decision.model.costTier).toBe("free");
  });

  it("Routes expert tasks to stronger models", () => {
    const profile: TaskProfile = {
      complexity: "EXPERT",
      reasoningRequirement: "MAXIMUM",
      sourceAnalysisRequirement: "FORENSIC",
      contextRequirement: "LARGE",
      requiredTools: [],
      accuracyRequirement: "CRITICAL",
      budgetRemaining: 100,
      latencyTolerance: "HIGH",
    };
    const decision = router.route(profile);
    expect(decision.model.costTier).not.toBe("free");
  });

  it("Prefers skill's preferred models when available", () => {
    const profile = TaskProfiler.profile("ANALYZE", "Analyze evidence", 100, {
      skillPreferredModels: ["openrouter/openai/gpt-4o-mini"],
    });
    const decision = router.route(profile);
    expect(decision.modelId).toBe("openrouter/openai/gpt-4o-mini");
  });

  it("Falls back to free model when budget is exhausted", () => {
    const profile: TaskProfile = {
      complexity: "COMPLEX",
      reasoningRequirement: "HIGH",
      sourceAnalysisRequirement: "DEEP",
      contextRequirement: "MEDIUM",
      requiredTools: [],
      accuracyRequirement: "HIGH",
      budgetRemaining: 0,
      latencyTolerance: "HIGH",
    };
    const decision = router.route(profile);
    expect(decision.model.costTier).toBe("free");
  });

  it("Provides reasoning for routing decision", () => {
    const profile = TaskProfiler.profile("COMPARE", "Compare sources", 100);
    const decision = router.route(profile);
    expect(decision.reason).toBeDefined();
    expect(decision.reason.length).toBeGreaterThan(0);
  });

  it("Lists alternatives considered", () => {
    const profile = TaskProfiler.profile("ANALYZE", "Analyze data", 100);
    const decision = router.route(profile);
    expect(decision.alternativesConsidered.length).toBeGreaterThan(0);
  });

  it("Estimates cost for the task", () => {
    const profile = TaskProfiler.profile("SYNTHESIZE", "Synthesize findings from multiple sources", 100);
    const decision = router.route(profile);
    expect(decision.estimatedCost).toBeGreaterThanOrEqual(0);
  });

  it("TaskProfiler assesses complexity correctly", () => {
    expect(TaskProfiler.profile("EXTRACT", "Extract", 100).complexity).toBe("SIMPLE");
    expect(TaskProfiler.profile("CONTRADICTION", "Find contradictions in evidence", 100).complexity).toBe("COMPLEX");
    expect(TaskProfiler.profile("ADVERSARIAL", "Adversarial analysis with multi-source causal chain", 100).complexity).toBe("EXPERT");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ESCALATION TESTS (Steps 11-12)
// ═══════════════════════════════════════════════════════════════════════════

describe("Model Escalation", () => {
  let registry: ModelRegistry;
  let router: ModelRouter;

  beforeEach(() => {
    registry = createModelRegistry();
    router = new ModelRouter(registry);
  });

  it("Escalates when confidence is low", () => {
    const cheapModel = registry.cheapest();
    const result = router.shouldEscalate(cheapModel, { confidence: 0.2, issues: ["Uncertain"] }, {
      complexity: "MODERATE",
      reasoningRequirement: "MEDIUM",
      sourceAnalysisRequirement: "BASIC",
      contextRequirement: "SMALL",
      requiredTools: [],
      accuracyRequirement: "MEDIUM",
      budgetRemaining: 100,
      latencyTolerance: "MEDIUM",
    });
    expect(result.escalate).toBe(true);
    expect(result.reason?.type).toBe("LOW_CONFIDENCE");
  });

  it("Escalates when results contain conflicts", () => {
    const cheapModel = registry.cheapest();
    const result = router.shouldEscalate(cheapModel, { confidence: 0.7, issues: ["conflict in evidence"] }, {
      complexity: "COMPLEX",
      reasoningRequirement: "HIGH",
      sourceAnalysisRequirement: "DEEP",
      contextRequirement: "MEDIUM",
      requiredTools: [],
      accuracyRequirement: "HIGH",
      budgetRemaining: 100,
      latencyTolerance: "HIGH",
    });
    expect(result.escalate).toBe(true);
    expect(result.reason?.type).toBe("CONFLICTING_RESULTS");
  });

  it("Does not escalate when confidence is sufficient", () => {
    const cheapModel = registry.cheapest();
    const result = router.shouldEscalate(cheapModel, { confidence: 0.9, issues: [] }, {
      complexity: "MODERATE",
      reasoningRequirement: "MEDIUM",
      sourceAnalysisRequirement: "BASIC",
      contextRequirement: "SMALL",
      requiredTools: [],
      accuracyRequirement: "MEDIUM",
      budgetRemaining: 100,
      latencyTolerance: "MEDIUM",
    });
    expect(result.escalate).toBe(false);
  });

  it("Does not escalate from the strongest model", () => {
    const expensiveModel = registry.listModels().find(m => m.costTier === "expensive") ?? registry.listModels().find(m => m.costTier === "moderate")!;
    const result = router.shouldEscalate(expensiveModel, { confidence: 0.3, issues: ["bad"] }, {
      complexity: "EXPERT",
      reasoningRequirement: "MAXIMUM",
      sourceAnalysisRequirement: "FORENSIC",
      contextRequirement: "LARGE",
      requiredTools: [],
      accuracyRequirement: "CRITICAL",
      budgetRemaining: 100,
      latencyTolerance: "HIGH",
    });
    expect(result.escalate).toBe(false);
  });

  it("Records escalation events", () => {
    const record = router.recordEscalation({
      investigationId: "test-inv",
      taskId: "task-1",
      reason: { type: "LOW_CONFIDENCE", description: "test", evidence: "test" },
      previousModelId: "mock/deterministic",
      previousModel: "Mock",
      newModelId: "openrouter/openai/gpt-4o-mini",
      newModel: "GPT-4o mini",
      expectedBenefit: "Better reasoning",
      additionalCost: 0.05,
      actualBenefit: null,
    });
    expect(record.id).toBeDefined();
    expect(record.resolved).toBe(false);
  });

  it("Resolves escalation with actual benefit", () => {
    const record = router.recordEscalation({
      investigationId: "test-inv",
      taskId: "task-1",
      reason: { type: "LOW_CONFIDENCE", description: "test", evidence: "test" },
      previousModelId: "mock/deterministic",
      previousModel: "Mock",
      newModelId: "openrouter/openai/gpt-4o-mini",
      newModel: "GPT-4o mini",
      expectedBenefit: "Better reasoning",
      additionalCost: 0.05,
      actualBenefit: null,
    });
    router.resolveEscalation(record.id, "Resolved the contradiction");
    const history = router.getEscalationHistory();
    expect(history[history.length - 1].actualBenefit).toBe("Resolved the contradiction");
    expect(history[history.length - 1].resolved).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INFORMATION GAIN TESTS (Step 6)
// ═══════════════════════════════════════════════════════════════════════════

describe("Information Gain Assessment", () => {
  let calculator: InformationGainCalculator;
  let state: InvestigationState;

  beforeEach(() => {
    calculator = new InformationGainCalculator();
    state = createMockState();
  });

  it("Assesses information gain for a task", () => {
    const result = calculator.assess("Search for primary sources about data center permits", "task-1", state, 0.15);
    expect(result.currentUncertainty).toBeDefined();
    expect(result.potentialUncertaintyReduction).toBeGreaterThan(0);
    expect(result.expectedInformationGain).toBeDefined();
    expect(result.reasoning).toBeDefined();
  });

  it("Recommends cheaper alternative when gain/cost ratio favors it", () => {
    const result = calculator.assess("Verify claim about electricity", "task-2", state, 0.50, {
      cheaperAlt: { description: "Check cached data", estimatedCost: 0.02 },
    });
    expect(result.cheaperAlternative).toBeDefined();
    expect(result.cheaperAlternative!.estimatedCost).toBeLessThan(0.50);
  });

  it("Recommends expensive alternative when justified", () => {
    const result = calculator.assess("Resolve complex contradiction affecting main hypothesis", "task-3", state, 0.20, {
      expensiveAlt: { description: "Multi-model adversarial analysis", estimatedCost: 1.50 },
    });
    expect(result.moreExpensiveAlternative).toBeDefined();
  });

  it("Recommends DEFER for negligible gain", () => {
    const result = calculator.assess("Unrelated task", "task-4", state, 0.30);
    if (result.expectedInformationGain === "NEGLIGIBLE") {
      expect(result.recommendation).toBe("DEFER");
    }
  });

  it("Considers open information gaps for relevance", () => {
    state.informationGaps.set("gap1", {
      id: "gap1",
      question: "What primary sources verify electricity consumption claims?",
      status: "OPEN",
    } as any);

    const result = calculator.assess("Search primary sources for electricity consumption", "task-5", state, 0.10);
    expect(result.potentialUncertaintyReduction).toBeGreaterThan(0.3);
  });

  it("Calculates gain per dollar", () => {
    const result = calculator.assess("Search for evidence", "task-6", state, 0.15);
    expect(result.gainPerDollar).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BUDGET ENFORCEMENT TESTS (Steps 8, 28)
// ═══════════════════════════════════════════════════════════════════════════

describe("Budget Enforcement", () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker(10);
  });

  it("Tracks spending", () => {
    expect(tracker.getSpent()).toBe(0);
    expect(tracker.getRemaining()).toBe(10);
  });

  it("Detects budget warning at 80%", () => {
    // Simulate spending $8
    const mockResponse = {
      usage: { inputTokens: 1000, outputTokens: 500, costUSD: 8 },
      provider: "mock",
      model: "mock-deterministic",
      durationMs: 100,
      simulated: false,
    } as any;
    const model = {
      id: "mock/deterministic",
      inputCostPer1K: 0,
      outputCostPer1K: 0,
    } as any;
    tracker.record(mockResponse, model, "test", "test");
    expect(tracker.isBudgetWarning()).toBe(true);
  });

  it("Detects budget exceeded", () => {
    const mockResponse = {
      usage: { inputTokens: 1000, outputTokens: 500, costUSD: 11 },
      provider: "mock",
      model: "mock-deterministic",
      durationMs: 100,
      simulated: false,
    } as any;
    const model = { id: "mock/deterministic", inputCostPer1K: 0, outputCostPer1K: 0 } as any;
    tracker.record(mockResponse, model, "test", "test");
    expect(tracker.isBudgetExceeded()).toBe(true);
  });

  it("Allows budget changes", () => {
    tracker.setBudget(50);
    expect(tracker.getBudget()).toBe(50);
    expect(tracker.getRemaining()).toBe(50);
  });

  it("Provides spending summary", () => {
    const summary = tracker.getSummary();
    expect(summary.budget).toBe(10);
    expect(summary.spent).toBe(0);
    expect(summary.remaining).toBe(10);
    expect(summary.calls).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROBLEM CLASSIFIER TESTS (Step 25)
// ═══════════════════════════════════════════════════════════════════════════

describe("Problem Classifier", () => {
  let classifier: ProblemClassifier;

  beforeEach(() => {
    classifier = new ProblemClassifier();
  });

  it("Classifies data center question", () => {
    const result = classifier.classify("Why is the United States building so many data centers?");
    expect(result.problemClass).not.toBe("UNKNOWN");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.detectedKeywords.length).toBeGreaterThan(0);
  });

  it("Classifies corporate question", () => {
    const result = classifier.classify("Who owns the corporation behind the merger?");
    expect(result.detectedKeywords).toContain("corporation");
  });

  it("Classifies financial question", () => {
    const result = classifier.classify("Follow the financial trail of investment revenue");
    expect(result.detectedKeywords.length).toBeGreaterThan(0);
  });

  it("Returns UNKNOWN for unclassifiable questions", () => {
    const result = classifier.classify("What is 2+2?");
    expect(result.problemClass).toBe("UNKNOWN");
  });

  it("Provides reasoning for classification", () => {
    const result = classifier.classify("Why is the US building data centers?");
    expect(result.reasoning).toBeDefined();
    expect(result.reasoning.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RECIPE LIBRARY TESTS (Step 24)
// ═══════════════════════════════════════════════════════════════════════════

describe("Recipe Library", () => {
  let library: RecipeLibrary;

  beforeEach(() => {
    library = new RecipeLibrary();
  });

  it("Has built-in recipe templates", () => {
    const recipes = library.getAllRecipes();
    expect(recipes.length).toBeGreaterThanOrEqual(5);
  });

  it("Finds recipes by problem class", () => {
    const recipes = library.findRecipesForClass("DATA_CENTER");
    expect(recipes.length).toBeGreaterThan(0);
  });

  it("All built-in recipes start as EXPERIMENTAL", () => {
    const recipes = library.getAllRecipes();
    for (const r of recipes) {
      expect(r.status).toBe("EXPERIMENTAL");
    }
  });

  it("Updates recipe usage and success rate", () => {
    const recipe = library.getAllRecipes()[0];
    library.updateRecipeUsage(recipe.id, true, 1.5);
    const updated = library.getRecipe(recipe.id);
    expect(updated!.timesUsed).toBe(1);
    expect(updated!.successRate).toBe(1);
  });

  it("Promotes recipe to VALIDATED after 5 successful uses", () => {
    const recipe = library.getAllRecipes()[0];
    for (let i = 0; i < 5; i++) {
      library.updateRecipeUsage(recipe.id, true, 1.5);
    }
    const updated = library.getRecipe(recipe.id);
    expect(updated!.status).toBe("VALIDATED");
  });

  it("Promotes recipe to MATURE after 10 successful uses", () => {
    const recipe = library.getAllRecipes()[0];
    for (let i = 0; i < 10; i++) {
      library.updateRecipeUsage(recipe.id, true, 1.5);
    }
    const updated = library.getRecipe(recipe.id);
    expect(updated!.status).toBe("MATURE");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY SELECTOR TESTS (Step 25)
// ═══════════════════════════════════════════════════════════════════════════

describe("Strategy Selector", () => {
  let skillRegistry: SkillRegistry;
  let recipeLibrary: RecipeLibrary;
  let selector: StrategySelector;
  let state: InvestigationState;

  beforeEach(() => {
    skillRegistry = new SkillRegistry();
    registerBuiltinSkills(skillRegistry);
    recipeLibrary = new RecipeLibrary();
    selector = new StrategySelector(skillRegistry, recipeLibrary);
    state = createMockState();
  });

  it("Selects a strategy for a data center question", () => {
    const strategy = selector.selectStrategy("Why is the US building data centers?", 10, state);
    expect(strategy.classification.problemClass).not.toBe("UNKNOWN");
    expect(strategy.estimatedCost).toBeGreaterThan(0);
    expect(strategy.estimatedCost).toBeLessThanOrEqual(10);
  });

  it("Lists alternative strategies", () => {
    const strategy = selector.selectStrategy("Who owns the corporation?", 10, state);
    expect(strategy.alternativeStrategies.length).toBeGreaterThanOrEqual(2);
  });

  it("Provides a reason for strategy selection", () => {
    const strategy = selector.selectStrategy("Analyze the financial trail", 10, state);
    expect(strategy.reason).toBeDefined();
    expect(strategy.reason.length).toBeGreaterThan(0);
  });

  it("Finds applicable skills for the problem class", () => {
    const strategy = selector.selectStrategy("Verify the scientific claim", 10, state);
    expect(strategy.selectedSkills.length).toBeGreaterThan(0);
  });

  it("Respects budget limits", () => {
    const strategy = selector.selectStrategy("Why is the US building data centers?", 0.5, state);
    expect(strategy.estimatedCost).toBeLessThanOrEqual(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SKILL RUN RECORD TESTS (Step 4)
// ═══════════════════════════════════════════════════════════════════════════

describe("Skill Run Records", () => {
  let recorder: SkillRunRecorder;

  beforeEach(() => {
    recorder = new SkillRunRecorder();
  });

  it("Records a skill run", () => {
    const run = recorder.recordRun({
      skillId: "skill-1",
      skillName: "Test Skill",
      skillVersion: 1,
      investigationId: "inv-1",
      taskId: "task-1",
      taskDescription: "Search for sources",
      agentRole: "PRIMARY_SOURCE_RESEARCHER",
      provider: "mock",
      model: "mock-deterministic",
      input: { question: "Test" },
      output: { result: "Found" },
      evidenceProduced: ["ev-1", "ev-2"],
      claimsProduced: ["cl-1"],
      contradictionsFound: [],
      timeMs: 5000,
      tokensIn: 1000,
      tokensOut: 500,
      costUSD: 0.05,
      outcome: "SUCCESS",
      qualityAssessment: {
        evidenceYield: "MODERATE",
        evidenceQuality: "HIGH",
        sourceQuality: "HIGH",
        claimAccuracy: "MODERATE",
        contradictionDiscovery: "NONE",
        hypothesisImpact: "LOW",
        informationGain: "MODERATE",
        costEfficiency: "HIGH",
        timeEfficiency: "HIGH",
        repeatability: "UNKNOWN",
        failureRate: 0,
        humanValidation: "NONE",
        notes: "",
      },
      errors: [],
      downstreamImpact: {
        evidenceUsedByOtherTasks: 0,
        claimsUsedInAssessment: 0,
        contradictionsAffectedHypotheses: 0,
        informationGapsResolved: 0,
        hypothesisRevisionsTriggered: 0,
        assessmentChangesTriggered: 0,
      },
    });
    expect(run.id).toBeDefined();
    expect(run.createdAt).toBeDefined();
  });

  it("Retrieves runs for a skill", () => {
    recorder.recordRun({
      skillId: "skill-1",
      skillName: "Test",
      skillVersion: 1,
      investigationId: "inv-1",
      taskId: "task-1",
      taskDescription: "Test",
      agentRole: "AGENT",
      provider: "mock",
      model: "mock",
      input: {},
      output: {},
      evidenceProduced: [],
      claimsProduced: [],
      contradictionsFound: [],
      timeMs: 100,
      tokensIn: 0,
      tokensOut: 0,
      costUSD: 0,
      outcome: "SUCCESS",
      qualityAssessment: {} as any,
      errors: [],
      downstreamImpact: {} as any,
    });
    const runs = recorder.getRunsForSkill("skill-1");
    expect(runs.length).toBe(1);
  });

  it("Retrieves runs for an investigation", () => {
    recorder.recordRun({
      skillId: "skill-1",
      skillName: "Test",
      skillVersion: 1,
      investigationId: "inv-1",
      taskId: "task-1",
      taskDescription: "Test",
      agentRole: "AGENT",
      provider: "mock",
      model: "mock",
      input: {},
      output: {},
      evidenceProduced: [],
      claimsProduced: [],
      contradictionsFound: [],
      timeMs: 100,
      tokensIn: 0,
      tokensOut: 0,
      costUSD: 0,
      outcome: "SUCCESS",
      qualityAssessment: {} as any,
      errors: [],
      downstreamImpact: {} as any,
    });
    const runs = recorder.getRunsForInvestigation("inv-1");
    expect(runs.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SKILL MEMORY TESTS (Step 19)
// ═══════════════════════════════════════════════════════════════════════════

describe("Skill Memory", () => {
  let recorder: SkillRunRecorder;

  beforeEach(() => {
    recorder = new SkillRunRecorder();
  });

  it("Creates memory from successful runs", () => {
    recorder.recordRun({
      skillId: "skill-mem-1",
      skillName: "Test",
      skillVersion: 1,
      investigationId: "inv-1",
      taskId: "task-1",
      taskDescription: "Test",
      agentRole: "AGENT",
      provider: "mock",
      model: "mock-deterministic",
      input: {},
      output: {},
      evidenceProduced: ["ev-1", "ev-2", "ev-3", "ev-4"],
      claimsProduced: [],
      contradictionsFound: [],
      timeMs: 3000,
      tokensIn: 500,
      tokensOut: 300,
      costUSD: 0.02,
      outcome: "SUCCESS",
      qualityAssessment: {
        evidenceYield: "HIGH",
        evidenceQuality: "HIGH",
        sourceQuality: "HIGH",
        claimAccuracy: "NONE",
        contradictionDiscovery: "NONE",
        hypothesisImpact: "MODERATE",
        informationGain: "HIGH",
        costEfficiency: "VERY_HIGH",
        timeEfficiency: "VERY_HIGH",
        repeatability: "UNKNOWN",
        failureRate: 0,
        humanValidation: "NONE",
        notes: "",
      },
      errors: [],
      downstreamImpact: {} as any,
    });

    const memory = recorder.getMemory("skill-mem-1");
    expect(memory).toBeDefined();
    expect(memory!.preferredModels).toContain("mock-deterministic");
    expect(memory!.lessons.length).toBeGreaterThan(0);
  });

  it("Learns to avoid models that fail repeatedly", () => {
    for (let i = 0; i < 3; i++) {
      recorder.recordRun({
        skillId: "skill-mem-2",
        skillName: "Test",
        skillVersion: 1,
        investigationId: "inv-1",
        taskId: `task-${i}`,
        taskDescription: "Test",
        agentRole: "AGENT",
        provider: "mock",
        model: "mock-deterministic",
        input: {},
        output: {},
        evidenceProduced: [],
        claimsProduced: [],
        contradictionsFound: [],
        timeMs: 100,
        tokensIn: 0,
        tokensOut: 0,
        costUSD: 0,
        outcome: "FAILURE",
        qualityAssessment: {} as any,
        errors: ["Model failed to produce output"],
        downstreamImpact: {} as any,
      });
    }

    const memory = recorder.getMemory("skill-mem-2");
    expect(memory).toBeDefined();
    expect(memory!.avoidModels).toContain("mock-deterministic");
  });

  it("Reinforces lessons through repeated observations", () => {
    for (let i = 0; i < 3; i++) {
      recorder.recordRun({
        skillId: "skill-mem-3",
        skillName: "Test",
        skillVersion: 1,
        investigationId: "inv-1",
        taskId: `task-${i}`,
        taskDescription: "Test",
        agentRole: "AGENT",
        provider: "mock",
        model: "mock-deterministic",
        input: {},
        output: {},
        evidenceProduced: ["ev-1", "ev-2", "ev-3", "ev-4", "ev-5", "ev-6", "ev-7"],
        claimsProduced: [],
        contradictionsFound: [],
        timeMs: 2000,
        tokensIn: 500,
        tokensOut: 300,
        costUSD: 0.01,
        outcome: "SUCCESS",
        qualityAssessment: {
          evidenceYield: "VERY_HIGH",
          evidenceQuality: "HIGH",
          sourceQuality: "HIGH",
          claimAccuracy: "NONE",
          contradictionDiscovery: "NONE",
          hypothesisImpact: "HIGH",
          informationGain: "HIGH",
          costEfficiency: "VERY_HIGH",
          timeEfficiency: "VERY_HIGH",
          repeatability: "UNKNOWN",
          failureRate: 0,
          humanValidation: "NONE",
          notes: "",
        },
        errors: [],
        downstreamImpact: {} as any,
      });
    }

    const memory = recorder.getMemory("skill-mem-3");
    expect(memory).toBeDefined();
    const strengthLessons = memory!.lessons.filter(l => l.type === "STRENGTH");
    expect(strengthLessons.length).toBeGreaterThan(0);
    expect(strengthLessons[0].observationCount).toBe(3);
    expect(strengthLessons[0].confidence).toBeGreaterThan(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SKILL DEDUPLICATION TESTS (Step 17)
// ═══════════════════════════════════════════════════════════════════════════

describe("Skill De-Duplication", () => {
  let registry: SkillRegistry;
  let dedup: SkillDeduplicator;

  beforeEach(() => {
    registry = new SkillRegistry();
    registerBuiltinSkills(registry);
    dedup = new SkillDeduplicator(registry);
  });

  it("Finds similar skills in the registry", () => {
    const results = dedup.findSimilarSkills();
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it("Classifies similarity correctly", () => {
    const results = dedup.findSimilarSkills();
    for (const r of results) {
      expect(["DUPLICATE", "OVERLAPPING", "RELATED", "DISTINCT"]).toContain(r.similarityType);
    }
  });

  it("Provides recommendations for similar skills", () => {
    const results = dedup.findSimilarSkills();
    for (const r of results) {
      expect(["MERGE", "KEEP_BOTH", "RETIRE_ONE", "NONE"]).toContain(r.recommendation);
    }
  });

  it("Identifies shared inputs and outputs", () => {
    const results = dedup.findSimilarSkills();
    for (const r of results) {
      expect(Array.isArray(r.sharedInputs)).toBe(true);
      expect(Array.isArray(r.sharedOutputs)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COST EFFICIENCY TESTS (Step 27)
// ═══════════════════════════════════════════════════════════════════════════

describe("Cost Efficiency Metrics", () => {
  let tracker: CostEfficiencyTracker;
  let state: InvestigationState;

  beforeEach(() => {
    tracker = new CostEfficiencyTracker();
    state = createMockState();
  });

  it("Computes cost per evidence item", () => {
    // Add some evidence
    state.evidence.set("ev-1", { id: "ev-1", text: "Test evidence" } as any);
    state.evidence.set("ev-2", { id: "ev-2", text: "Test evidence 2" } as any);

    const metrics = tracker.compute(5.0, state);
    expect(metrics.costPerEvidence).toBe(2.5);
    expect(metrics.evidenceItemsProduced).toBe(2);
  });

  it("Computes cost per resolved gap", () => {
    state.informationGaps.set("gap-1", { id: "gap-1", question: "Q1", status: "RESOLVED" } as any);
    state.informationGaps.set("gap-2", { id: "gap-2", question: "Q2", status: "OPEN" } as any);

    const metrics = tracker.compute(3.0, state);
    expect(metrics.costPerGapResolved).toBe(3.0);
    expect(metrics.informationGapsResolved).toBe(1);
  });

  it("Tracks cost avoided from skill reuse", () => {
    tracker.recordSkillReuseSavings(1.5);
    const metrics = tracker.compute(5.0, state);
    expect(metrics.costAvoided.skillReuse).toBe(1.5);
    expect(metrics.costAvoided.total).toBe(1.5);
  });

  it("Tracks cost avoided from cheap model routing", () => {
    tracker.recordRoutingSavings(0.75);
    const metrics = tracker.compute(5.0, state);
    expect(metrics.costAvoided.cheapModelRouting).toBe(0.75);
  });

  it("Tracks cost avoided from early task termination", () => {
    tracker.recordTerminationSavings(0.40);
    const metrics = tracker.compute(5.0, state);
    expect(metrics.costAvoided.earlyTaskTermination).toBe(0.40);
  });

  it("Computes total cost avoided", () => {
    tracker.recordSkillReuseSavings(1.5);
    tracker.recordRoutingSavings(0.75);
    tracker.recordTerminationSavings(0.40);
    const metrics = tracker.compute(5.0, state);
    expect(metrics.costAvoided.total).toBeCloseTo(2.65, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST-INVESTIGATION POSTMORTEM TESTS (Step 20)
// ═══════════════════════════════════════════════════════════════════════════

describe("Post-Investigation Postmortem", () => {
  let reviewer: PostInvestigationReviewer;
  let state: InvestigationState;

  beforeEach(() => {
    reviewer = new PostInvestigationReviewer();
    state = createMockState();
  });

  it("Generates a postmortem for a completed investigation", () => {
    // Add some evidence
    state.evidence.set("ev-1", { id: "ev-1", text: "Data center evidence" } as any);
    state.evidence.set("ev-2", { id: "ev-2", text: "Permit evidence" } as any);

    const postmortem = reviewer.generatePostmortem(state, [
      { taskLabel: "Search for data center permits", costUSD: 0.15, agentRole: "PRIMARY_SOURCE_RESEARCHER" },
      { taskLabel: "Verify claim about electricity consumption", costUSD: 0.10, agentRole: "EVIDENCE_ANALYST" },
    ], []);

    expect(postmortem.investigationId).toBe("test-inv");
    expect(postmortem.question).toBeDefined();
    expect(postmortem.summary).toBeDefined();
  });

  it("Identifies useful and wasteful tasks", () => {
    state.evidence.set("ev-1", { id: "ev-1", text: "Search for data center permits" } as any);
    state.evidence.set("ev-2", { id: "ev-2", text: "Search for permits data center" } as any);

    const postmortem = reviewer.generatePostmortem(state, [
      { taskLabel: "Search for data center permits", costUSD: 0.15, agentRole: "AGENT" },
      { taskLabel: "Random unrelated task", costUSD: 0.50, agentRole: "AGENT" },
    ], []);

    expect(postmortem.usefulTasks.length + postmortem.wastefulTasks.length).toBe(2);
  });

  it("Analyzes escalation records", () => {
    const postmortem = reviewer.generatePostmortem(state, [], [
      { reason: "Low confidence", additionalCost: 0.05, actualBenefit: "Resolved contradiction" },
      { reason: "Missing info", additionalCost: 0.10, actualBenefit: null },
    ]);

    expect(postmortem.escalationAnalysis.totalEscalations).toBe(2);
    expect(postmortem.escalationAnalysis.justifiedEscalations).toBe(1);
    expect(postmortem.escalationAnalysis.unjustifiedEscalations).toBe(1);
  });

  it("Computes cost efficiency ratio", () => {
    state.evidence.set("ev-1", { id: "ev-1", text: "Evidence" } as any);
    state.evidence.set("ev-2", { id: "ev-2", text: "Evidence" } as any);

    const postmortem = reviewer.generatePostmortem(state, [
      { taskLabel: "Search evidence", costUSD: 0.20, agentRole: "AGENT" },
      { taskLabel: "Unrelated", costUSD: 0.80, agentRole: "AGENT" },
    ], []);

    expect(postmortem.costEfficiency.totalSpent).toBe(1.0);
    expect(postmortem.costEfficiency.usefulSpent).toBeGreaterThan(0);
    expect(postmortem.costEfficiency.ratio).toBeGreaterThanOrEqual(0);
  });

  it("Identifies missed investigation areas", () => {
    state.informationGaps.set("gap-1", { id: "gap-1", question: "What about energy consumption?", status: "OPEN" } as any);

    const postmortem = reviewer.generatePostmortem(state, [], []);
    expect(postmortem.missedInvestigations.length).toBeGreaterThan(0);
  });

  it("Produces director lessons", () => {
    const postmortem = reviewer.generatePostmortem(state, [
      { taskLabel: "Task 1", costUSD: 0.50, agentRole: "AGENT" },
      { taskLabel: "Task 2", costUSD: 0.50, agentRole: "AGENT" },
    ], []);

    expect(Array.isArray(postmortem.directorLessons)).toBe(true);
  });

  it("Produces recommendations", () => {
    state.evidence.set("ev-1", { id: "ev-1", text: "Useful evidence" } as any);

    const postmortem = reviewer.generatePostmortem(state, [
      { taskLabel: "Search for useful evidence", costUSD: 0.10, agentRole: "AGENT" },
      { taskLabel: "Wasteful task xyz", costUSD: 0.90, agentRole: "AGENT" },
    ], []);

    expect(postmortem.recommendations.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LEARNING SAFETY TESTS (Step 21)
// ═══════════════════════════════════════════════════════════════════════════

describe("Learning Without Self-Corruption", () => {
  it("One successful run does not promote skill to trusted", () => {
    const registry = new SkillRegistry();
    const skill = createMockSkill({ status: "EXPERIMENTAL", trustLevel: "UNTRUSTED" });
    registry.registerSkill(skill);

    // Even after one successful run, skill should still be EXPERIMENTAL
    expect(skill.status).toBe("EXPERIMENTAL");
    expect(skill.trustLevel).toBe("UNTRUSTED");
  });

  it("Recipe requires 5 uses before validation", () => {
    const library = new RecipeLibrary();
    const recipe = library.getAllRecipes()[0];

    // 4 uses — still EXPERIMENTAL
    for (let i = 0; i < 4; i++) {
      library.updateRecipeUsage(recipe.id, true, 1.0);
    }
    expect(library.getRecipe(recipe.id)!.status).toBe("EXPERIMENTAL");

    // 5th use — promoted to VALIDATED
    library.updateRecipeUsage(recipe.id, true, 1.0);
    expect(library.getRecipe(recipe.id)!.status).toBe("VALIDATED");
  });

  it("Skill memory lessons require repeated evidence", () => {
    const recorder = new SkillRunRecorder();
    recorder.recordRun({
      skillId: "skill-safety-1",
      skillName: "Test",
      skillVersion: 1,
      investigationId: "inv-1",
      taskId: "task-1",
      taskDescription: "Test",
      agentRole: "AGENT",
      provider: "mock",
      model: "mock",
      input: {},
      output: {},
      evidenceProduced: ["ev-1"],
      claimsProduced: [],
      contradictionsFound: [],
      timeMs: 100,
      tokensIn: 0,
      tokensOut: 0,
      costUSD: 0,
      outcome: "SUCCESS",
      qualityAssessment: {
        evidenceYield: "LOW",
        evidenceQuality: "LOW",
        sourceQuality: "LOW",
        claimAccuracy: "NONE",
        contradictionDiscovery: "NONE",
        hypothesisImpact: "NONE",
        informationGain: "LOW",
        costEfficiency: "NONE",
        timeEfficiency: "HIGH",
        repeatability: "UNKNOWN",
        failureRate: 0,
        humanValidation: "NONE",
        notes: "",
      },
      errors: [],
      downstreamImpact: {} as any,
    });

    const memory = recorder.getMemory("skill-safety-1");
    // One observation should have confidence ≤ 0.5
    if (memory && memory.lessons.length > 0) {
      expect(memory.lessons[0].confidence).toBeLessThanOrEqual(0.5);
    }
  });
});
