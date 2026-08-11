// ─── SKILL BENCHMARK SUITE (Directive 05, Step 24) ─────────────────────────
// Reusable benchmark system for testing skills against known cases.
// A skill cannot become ACTIVE merely because an LLM says it works.
// It must pass benchmark validation.

import type { Skill, SkillTest, SkillInput, SkillOutput } from "./skill-types.js";
import type { SkillRegistry } from "./skill-registry.js";
import type { SkillExecutor } from "./skill-executor.js";
import type { InvestigationState } from "./types.js";
import type { ModelRegistry } from "../providers/registry.js";

// ─── Benchmark Case ───────────────────────────────────────────────────────

export interface BenchmarkCase {
  id: string;
  name: string;
  description: string;
  skillCategory?: string;            // Which category of skill this benchmarks
  skillName?: string;                // Optional: specific skill this tests
  input: Record<string, unknown>;   // Inputs to the skill
  expectedBehavior: string;          // What should happen
  expectedEvidence: ExpectedEvidence[];
  expectedOutput: Record<string, unknown>;
  knownPitfalls: string[];           // Common mistakes to avoid
  difficulty: "EASY" | "MEDIUM" | "HARD" | "EXPERT";
  tags: string[];
}

export interface ExpectedEvidence {
  type: string;                      // e.g. "PRIMARY_SOURCE", "CONTRADICTION"
  description: string;
  minCount: number;
  maxCount?: number;
}

export interface BenchmarkResult {
  caseId: string;
  caseName: string;
  skillId: string;
  skillName: string;
  skillVersion: number;
  passed: boolean;
  score: number;                     // 0-1
  details: BenchmarkDetail[];
  executionTime: number;
  cost: number;
  expectedVsActual: ExpectedVsActual[];
  falsePositives: number;
  falseNegatives: number;
  createdAt: number;
}

export interface BenchmarkDetail {
  criterion: string;
  expected: string;
  actual: string;
  passed: boolean;
  weight: number;
}

export interface ExpectedVsActual {
  outputName: string;
  expected: unknown;
  actual: unknown;
  match: boolean;
}

export interface BenchmarkSuite {
  id: string;
  name: string;
  description: string;
  cases: BenchmarkCase[];
  createdAt: number;
}

export interface BenchmarkRunResult {
  suiteId: string;
  skillId: string;
  skillName: string;
  skillVersion: number;
  totalCases: number;
  passed: number;
  failed: number;
  score: number;                     // Average score across cases
  results: BenchmarkResult[];
  executionTime: number;
  totalCost: number;
  passedThreshold: boolean;           // Did the skill pass the validation threshold
}

// ─── Built-in benchmark suites ────────────────────────────────────────────

