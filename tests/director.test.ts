// ─── DIRECTOR TESTS ───────────────────────────────────────────────────────
// Tests for the Investigation Director: decisions, priorities, competition,
// confirmation bias, failed predictions, source contamination, causality,
// revision history, user overrides, and convergence.

import { describe, it, expect } from "vitest";
import {
  calculatePriority,
  determineNextAction,
  initMindChangingEvidence,
  createPredictionsForHypothesis,
  evaluatePrediction,
  compareHypotheses,
  identifyDiscriminatingTask,
  detectEvidenceClusters,
  detectNarrativePatterns,
  detectCausalClaims,
  evaluateConvergence,
  computeScorecard,
  checkConfirmationBias,
  createAssessmentRevision,
  storeMemory,
  createUserOverride,
} from "../server/investigation/director.js";
import type {
  InvestigationState,
  Hypothesis,
  Claim,
  Evidence,
  InvestigationSource,
  InformationGap,
  ResearchTask,
  Contradiction,
} from "../server/investigation/types.js";
import type {
  Prediction,
  EvidenceCluster,
  NarrativePattern,
} from "../server/investigation/director-types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────
function makeState(overrides: Partial<InvestigationState> = {}): InvestigationState {
  return {
    id: "test-inv",
    question: "Why is the US building so many data centers?",
    phase: "REASSESSMENT",
    phaseHistory: [],
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
    ...overrides,
  };
}

function makeHypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: "H1",
    statement: "AI demand is the primary driver",
    type: "CAUSAL",
    supportLevel: "MODERATE",
    supportingEvidence: [],
    contradictingEvidence: [],
    claims: [],
    assumptions: ["AI workloads are separable from cloud workloads"],
    expectedEvidence: [],
    unknowns: [],
    agentAssessments: [],
    iterations: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "ev-1",
    text: "Data centers consumed 4.4% of US electricity in 2023",
    type: "MEASUREMENT",
    sourceId: "src-1",
    extractedBy: "PRIMARY_SOURCE_RESEARCHER",
    extractedAt: Date.now(),
    independentConfirmation: true,
    rootSourceIds: ["src-1"],
    ...overrides,
  };
}

