// ─── SKILL SANDBOX (Step 10) ──────────────────────────────────────────────
// Safe execution mode for newly learned skills.
// Restricts tools, prevents external effects, records all operations.

import type {
  Skill,
  SkillStep,
  SkillExecutionResult,
} from "./skill-types.js";
import type {
  SandboxExecutionConfig,
  SandboxExecutionResult,
  SandboxOperation,
} from "./skill-types-extended.js";
import { defaultSandboxConfig } from "./skill-types-extended.js";
import type { InvestigationState } from "./types.js";
import type { ModelRegistry } from "../providers/registry.js";
import type { SkillRegistry } from "./skill-registry.js";
import { SkillExecutor } from "./skill-executor.js";
import { globalEventEmitter } from "./events.js";

// ─── Skill Sandbox Executor ─────────────────────────────────────────────────
export class SkillSandbox {
  private executor: SkillExecutor;

  constructor(
    private registry: SkillRegistry,
    private modelRegistry: ModelRegistry,
    private investigationId: string,
  ) {
    this.executor = new SkillExecutor(registry, modelRegistry, investigationId);
  }

  /**
   * Execute a skill in sandbox mode with restricted permissions.
   */
  async run(
    skill: Skill,
    state: InvestigationState,
    inputs: Record<string, unknown>,
    config?: Partial<SandboxExecutionConfig>,
  ): Promise<SandboxExecutionResult> {
    const fullConfig: SandboxExecutionConfig = { ...defaultSandboxConfig(), ...config };

    globalEventEmitter.recordEvent(this.investigationId, "skill_sandbox_started" as any,
      `SANDBOX EXECUTION\n\nSkill: ${skill.name} v${skill.version}\nMax cost: ${fullConfig.maxCost}\nMax duration: ${fullConfig.maxDuration}\nMax steps: ${fullConfig.maxSteps}`,
      { skillId: skill.id, config: fullConfig }, "SKILL_SANDBOX");

    const operations: SandboxOperation[] = [];
    const violations: string[] = [];
    let totalCost = 0;
    let totalDuration = 0;

    // Check for security violations BEFORE execution
    const securityCheck = this.checkSecurity(skill, fullConfig);
    if (securityCheck.length > 0) {
      violations.push(...securityCheck);
      return {
        skillId: skill.id,
        config: fullConfig,
        operations: [],
        outputs: {},
        expectedVsActual: [],
        totalCost: 0,
        totalDuration: 0,
        stepCount: 0,
        success: false,
        violations,
        executedAt: Date.now(),
      };
    }

    // Check step count
    if (skill.procedure.length > fullConfig.maxSteps) {
      violations.push(`Step count ${skill.procedure.length} exceeds maximum ${fullConfig.maxSteps}`);
    }

    // Check for restricted tools in steps
    for (const step of skill.procedure) {
      const stepTools = this.getStepTools(step);
      for (const tool of stepTools) {
        if (fullConfig.restrictedTools.includes(tool)) {
          violations.push(`Step ${step.id} uses restricted tool: ${tool}`);
        }
      }
      if (step.agentRole && fullConfig.restrictedAgents.includes(step.agentRole)) {
        violations.push(`Step ${step.id} uses restricted agent: ${step.agentRole}`);
      }
    }

    if (violations.length > 0) {
      globalEventEmitter.recordEvent(this.investigationId, "skill_sandbox_completed" as any,
        `SANDBOX BLOCKED\n\nSkill: ${skill.name}\nViolations: ${violations.length}`,
        { violations }, "SKILL_SANDBOX");

      return {
        skillId: skill.id,
        config: fullConfig,
        operations: [],
        outputs: {},
        expectedVsActual: [],
        totalCost: 0,
        totalDuration: 0,
        stepCount: 0,
        success: false,
        violations,
        executedAt: Date.now(),
      };
    }

    // Execute the skill
    const startTime = Date.now();
    let execResult: SkillExecutionResult;
    try {
      execResult = await this.executor.execute(skill, state, inputs);
    } catch (err) {
      violations.push(`Execution error: ${err instanceof Error ? err.message : String(err)}`);
      return {
        skillId: skill.id,
        config: fullConfig,
        operations: [],
        outputs: {},
        expectedVsActual: [],
        totalCost: 0,
        totalDuration: Date.now() - startTime,
        stepCount: 0,
        success: false,
        violations,
        executedAt: Date.now(),
      };
    }

    totalDuration = Date.now() - startTime;
    totalCost = execResult.cost;

    // Check budget constraints
    if (totalCost > fullConfig.maxCost) {
      violations.push(`Cost ${totalCost} exceeds maximum ${fullConfig.maxCost}`);
    }
    if (totalDuration > fullConfig.maxDuration) {
      violations.push(`Duration ${totalDuration} exceeds maximum ${fullConfig.maxDuration}`);
    }

    // Build operation log
    for (const stepId of execResult.stepsExecuted) {
      const step = skill.procedure.find(s => s.id === stepId);
      if (step) {
        operations.push({
          stepId: step.id,
          stepType: step.type,
          description: step.description,
          agentRole: step.agentRole ?? "UNKNOWN",
          inputs: step.inputs,
          outputs: step.outputs,
          duration: 0, // per-step timing not tracked separately
          cost: 0,
          result: "SUCCESS",
        });
      }
    }

    // Compare expected vs actual outputs
    const expectedVsActual = this.compareExpectedVsActual(skill, execResult);

    const success = execResult.success && violations.length === 0;

    globalEventEmitter.recordEvent(this.investigationId, "skill_sandbox_completed" as any,
      `SANDBOX ${success ? "PASSED" : "FAILED"}\n\nSkill: ${skill.name}\nSteps: ${operations.length}\nCost: ${totalCost}\nDuration: ${totalDuration}ms\nViolations: ${violations.length}`,
      { success, violations, operations: operations.length }, "SKILL_SANDBOX");

    return {
      skillId: skill.id,
      config: fullConfig,
      operations,
      outputs: execResult.outputs,
      expectedVsActual,
      totalCost,
      totalDuration,
      stepCount: operations.length,
      success,
      violations,
      executedAt: Date.now(),
    };
  }