const SOURCE_INDEPENDENCE_BENCHMARK: BenchmarkSuite = {
  id: "bench-source-independence",
  name: "Source Independence Analysis Benchmarks",
  description: "Tests whether a skill correctly identifies source dependencies and independent vs. dependent sources.",
  createdAt: Date.now(),
  cases: [
    {
      id: "si-1",
      name: "Direct citation chain",
      description: "Reuters cites a DOE report. CNN cites Reuters. DOE is the primary source.",
      skillCategory: "ANALYTICAL",
      skillName: "Source Independence Analysis",
      input: {
        sources: [
          { name: "DOE Report", type: "GOVERNMENT_RECORD", isPrimary: true },
          { name: "Reuters Article", type: "SECONDARY_REPORT", isPrimary: false, cites: "DOE Report" },
          { name: "CNN Article", type: "SECONDARY_REPORT", isPrimary: false, cites: "Reuters Article" },
        ],
      },
      expectedBehavior: "Should identify one primary evidence cluster with DOE as root.",
      expectedEvidence: [
        { type: "PRIMARY_SOURCE", description: "DOE Report identified as primary source", minCount: 1, maxCount: 1 },
        { type: "DEPENDENT_SOURCE", description: "Reuters and CNN identified as dependent", minCount: 2, maxCount: 2 },
      ],
      expectedOutput: { clusterCount: 1, rootSource: "DOE Report" },
      knownPitfalls: [
        "Treating Reuters as independent because it has a different publisher.",
        "Counting all three sources as separate evidence clusters.",
      ],
      difficulty: "EASY",
      tags: ["source-independence", "citation-chain"],
    },
    {
      id: "si-2",
      name: "Multiple independent sources",
      description: "DOE report, IEA report, and industry survey all independently report similar data.",
      input: {
        sources: [
          { name: "DOE Report", type: "GOVERNMENT_RECORD", isPrimary: true },
          { name: "IEA Report", type: "GOVERNMENT_RECORD", isPrimary: true },
          { name: "Industry Survey", type: "DATASET", isPrimary: true },
        ],
      },
      expectedBehavior: "Should identify three independent primary sources forming three evidence clusters.",
      expectedEvidence: [
        { type: "PRIMARY_SOURCE", description: "Three independent primary sources", minCount: 3, maxCount: 3 },
        { type: "DEPENDENT_SOURCE", description: "No dependent sources", minCount: 0, maxCount: 0 },
      ],
      expectedOutput: { clusterCount: 3, rootSource: null },
      knownPitfalls: ["Merging sources that report similar data without checking independence."],
      difficulty: "MEDIUM",
      tags: ["source-independence", "multiple-primary"],
    },
    {
      id: "si-3",
      name: "Hidden dependency via shared dataset",
      description: "Two news articles from different outlets both reference the same dataset from a single study.",
      input: {
        sources: [
          { name: "Study Dataset", type: "DATASET", isPrimary: true },
          { name: "NYT Article", type: "SECONDARY_REPORT", isPrimary: false, cites: "Study Dataset" },
          { name: "WSJ Article", type: "SECONDARY_REPORT", isPrimary: false, cites: "Study Dataset" },
        ],
      },
      expectedBehavior: "Should identify that NYT and WSJ both depend on the same Study Dataset — one cluster, not two.",
      expectedEvidence: [
        { type: "PRIMARY_SOURCE", description: "Study Dataset is the sole primary source", minCount: 1, maxCount: 1 },
        { type: "DEPENDENT_SOURCE", description: "Both NYT and WSJ are dependent on the same dataset", minCount: 2, maxCount: 2 },
      ],
      expectedOutput: { clusterCount: 1, rootSource: "Study Dataset" },
      knownPitfalls: [
        "Treating NYT and WSJ as independent because they are from different publications.",
        "Not tracing citations to the same underlying dataset.",
      ],
      difficulty: "HARD",
      tags: ["source-independence", "hidden-dependency", "shared-dataset"],
    },
  ],
};

const TIMELINE_BENCHMARK: BenchmarkSuite = {
  id: "bench-timeline-reconstruction",
  name: "Timeline Reconstruction Benchmarks",
  description: "Tests whether a skill correctly reconstructs chronological sequences and distinguishes projected vs observed events.",
  createdAt: Date.now(),
  cases: [
    {
      id: "tl-1",
      name: "Simple chronological ordering",
      description: "Three events with clear dates must be ordered correctly.",
      skillCategory: "PROCEDURAL",
      skillName: "Timeline Reconstruction",
      input: {
        events: [
          { date: "2023-06-15", description: "Project announced", status: "ANNOUNCED" },
          { date: "2024-01-20", description: "Permit filed", status: "OBSERVED" },
          { date: "2024-08-10", description: "Construction began", status: "OBSERVED" },
        ],
      },
      expectedBehavior: "Should produce a correctly ordered timeline with status classifications.",
      expectedEvidence: [
        { type: "TIMELINE_EVENT", description: "Three events in chronological order", minCount: 3, maxCount: 3 },
      ],
      expectedOutput: { eventCount: 3, ordered: true, hasStatusClassification: true },
      knownPitfalls: ["Reversing order of events.", "Not classifying announced vs observed."],
      difficulty: "EASY",
      tags: ["timeline", "chronological"],
    },
    {
      id: "tl-2",
      name: "Projected vs observed dates",
      description: "Events include projected future dates that must be distinguished from observed past dates.",
      input: {
        events: [
          { date: "2023-03-01", description: "Facility announced", status: "ANNOUNCED" },
          { date: "2023-09-15", description: "Construction permit issued", status: "OBSERVED" },
          { date: "2025-06-01", description: "Expected operation date", status: "PROJECTED" },
          { date: "2026-01-01", description: "Full capacity target", status: "PROJECTED" },
        ],
      },
      expectedBehavior: "Should clearly distinguish observed events from projected events.",
      expectedEvidence: [
        { type: "TIMELINE_EVENT", description: "Two observed events", minCount: 2, maxCount: 2 },
        { type: "PROJECTED_EVENT", description: "Two projected events clearly marked", minCount: 2, maxCount: 2 },
      ],
      expectedOutput: { eventCount: 4, ordered: true, hasStatusClassification: true, projectedCount: 2 },
      knownPitfalls: [
        "Treating projected dates as confirmed events.",
        "Not labeling future dates as projections.",
      ],
      difficulty: "MEDIUM",
      tags: ["timeline", "projected-vs-observed"],
    },
    {
      id: "tl-3",
      name: "Conflicting dates from different sources",
      description: "Two sources report different dates for the same event.",
      input: {
        events: [
          { date: "2024-03-15", description: "Construction start (per local records)", status: "OBSERVED", source: "Municipal Records" },
          { date: "2024-06-01", description: "Construction start (per company announcement)", status: "ANNOUNCED", source: "Company PR" },
        ],
      },
      expectedBehavior: "Should identify the conflict and flag both dates with their sources.",
      expectedEvidence: [
        { type: "TIMELINE_EVENT", description: "Both dates recorded with sources", minCount: 2, maxCount: 2 },
        { type: "CONFLICT", description: "Date conflict flagged", minCount: 1, maxCount: 1 },
      ],
      expectedOutput: { eventCount: 2, hasConflict: true, conflictFlagged: true },
      knownPitfalls: ["Choosing one date without acknowledging the conflict."],
      difficulty: "HARD",
      tags: ["timeline", "conflicting-dates", "source-conflict"],
    },
  ],
};