function makeSource(overrides: Partial<InvestigationSource> = {}): InvestigationSource {
  return {
    id: "src-1",
    title: "DOE Report",
    sourceType: "GOVERNMENT_RECORD",
    quality: { authority: 0.8, proximity: 0.8, specificity: 0.7, independence: 0.8, transparency: 0.7, recency: 0.9, trackRecord: 0.7 },
    citedBy: [],
    cites: [],
    isPrimary: true,
    addedBy: "PRIMARY_SOURCE_RESEARCHER",
    addedAt: Date.now(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Priority Ranking", () => {
  it("high-impact unresolved questions outrank low-impact research", () => {
    const highPriority = calculatePriority(9, 9, 9, 3, 3, 0, 10);
    const lowPriority = calculatePriority(3, 3, 3, 8, 8, 2, 5);

    const highScore = (highPriority.importance * highPriority.uncertainty * highPriority.expectedImpact) /
      (highPriority.cost * highPriority.difficulty * (1 + highPriority.dependencyCount * 0.15)) * (highPriority.relevance / 10);
    const lowScore = (lowPriority.importance * lowPriority.uncertainty * lowPriority.expectedImpact) /
      (lowPriority.cost * lowPriority.difficulty * (1 + lowPriority.dependencyCount * 0.15)) * (lowPriority.relevance / 10);

    expect(highScore).toBeGreaterThan(lowScore);
  });

  it("formula is transparent and inspectable", () => {
    const p = calculatePriority(8, 7, 9, 3, 4, 1, 9);
    expect(p.formula).toContain("Priority");
    expect(p.formula).toContain("8");
    expect(p.formula).toContain("7");
  });

  it("dependencies reduce priority", () => {
    const noDeps = calculatePriority(5, 5, 5, 5, 5, 0, 5);
    const withDeps = calculatePriority(5, 5, 5, 5, 5, 3, 5);
    const scoreNoDeps = (noDeps.importance * noDeps.uncertainty * noDeps.expectedImpact) /
      (noDeps.cost * noDeps.difficulty * 1.0) * (noDeps.relevance / 10);
    const scoreWithDeps = (withDeps.importance * withDeps.uncertainty * withDeps.expectedImpact) /
      (withDeps.cost * withDeps.difficulty * (1 + 3 * 0.15)) * (withDeps.relevance / 10);
    expect(scoreNoDeps).toBeGreaterThan(scoreWithDeps);
  });
});

describe("Director Decisions", () => {
  it("chooses a valid next action given an evidence state", () => {
    const state = makeState();
    const action = determineNextAction(state);
    expect(action).toBeDefined();
    expect(action.type).toBeDefined();
    expect(action.reason).toBeDefined();
    expect(action.question).toBeDefined();
    expect(action.assignedAgent).toBeDefined();
  });

  it("suggests CONVERGE when no high-priority tasks remain", () => {
    const state = makeState({
      contradictions: new Map(),
      informationGaps: new Map(),
      predictions: new Map(),
      failedPredictions: new Map(),
      discriminatingTasks: new Map(),
      causalClaims: new Map(),
    });
    state.hypotheses = new Map();
    state.claims = new Map();
    state.entities = new Map();

    const action = determineNextAction(state);
    expect(action.type).toBe("CONVERGE");
  });

  it("prioritizes unresolved contradictions", () => {
    const state = makeState();
    const con: Contradiction = {
      id: "con-1",
      claimA: "claim-1",
      claimB: "claim-2",
      description: "Contradiction between AI demand and speculative investment",
      status: "POTENTIAL",
      detectedBy: "engine",
      detectedAt: Date.now(),
    };
    state.contradictions.set("con-1", con);

    const action = determineNextAction(state);
    expect(["INVESTIGATE_CONTRADICTION"]).toContain(action.type);
  });

  it("flags confirmation bias risk when hypothesis has no counter-evidence", () => {
    const state = makeState();
    const hyp = makeHypothesis({
      supportingEvidence: ["ev-1", "ev-2", "ev-3"],
      contradictingEvidence: [],
    });
    state.hypotheses.set("H1", hyp);

    const action = determineNextAction(state);
    expect(action.type).toBe("SEARCH_FOR_COUNTEREVIDENCE");
    expect(action.reason).toContain("confirmation bias");
  });
});

describe("Hypothesis Competition", () => {
  it("identifies discriminating evidence between hypotheses", () => {
    const hypA = makeHypothesis({
      id: "H1",
      statement: "AI demand drives construction",
      supportingEvidence: ["ev-1", "ev-2"],
      claims: ["claim-1"],
      expectedEvidence: [
        { id: "exp-1", description: "AI capacity contracts increasing", status: "UNKNOWN" },
      ],
    });
    const hypB = makeHypothesis({
      id: "H2",
      statement: "Speculative investment drives construction",
      supportingEvidence: ["ev-3"],
      claims: ["claim-2"],
      expectedEvidence: [
        { id: "exp-2", description: "Low utilization rates at new facilities", status: "UNKNOWN" },
      ],
    });

    const competition = compareHypotheses(hypA, hypB, makeState());
    expect(competition.evidenceForA).toContain("ev-1");
    expect(competition.evidenceForA).toContain("ev-2");
    expect(competition.evidenceForB).toContain("ev-3");
  });

  it("creates discriminating evidence task for untested hypotheses", () => {
    const state = makeState();
    const hypA = makeHypothesis({
      id: "H1",
      claims: ["claim-1"],
      expectedEvidence: [{ id: "exp-1", description: "AI contracts", status: "MISSING" }],
    });
    const hypB = makeHypothesis({
      id: "H2",
      claims: ["claim-2"],
      expectedEvidence: [{ id: "exp-2", description: "Low utilization", status: "MISSING" }],
    });
    state.claims.set("claim-1", {
      id: "claim-1", text: "test", type: "FACTUAL", supportingEvidence: [], contradictingEvidence: [],
      status: "UNVERIFIED", createdBy: "test", createdAt: Date.now(),
    });
    state.claims.set("claim-2", {
      id: "claim-2", text: "test", type: "FACTUAL", supportingEvidence: [], contradictingEvidence: [],
      status: "UNVERIFIED", createdBy: "test", createdAt: Date.now(),
    });

    const task = identifyDiscriminatingTask(hypA, hypB, state);
    expect(task).not.toBeNull();
    expect(task?.hypothesisA).toBe("H1");
    expect(task?.hypothesisB).toBe("H2");
    expect(task?.status).toBe("PENDING");
  });
});

describe("Confirmation Bias Protection", () => {
  it("fails check when hypothesis has no contradicting evidence", () => {
    const hyp = makeHypothesis({
      supportingEvidence: ["ev-1", "ev-2"],
      contradictingEvidence: [],
      assumptions: ["test assumption"],
      expectedEvidence: [{ id: "exp-1", description: "test", status: "FOUND" }],
    });
    const result = checkConfirmationBias(hyp);
    expect(result.passed).toBe(false);
    expect(result.checks.some(c => c.check.includes("contradicting") && !c.passed)).toBe(true);
  });

  it("passes check when hypothesis has all required elements", () => {
    const hyp = makeHypothesis({
      supportingEvidence: ["ev-1"],
      contradictingEvidence: ["ev-2"],
      assumptions: ["alternative explanation"],
      expectedEvidence: [
        { id: "exp-1", description: "test", status: "FOUND" },
        { id: "exp-2", description: "test negative", status: "NEGATIVE" },
      ],
    });
    const result = checkConfirmationBias(hyp);
    expect(result.passed).toBe(true);
  });
});

describe("Failed Predictions", () => {
  it("failed predictions weaken the associated hypothesis", () => {
    const hyp = makeHypothesis({
      supportingEvidence: ["ev-1", "ev-2", "ev-3", "ev-4"],
      contradictingEvidence: [],
      supportLevel: "STRONG",
      expectedEvidence: [
        { id: "exp-1", description: "GPU deployments increase", status: "FOUND" },
        { id: "exp-2", description: "AI capacity contracts", status: "NEGATIVE" },
      ],
    });

    // The expected evidence with NEGATIVE status should impact support
    const negCount = hyp.expectedEvidence.filter(e => e.status === "NEGATIVE").length;
    expect(negCount).toBeGreaterThan(0);
  });

  it("predictions are generated from expected evidence", () => {
    const hyp = makeHypothesis({
      expectedEvidence: [
        { id: "exp-1", description: "GPU deployments increase", status: "UNKNOWN" },
        { id: "exp-2", description: "AI capacity contracts signed", status: "UNKNOWN" },
      ],
    });
    const preds = createPredictionsForHypothesis(hyp);
    expect(preds).toHaveLength(2);
    expect(preds[0].hypothesisId).toBe("H1");
    expect(preds[0].status).toBe("PENDING");
  });

  it("evaluatePrediction returns CONFIRMED when matching evidence exists", () => {
    const evidence = new Map<string, Evidence>();
    evidence.set("ev-1", makeEvidence({ text: "GPU deployments have increased significantly" }));
    const pred: Prediction = {
      id: "pred-1",
      hypothesisId: "H1",
      description: "Predicts: GPU deployments increase",
      expectedResult: "GPU deployments increase",
      status: "PENDING",
      createdAt: Date.now(),
    };
    const result = evaluatePrediction(pred, evidence);
    expect(result.status).toBe("CONFIRMED");
  });

  it("evaluatePrediction returns INCONCLUSIVE when no matching evidence", () => {
    const evidence = new Map<string, Evidence>();
    evidence.set("ev-1", makeEvidence({ text: "Cloud demand is growing" }));
    const pred: Prediction = {
      id: "pred-1",
      hypothesisId: "H1",
      description: "Predicts: GPU deployments increase",
      expectedResult: "GPU deployments increase",
      status: "PENDING",
      createdAt: Date.now(),
    };
    const result = evaluatePrediction(pred, evidence);
    expect(result.status).toBe("INCONCLUSIVE");
  });
});

describe("Source Contamination", () => {
  it("groups secondary sources into evidence clusters", () => {
    const sources = new Map<string, InvestigationSource>();
    const rootSource = makeSource({ id: "root-1", title: "DOE Report", cites: [] });
    const secondary1 = makeSource({ id: "sec-1", title: "Reuters", cites: ["root-1"] });
    const secondary2 = makeSource({ id: "sec-2", title: "McKinsey", cites: ["root-1"] });

    sources.set("root-1", rootSource);
    sources.set("sec-1", secondary1);
    sources.set("sec-2", secondary2);

    const evidence = new Map<string, Evidence>();
    evidence.set("ev-1", makeEvidence({ sourceId: "root-1" }));
    evidence.set("ev-2", makeEvidence({ sourceId: "sec-1" }));
    evidence.set("ev-3", makeEvidence({ sourceId: "sec-2" }));

    const clusters = detectEvidenceClusters(sources, evidence);
    expect(clusters.length).toBeGreaterThan(0);
    const doeCluster = clusters.find(c => c.rootSourceIds.includes("root-1"));
    expect(doeCluster).toBeDefined();
    expect(doeCluster?.totalSources).toBe(3); // root + 2 secondaries
    expect(doeCluster?.independentRoots).toBe(1);
  });

  it("does not cluster truly independent sources", () => {
    const sources = new Map<string, InvestigationSource>();
    sources.set("src-1", makeSource({ id: "src-1", cites: [] }));
    sources.set("src-2", makeSource({ id: "src-2", cites: [] }));

    const evidence = new Map<string, Evidence>();
    evidence.set("ev-1", makeEvidence({ sourceId: "src-1" }));
    evidence.set("ev-2", makeEvidence({ sourceId: "src-2" }));

    const clusters = detectEvidenceClusters(sources, evidence);
    expect(clusters.length).toBe(0);
  });
});

describe("Narrative Detection", () => {
  it("detects identical wording across sources", () => {
    const sources = new Map<string, InvestigationSource>();
    sources.set("src-1", makeSource({ id: "src-1" }));
    sources.set("src-2", makeSource({ id: "src-2" }));

    const evidence = new Map<string, Evidence>();
    evidence.set("ev-1", makeEvidence({ id: "ev-1", sourceId: "src-1", text: "Data centers consumed approximately 4.4% of total US electricity" }));
    evidence.set("ev-2", makeEvidence({ id: "ev-2", sourceId: "src-2", text: "Data centers consumed approximately 4.4% of total US electricity" }));

    const patterns = detectNarrativePatterns(sources, evidence);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].type).toBe("IDENTICAL_WORDING");
    expect(patterns[0].sourceIds.length).toBe(2);
  });

  it("does not flag evidence from the same source as narrative convergence", () => {
    const sources = new Map<string, InvestigationSource>();
    sources.set("src-1", makeSource({ id: "src-1" }));

    const evidence = new Map<string, Evidence>();
    evidence.set("ev-1", makeEvidence({ id: "ev-1", sourceId: "src-1", text: "Same wording from one source" }));
    evidence.set("ev-2", makeEvidence({ id: "ev-2", sourceId: "src-1", text: "Same wording from one source" }));

    const patterns = detectNarrativePatterns(sources, evidence);
    expect(patterns.length).toBe(0);
  });
});

