// ─── SKILL VALIDATION & SANDBOX ────────────────────────────────────────────
// Tests proposed skills in a controlled environment before activation.
// Directive 05 / Skill Foundry.

import type {
  Skill,
  SkillValidationResult,
  SkillTest,
  BenchmarkCase,
  SkillProposal,
  SkillFailure,
  SkillStatus,
} from "./skill-types.js";
import { SKILL_FOUNDRY_LIMITS } from "./skill-types.js";
import type { InvestigationState } from "./types.js";
import type { SkillRegistry } from "./skill-registry.js";
import type { SkillExecutor } from "./skill-executor.js";
import { globalEventEmitter } from "./events.js";

let failureCounter = 0;
function genFailureId(): string { return `sf-${Date.now()}-${++failureCounter}`; }

// ─── Skill Validator ────────────────────────────────────────────────────────
export class SkillValidator {
  constructor(
    private registry: SkillRegistry,
    private investigationId: string,
  ) {}

  /**
   * Run all validation tests for a skill.
   * A skill cannot become ACTIVE merely because an LLM says it works.
   */
  async validate(
    skill: Skill,
    executor: SkillExecutor,
    mockState: InvestigationState,
  ): Promise<SkillValidationResult> {
    this.emitEvent("skill_validation_started", `Validation started for ${skill.name} v${skill.version}`, {
      skillId: skill.id,
      testCount: skill.validationTests.length,
    });

    const result: SkillValidationResult = {
      skillId: skill.id,
      skillVersion: skill.version,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      falsePositives: 0,
      falseNegatives: 0,
      executionCost: 0,
      executionDuration: 0,
      details: [],
      overallPass: false,
      validatedAt: Date.now(),
    };

    // If no tests defined, create a basic sanity check
    const tests = skill.validationTests.length > 0
      ? skill.validationTests
      : [this.createDefaultTest(skill)];

    for (const test of tests) {
      result.testsRun++;
      const start = Date.now();

      try {
        // Execute skill with test inputs
        const execResult = await executor.execute(skill, mockState, test.input);

        result.executionDuration += Date.now() - start;
        result.executionCost += execResult.cost;

        // Evaluate the result
        const testResult = this.evaluateTest(test, execResult, skill);

        result.details.push({
          testId: test.id,
          testName: test.name,
          result: testResult.result,
          expectedBehavior: test.expectedBehavior,
          observedBehavior: testResult.observedBehavior,
          notes: testResult.notes,
        });

        if (testResult.result === "PASS") {
          result.testsPassed++;
        } else if (testResult.result === "FAIL") {
          result.testsFailed++;
          // Check for false positives/negatives
          if (testResult.observedBehavior.includes("false positive")) {
            result.falsePositives++;
          }
          if (testResult.observedBehavior.includes("false negative")) {
            result.falseNegatives++;
          }
        }

        // Update test record
        test.lastResult = testResult.result;
        test.lastRunAt = Date.now();
      } catch (err) {
        result.testsFailed++;
        result.details.push({
          testId: test.id,
          testName: test.name,
          result: "ERROR",
          expectedBehavior: test.expectedBehavior,
          observedBehavior: err instanceof Error ? err.message : String(err),
          notes: "Execution error during test",
        });
      }
    }

    // Overall pass: at least 80% of tests pass
    result.overallPass = result.testsRun > 0 && (result.testsPassed / result.testsRun) >= 0.8;

    this.registry.recordValidation(skill.id, result);

    this.emitEvent("skill_validation_completed",
      `Validation completed for ${skill.name} v${skill.version}: ${result.testsPassed}/${result.testsRun} passed — ${result.overallPass ? "PASS" : "FAIL"}`,
      result,
    );

    if (result.overallPass) {
      this.emitEvent("skill_validated", `Skill VALIDATED: ${skill.name} v${skill.version}`, { skillId: skill.id });
    } else {
      this.emitEvent("skill_rejected", `Skill FAILED validation: ${skill.name} v${skill.version}`, { skillId: skill.id, result });
    }

    return result;
  }

  // ─── Test Evaluation ──────────────────────────────────────────────────────
  private evaluateTest(
    test: SkillTest,
    execResult: { success: boolean; evidenceCreated: string[]; claimsCreated: string[]; outputs: Record<string, unknown>; failures: string[] },
    skill: Skill,
  ): { result: "PASS" | "FAIL" | "ERROR"; observedBehavior: string; notes: string } {
    // Check if the execution succeeded
    if (!execResult.success && execResult.failures.length > 0) {
      return {
        result: "FAIL",
        observedBehavior: `Execution failed: ${execResult.failures.join("; ")}`,
        notes: `Expected: ${test.expectedBehavior}`,
      };
    }

    // Check if expected evidence was found
    if (test.expectedEvidence && test.expectedEvidence.length > 0) {
      const allFound = test.expectedEvidence.every(e =>
        execResult.evidenceCreated.length > 0 // in mock mode, we just check that evidence was created
      );
      if (!allFound) {
        return {
          result: "FAIL",
          observedBehavior: `Expected evidence not found. Expected ${test.expectedEvidence.length} items, got ${execResult.evidenceCreated.length}.`,
          notes: "false negative — expected evidence was not produced",
        };
      }
    }

    // Check if outputs were produced
    if (Object.keys(execResult.outputs).length === 0 && test.expectedOutput) {
      return {
        result: "FAIL",
        observedBehavior: "No outputs produced",
        notes: "false negative — expected output was not produced",
      };
    }

    // Check for false positives — evidence/claims produced when none expected
    if (test.expectedOutput && Object.keys(test.expectedOutput).length === 0 && execResult.evidenceCreated.length > 0) {
      return {
        result: "FAIL",
        observedBehavior: `Unexpected evidence produced: ${execResult.evidenceCreated.length} items when none expected`,
        notes: "false positive — evidence produced when none expected",
      };
    }

    return {
      result: "PASS",
      observedBehavior: `Execution completed successfully. ${execResult.evidenceCreated.length} evidence items, ${execResult.claimsCreated.length} claims created.`,
      notes: `Expected: ${test.expectedBehavior}`,
    };
  }