const CLAIM_VERIFICATION_BENCHMARK: BenchmarkSuite = {
  id: "bench-claim-verification",
  name: "Claim Verification Benchmarks",
  description: "Tests whether a skill correctly verifies claims against primary sources.",
  createdAt: Date.now(),
  cases: [
    {
      id: "cv-1",
      name: "Direct claim with primary source",
      description: "A specific quantitative claim can be verified against a primary source.",
      skillCategory: "STRATEGIC",
      skillName: "Claim Verification",
      input: {
        claim: "Data centers consumed 4.4% of US electricity in 2023.",
        sources: [
          { name: "DOE LBNL Report 2023", type: "GOVERNMENT_RECORD", isPrimary: true, content: "Data centers consumed approximately 4.4% of total U.S. electricity in 2023." },
        ],
      },
      expectedBehavior: "Should verify the claim against the primary source and confirm it.",
      expectedEvidence: [
        { type: "VERIFIED_CLAIM", description: "Claim verified against primary source", minCount: 1, maxCount: 1 },
      ],
      expectedOutput: { verified: true, confidence: "high", sourceType: "PRIMARY" },
      knownPitfalls: ["Verifying against a secondary source that itself cites the primary."],
      difficulty: "EASY",
      tags: ["claim-verification", "primary-source"],
    },
    {
      id: "cv-2",
      name: "Claim that is a misrepresentation",
      description: "A claim takes a projection and presents it as an observed fact.",
      input: {
        claim: "Data centers already consume 12% of US electricity.",
        sources: [
          { name: "DOE LBNL Report 2023", type: "GOVERNMENT_RECORD", isPrimary: true, content: "Projected data-center electricity demand could reach 6.7-12% of total U.S. electricity by 2028." },
        ],
      },
      expectedBehavior: "Should flag the claim as a misrepresentation — the source says projected, not actual.",
      expectedEvidence: [
        { type: "MISREPRESENTATION", description: "Claim flagged as misrepresenting projection as fact", minCount: 1, maxCount: 1 },
      ],
      expectedOutput: { verified: false, reason: "projection_presented_as_observation", confidence: "high" },
      knownPitfalls: ["Verifying because numbers match without checking temporal context."],
      difficulty: "HARD",
      tags: ["claim-verification", "misrepresentation", "projection-vs-fact"],
    },
    {
      id: "cv-3",
      name: "Claim that cannot be verified",
      description: "A claim that no available source addresses.",
      input: {
        claim: "All new data centers operate at 95% utilization.",
        sources: [
          { name: "DOE LBNL Report 2023", type: "GOVERNMENT_RECORD", isPrimary: true, content: "The report does not provide utilization data for individual facilities." },
        ],
      },
      expectedBehavior: "Should mark the claim as unverifiable with current sources.",
      expectedEvidence: [
        { type: "UNVERIFIABLE_CLAIM", description: "Claim marked as unverifiable", minCount: 1, maxCount: 1 },
      ],
      expectedOutput: { verified: null, reason: "no_supporting_evidence", confidence: "low" },
      knownPitfalls: ["Marking as false rather than unverifiable.", "Accepting absence of evidence as evidence of absence."],
      difficulty: "MEDIUM",
      tags: ["claim-verification", "unverifiable", "absence-of-evidence"],
    },
  ],
};