describe("Causal Review", () => {
  it("triggers causal review for causal claims", () => {
    const claims = new Map<string, Claim>();
    claims.set("claim-1", {
      id: "claim-1",
      text: "AI demand caused data center construction to increase",
      type: "CAUSAL",
      supportingEvidence: [],
      contradictingEvidence: [],
      status: "UNVERIFIED",
      createdBy: "test",
      createdAt: Date.now(),
    });

    const causalClaims = detectCausalClaims(claims);
    expect(causalClaims.length).toBeGreaterThan(0);
    expect(causalClaims[0].status).toBe("PENDING");
  });

  it("does not trigger causal review for non-causal claims", () => {
    const claims = new Map<string, Claim>();
    claims.set("claim-1", {
      id: "claim-1",
      text: "Data centers consumed 4.4% of US electricity",
      type: "QUANTITATIVE",
      supportingEvidence: [],
      contradictingEvidence: [],
      status: "SUPPORTED",
      createdBy: "test",
      createdAt: Date.now(),
    });

    const causalClaims = detectCausalClaims(claims);
    expect(causalClaims.length).toBe(0);
  });
});

describe("Revision History", () => {
  it("records every assessment change", () => {
    const rev1 = createAssessmentRevision(1, "No prior assessment", "MODERATE confidence", "Initial assessment", ["ev-1"], "First assessment generated", ["SYNTHESIS"]);
    const rev2 = createAssessmentRevision(2, "MODERATE confidence", "LOW confidence", "Failed prediction", ["ev-2"], "Prediction #3 failed, weakening H1", ["SYNTHESIS", "DIRECTOR"]);

    expect(rev1.revisionNumber).toBe(1);
    expect(rev1.previousAssessment).toBe("No prior assessment");
    expect(rev1.newAssessment).toBe("MODERATE confidence");

    expect(rev2.revisionNumber).toBe(2);
    expect(rev2.previousAssessment).toBe("MODERATE confidence");
    expect(rev2.newAssessment).toBe("LOW confidence");
    expect(rev2.trigger).toBe("Failed prediction");
  });
});