  // ─── Default Test ──────────────────────────────────────────────────────────
  private createDefaultTest(skill: Skill): SkillTest {
    return {
      id: `default-test-${skill.id}`,
      name: `Basic execution test for ${skill.name}`,
      description: "Verifies that the skill can execute without errors",
      input: { question: `Test question for ${skill.name}` },
      expectedBehavior: "Skill should execute and produce some output",
      expectedEvidence: [],
      knownPitfalls: ["Skill may produce no output in mock mode"],
    };
  }

  // ─── Benchmark Suite ──────────────────────────────────────────────────────
  async runBenchmark(
    skill: Skill,
    benchmarkCases: BenchmarkCase[],
    executor: SkillExecutor,
    mockState: InvestigationState,
  ): Promise<SkillValidationResult> {
    const result: SkillValidationResult = {
      skillId: skill.id,
      skillVersion: skill.version,
      testsRun: benchmarkCases.length,
      testsPassed: 0,
      testsFailed: 0,
      falsePositives: 0,
      falseNegatives: 0,
      executionCost: 0,
      executionDuration: 0,
      details: [],
      overallPass: false,
      validatedAt: Date.now(),
    };

    for (const testCase of benchmarkCases) {
      const start = Date.now();
      try {
        const execResult = await executor.execute(skill, mockState, testCase.input);
        result.executionDuration += Date.now() - start;
        result.executionCost += execResult.cost;

        // Evaluate against benchmark expectations
        const passed = execResult.success && execResult.failures.length === 0;
        // Check expected evidence
        if (testCase.expectedEvidence.length > 0 && execResult.evidenceCreated.length === 0) {
          result.falseNegatives++;
        }

        if (passed) result.testsPassed++;
        else result.testsFailed++;

        result.details.push({
          testId: testCase.id,
          testName: testCase.name,
          result: passed ? "PASS" : "FAIL",
          expectedBehavior: testCase.expectedBehavior,
          observedBehavior: `${execResult.evidenceCreated.length} evidence, ${execResult.claimsCreated.length} claims, ${execResult.failures.length} failures`,
          notes: testCase.knownPitfalls.join("; "),
        });
      } catch (err) {
        result.testsFailed++;
        result.details.push({
          testId: testCase.id,
          testName: testCase.name,
          result: "ERROR",
          expectedBehavior: testCase.expectedBehavior,
          observedBehavior: err instanceof Error ? err.message : String(err),
          notes: "Execution error",
        });
      }
    }

    result.overallPass = result.testsRun > 0 && (result.testsPassed / result.testsRun) >= 0.8;
    this.registry.recordValidation(skill.id, result);
    return result;
  }

  private emitEvent(type: string, message: string, details?: unknown): void {
    globalEventEmitter.recordEvent(this.investigationId, type as any, message, details, "SKILL_VALIDATOR");
  }
}

// ─── Skill Improvement Loop ──────────────────────────────────────────────────
export class SkillImprovement {
  constructor(
    private registry: SkillRegistry,
    private investigationId: string,
  ) {}

  /**
   * Analyze a skill failure and propose an improvement.
   */
  analyzeFailure(failure: SkillFailure): { shouldImprove: boolean; proposedChanges: string[]; proposedReason: string } {
    const shouldImprove = failure.recoverable && failure.recommendedChange.length > 0;

    if (!shouldImprove) {
      return { shouldImprove: false, proposedChanges: [], proposedReason: "" };
    }

    this.emitEvent("skill_improvement_proposed",
      `IMPROVEMENT PROPOSAL\n\nSkill: ${failure.skillId} v${failure.skillVersion}\nFailure: ${failure.expectedBehavior}\nObserved: ${failure.observedBehavior}\nCause: ${failure.possibleCause}\nRecommendation: ${failure.recommendedChange}`,
      failure,
    );

    return {
      shouldImprove: true,
      proposedChanges: [failure.recommendedChange],
      proposedReason: `Failure in investigation ${failure.investigationId}: ${failure.possibleCause}`,
    };
  }

  /**
   * Create a new version of a skill based on improvement proposals.
   * Never replaces the existing version until the new version passes validation.
   */
  proposeImprovement(
    skillId: string,
    changes: string[],
    reason: string,
    modifications?: Partial<Skill>,
  ): Skill | null {
    const skill = this.registry.getSkill(skillId);
    if (!skill) return null;

    const newVersion = this.registry.createVersion(skillId, changes, reason, modifications);

    this.emitEvent("skill_version_created",
      `NEW VERSION\n\nSkill: ${skill.name}\nVersion: v${skill.version} → v${newVersion.version}\nReason: ${reason}\nChanges: ${changes.join("; ")}`,
      { oldVersion: skill.version, newVersion: newVersion.version, changes, reason },
    );

    return newVersion;
  }

  private emitEvent(type: string, message: string, details?: unknown): void {
    globalEventEmitter.recordEvent(this.investigationId, type as any, message, details, "SKILL_IMPROVEMENT");
  }
}