// ─── Benchmark Registry ──────────────────────────────────────────────────

export class BenchmarkRegistry {
  private suites: Map<string, BenchmarkSuite> = new Map();

  constructor() {
    // Register built-in suites
    this.registerSuite(SOURCE_INDEPENDENCE_BENCHMARK);
    this.registerSuite(TIMELINE_BENCHMARK);
    this.registerSuite(CLAIM_VERIFICATION_BENCHMARK);
  }

  registerSuite(suite: BenchmarkSuite): void {
    this.suites.set(suite.id, suite);
  }

  getSuite(id: string): BenchmarkSuite | undefined {
    return this.suites.get(id);
  }

  getAllSuites(): BenchmarkSuite[] {
    return [...this.suites.values()];
  }

  findSuitesForSkill(skill: Skill): BenchmarkSuite[] {
    return [...this.suites.values()].filter(suite => {
      // Match by skill name if specified in cases
      if (suite.cases.some(c => c.skillName === skill.name)) return true;
      // Match by category
      if (suite.cases.some(c => c.skillCategory === skill.category)) return true;
      // Match by tags
      const skillTags = [skill.name.toLowerCase(), skill.category.toLowerCase()];
      return suite.cases.some(c => c.tags.some(t => skillTags.some(st => t.includes(st))));
    });
  }

  findCasesForSkill(skill: Skill): BenchmarkCase[] {
    return [...this.suites.values()].flatMap(suite => suite.cases).filter(c => {
      if (c.skillName === skill.name) return true;
      if (c.skillCategory === skill.category) return true;
      return false;
    });
  }
}

// ─── Benchmark Runner ────────────────────────────────────────────────────

export class BenchmarkRunner {
  constructor(
    private registry: SkillRegistry,
    private modelRegistry: ModelRegistry,
    private benchmarkRegistry: BenchmarkRegistry,
  ) {}