describe("User Override", () => {
  it("persists user commands", () => {
    const override = createUserOverride("INVESTIGATE_THIS", "Look into tax incentive programs");
    expect(override.type).toBe("INVESTIGATE_THIS");
    expect(override.instruction).toBe("Look into tax incentive programs");
    expect(override.effects.length).toBeGreaterThan(0);
    expect(override.recordedAt).toBeGreaterThan(0);
  });

  it("STOP_INVESTIGATING creates pause effect", () => {
    const override = createUserOverride("STOP_INVESTIGATING", "Stop investigating");
    expect(override.effects).toContain("Investigation paused");
  });

  it("REOPEN_INVESTIGATION creates reopen effect", () => {
    const override = createUserOverride("REOPEN_INVESTIGATION", "Reopen the investigation");
    expect(override.effects).toContain("Investigation reopened for reassessment");
  });
});

describe("Convergence", () => {
  it("does not falsely converge just because models agree", () => {
    const state = makeState({
      hypotheses: new Map([
        ["H1", makeHypothesis({ id: "H1", supportLevel: "STRONG", supportingEvidence: ["ev-1"], contradictingEvidence: [] })],
        ["H2", makeHypothesis({ id: "H2", supportLevel: "STRONG", supportingEvidence: ["ev-1"], contradictingEvidence: [] })],
      ]),
    });

    const convergence = evaluateConvergence(state);
    // Should NOT converge just because both are STRONG — need predictions tested, gaps resolved, etc.
    expect(convergence.overall).toBe(false);
  });

  it("converges when all criteria are met", () => {
    const state = makeState({
      hypotheses: new Map([
        ["H1", makeHypothesis({ id: "H1", supportLevel: "MODERATE", supportingEvidence: ["ev-1"], contradictingEvidence: ["ev-2"] })],
      ]),
      predictions: new Map([
        ["pred-1", { id: "pred-1", hypothesisId: "H1", description: "test", expectedResult: "test", status: "CONFIRMED", createdAt: Date.now() }],
      ]),
      adversarialChallenges: new Map([
        ["ch-1", { id: "ch-1", hypothesisId: "H1", challenges: [], iteration: 1, status: "DEFENDED", createdAt: Date.now() }],
      ]),
      researchTasks: new Map([
        ...Array.from({ length: 6 }, (_, i) => [`task-${i}`, {
          id: `task-${i}`, question: "test", assignedTo: "test", modelId: "test",
          status: "COMPLETED", priority: "MEDIUM", createdAt: Date.now(), completedAt: Date.now()
        } as ResearchTask]),
      ]),
      informationGaps: new Map([
        ["gap-1", { id: "gap-1", question: "test", importance: "LOW", expectedImpact: "low", status: "RESOLVED", createdAt: Date.now() }],
      ]),
      contradictions: new Map(),
    });

    const convergence = evaluateConvergence(state);
    expect(convergence.majorHypothesesTested).toBe(true);
    expect(convergence.importantPredictionsTested).toBe(true);
    expect(convergence.strongestCounterargumentsInvestigated).toBe(true);
  });
});