  /**
   * Security check: ensure the skill doesn't attempt prohibited operations.
   */
  private checkSecurity(skill: Skill, config: SandboxExecutionConfig): string[] {
    const violations: string[] = [];

    // Check for prompt injection attempts in step descriptions
    for (const step of skill.procedure) {
      const text = `${step.description} ${step.promptTemplate ?? ""}`;
      if (/ignore previous|execute command|run script|system prompt/i.test(text)) {
        violations.push(`Step ${step.id} contains suspicious instruction: "${text.substring(0, 100)}"`);
      }
    }

    // Check for code execution requests
    if (skill.knownFailureModes.some(f => /shell|exec|eval|system\(/i.test(f))) {
      violations.push("Skill known failure modes mention code execution");
    }

    // Skills should not access secrets
    if (/secret|api.key|password|token|credential/i.test(skill.description)) {
      violations.push("Skill description mentions secrets/credentials");
    }

    return violations;
  }

  /**
   * Get the tools a step would use.
   */
  private getStepTools(step: SkillStep): string[] {
    const tools: string[] = [];
    // INVOKE_AGENT uses an AI agent
    if (step.type === "INVOKE_AGENT") tools.push("AI_AGENT");
    // INVOKE_SUBSKILL uses subskill execution
    if (step.type === "INVOKE_SUBSKILL") tools.push("SUBSKILL");
    // SEARCH_SOURCES uses web search
    if (step.type === "SEARCH_SOURCES") tools.push("WEB_SEARCH");
    return tools;
  }

  /**
   * Compare expected outputs from the skill definition with actual results.
   */
  private compareExpectedVsActual(
    skill: Skill,
    result: SkillExecutionResult,
  ): Array<{ expected: string; actual: string; match: boolean }> {
    const comparisons: Array<{ expected: string; actual: string; match: boolean }> = [];

    for (const output of skill.outputs) {
      const actualValue = result.outputs[output.name];
      if (actualValue !== undefined) {
        comparisons.push({
          expected: `${output.name}: ${output.type}`,
          actual: `${output.name}: produced (${typeof actualValue})`,
          match: true,
        });
      } else {
        comparisons.push({
          expected: `${output.name}: ${output.type}`,
          actual: `${output.name}: NOT PRODUCED`,
          match: false,
        });
      }
    }

    return comparisons;
  }

  /**
   * Run sandbox test with multiple test cases.
   */
  async runTestSuite(
    skill: Skill,
    state: InvestigationState,
    testCases: Array<{ input: Record<string, unknown>; expectedBehavior: string }>,
    config?: Partial<SandboxExecutionConfig>,
  ): Promise<{ results: SandboxExecutionResult[]; allPassed: boolean }> {
    const results: SandboxExecutionResult[] = [];

    for (const testCase of testCases) {
      const result = await this.run(skill, state, testCase.input, config);
      results.push(result);
    }

    const allPassed = results.every(r => r.success);
    return { results, allPassed };
  }
}