  /**
   * Run a specific benchmark suite against a skill.
   */
  async runSuite(
    suite: BenchmarkSuite,
    skill: Skill,
    mockState: InvestigationState,
    executor: SkillExecutor,
  ): Promise<BenchmarkRunResult> {
    const results: BenchmarkResult[] = [];
    let totalCost = 0;
    const startTime = Date.now();

    for (const testCase of suite.cases) {
      const result = await this.runCase(testCase, skill, mockState, executor);
      results.push(result);
      totalCost += result.cost;
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    return {
      suiteId: suite.id,
      skillId: skill.id,
      skillName: skill.name,
      skillVersion: skill.version,
      totalCases: results.length,
      passed,
      failed,
      score: avgScore,
      results,
      executionTime: Date.now() - startTime,
      totalCost,
      passedThreshold: avgScore >= 0.7 && failed <= Math.floor(results.length * 0.3),
    };
  }

  /**
   * Run a single benchmark case against a skill.
   */
  async runCase(
    testCase: BenchmarkCase,
    skill: Skill,
    mockState: InvestigationState,
    executor: SkillExecutor,
  ): Promise<BenchmarkResult> {
    const startTime = Date.now();

    let executionResult;
    try {
      executionResult = await executor.execute(skill, mockState, testCase.input);
    } catch (err) {
      return {
        caseId: testCase.id,
        caseName: testCase.name,
        skillId: skill.id,
        skillName: skill.name,
        skillVersion: skill.version,
        passed: false,
        score: 0,
        details: [{
          criterion: "Execution",
          expected: "Skill executes without error",
          actual: `Error: ${(err as Error).message}`,
          passed: false,
          weight: 1.0,
        }],
        executionTime: Date.now() - startTime,
        cost: 0,
        expectedVsActual: [],
        falsePositives: 1,
        falseNegatives: 0,
        createdAt: Date.now(),
      };
    }

    const details: BenchmarkDetail[] = [];
    let totalWeight = 0;
    let passedWeight = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    // Criterion 1: Did the skill produce output?
    const hasOutput = executionResult.outputs && Object.keys(executionResult.outputs).length > 0;
    details.push({
      criterion: "Output produced",
      expected: "Skill should produce output",
      actual: hasOutput ? "Output produced" : "No output",
      passed: hasOutput,
      weight: 0.2,
    });
    totalWeight += 0.2;
    if (hasOutput) passedWeight += 0.2;

    // Criterion 2: Did it produce evidence?
    const evidenceCount = executionResult.evidenceCreated?.length ?? 0;
    const minEvidence = Math.min(...testCase.expectedEvidence.map(e => e.minCount));
    const hasEnoughEvidence = evidenceCount >= minEvidence;
    details.push({
      criterion: "Evidence produced",
      expected: `At least ${minEvidence} evidence items`,
      actual: `${evidenceCount} evidence items`,
      passed: hasEnoughEvidence,
      weight: 0.3,
    });
    totalWeight += 0.3;
    if (hasEnoughEvidence) passedWeight += 0.3;

    // Criterion 3: Expected vs actual output comparison
    const expectedVsActual: ExpectedVsActual[] = [];
    let outputMatchCount = 0;
    let outputTotal = 0;

    for (const [key, expectedValue] of Object.entries(testCase.expectedOutput)) {
      outputTotal++;
      const actualValue = executionResult.outputs?.[key];
      const match = this.compareValues(expectedValue, actualValue);
      expectedVsActual.push({ outputName: key, expected: expectedValue, actual: actualValue, match });
      if (match) outputMatchCount++;
    }

    const outputScore = outputTotal > 0 ? outputMatchCount / outputTotal : 0;
    details.push({
      criterion: "Output matches expected",
      expected: JSON.stringify(testCase.expectedOutput),
      actual: JSON.stringify(executionResult.outputs ?? {}),
      passed: outputScore >= 0.5,
      weight: 0.3,
    });
    totalWeight += 0.3;
    if (outputScore >= 0.5) passedWeight += 0.3;

    // Criterion 4: No known pitfalls
    // We can't directly detect pitfalls, but if the skill failed to produce
    // what was expected, check if it matches a known pitfall pattern
    const pitfallHit = this.detectKnownPitfalls(executionResult, testCase);
    details.push({
      criterion: "Known pitfalls avoided",
      expected: "Should not fall into known pitfalls",
      actual: pitfallHit ? `Pitfall detected: ${pitfallHit}` : "No known pitfalls triggered",
      passed: !pitfallHit,
      weight: 0.2,
    });
    totalWeight += 0.2;
    if (!pitfallHit) passedWeight += 0.2;

    // Calculate false positives/negatives
    if (hasOutput && !hasEnoughEvidence) {
      falsePositives = 1; // Produced output but no real evidence
    }
    if (!hasOutput && minEvidence > 0) {
      falseNegatives = 1; // Should have found evidence but didn't
    }

    const score = totalWeight > 0 ? passedWeight / totalWeight : 0;
    const passed = score >= 0.7;

    return {
      caseId: testCase.id,
      caseName: testCase.name,
      skillId: skill.id,
      skillName: skill.name,
      skillVersion: skill.version,
      passed,
      score,
      details,
      executionTime: Date.now() - startTime,
      cost: executionResult.cost ?? 0,
      expectedVsActual,
      falsePositives,
      falseNegatives,
      createdAt: Date.now(),
    };
  }

  /**
   * Run all applicable benchmarks for a skill.
   */
  async runAllApplicableBenchmarks(
    skill: Skill,
    mockState: InvestigationState,
    executor: SkillExecutor,
  ): Promise<BenchmarkRunResult[]> {
    const suites = this.benchmarkRegistry.findSuitesForSkill(skill);
    const results: BenchmarkRunResult[] = [];

    for (const suite of suites) {
      const result = await this.runSuite(suite, skill, mockState, executor);
      results.push(result);
    }

    return results;
  }

  /**
   * Compare expected vs actual values.
   */
  private compareValues(expected: unknown, actual: unknown): boolean {
    if (expected === actual) return true;
    if (typeof expected === "number" && typeof actual === "number") {
      return Math.abs(expected - actual) < 0.001;
    }
    if (typeof expected === "string" && typeof actual === "string") {
      return expected.toLowerCase() === actual.toLowerCase();
    }
    if (expected === null && actual === undefined) return true;
    if (expected === undefined && actual === null) return true;
    return false;
  }

  /**
   * Detect if the execution fell into a known pitfall.
   */
  private detectKnownPitfalls(result: any, testCase: BenchmarkCase): string | null {
    // Check if the output suggests a known pitfall was hit
    const output = JSON.stringify(result.outputs ?? {}).toLowerCase();

    for (const pitfall of testCase.knownPitfalls) {
      // Heuristic: if the pitfall describes treating something as independent
      // and the output has no dependency info, it may have been hit
      if (pitfall.toLowerCase().includes("independent") && !output.includes("depend")) {
        return pitfall;
      }
      // If pitfall describes treating projected as observed
      if (pitfall.toLowerCase().includes("projected") && output.includes("observed")) {
        return pitfall;
      }
    }

    return null;
  }
}