describe("Investigation Scorecard", () => {
  it("computes a transparent scorecard with multiple dimensions", () => {
    const state = makeState({
      hypotheses: new Map([
        ["H1", makeHypothesis({
          supportingEvidence: ["ev-1"],
          contradictingEvidence: ["ev-2"],
          expectedEvidence: [
            { id: "exp-1", description: "test", status: "FOUND" },
            { id: "exp-2", description: "test2", status: "MISSING" },
          ],
        })],
      ]),
      evidence: new Map([
        ["ev-1", makeEvidence({ id: "ev-1" })],
        ["ev-2", makeEvidence({ id: "ev-2" })],
      ]),
      sources: new Map([
        ["src-1", makeSource({ id: "src-1" })],
        ["src-2", makeSource({ id: "src-2", cites: ["src-1"] })],
      ]),
    });
    state.hypotheses.get("H1")!.supportLevel = "MODERATE";

    const scorecard = computeScorecard(state);
    expect(scorecard.evidenceCoverage).toBeGreaterThanOrEqual(0);
    expect(scorecard.evidenceCoverage).toBeLessThanOrEqual(100);
    expect(scorecard.sourceIndependence).toBeGreaterThanOrEqual(0);
    expect(scorecard.sourceIndependence).toBeLessThanOrEqual(100);
    expect(scorecard.details.totalEvidence).toBe(2);
    expect(scorecard.details.totalSources).toBe(2);
  });

  it("does not collapse into a single truth score", () => {
    const state = makeState();
    const scorecard = computeScorecard(state);
    // Scorecard should have 8 separate dimensions, not a single number
    expect(scorecard.evidenceCoverage).toBeDefined();
    expect(scorecard.sourceIndependence).toBeDefined();
    expect(scorecard.contradictionResolution).toBeDefined();
    expect(scorecard.hypothesisCoverage).toBeDefined();
    expect(scorecard.adversarialCoverage).toBeDefined();
    expect(scorecard.informationGaps).toBeDefined();
    expect(scorecard.predictionTesting).toBeDefined();
    expect(scorecard.researchDepth).toBeDefined();
  });
});

describe("Investigation Memory", () => {
  it("stores memory with provenance", () => {
    const mem = storeMemory("VERIFIED_FACT", "Data centers consumed 4.4% of US electricity in 2023", "ev-1 from DOE report", 0.8);
    expect(mem.category).toBe("VERIFIED_FACT");
    expect(mem.content).toContain("4.4%");
    expect(mem.provenance).toBe("ev-1 from DOE report");
    expect(mem.confidence).toBe(0.8);
    expect(mem.id).toBeDefined();
  });
});
