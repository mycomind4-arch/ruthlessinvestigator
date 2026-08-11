// ─── SKILL EXECUTOR ────────────────────────────────────────────────────────
// Executes skills by running their structured procedure steps.
// Each step invokes the appropriate agent or subskill.
// Directive 05 / Skill Foundry.

import type {
  Skill,
  SkillStep,
  SkillExecutionResult,
  SkillStepType,
  SkillFailure,
} from "./skill-types.js";
import { SKILL_FOUNDRY_LIMITS } from "./skill-types.js";
import type { InvestigationState, AgentRole, Evidence, Claim, InvestigationSource } from "./types.js";
import type { AIProvider, AIRequest, AIResponse } from "../providers/types.js";
import type { ModelRegistry } from "../providers/registry.js";
import type { SkillRegistry } from "./skill-registry.js";
import { globalEventEmitter } from "./events.js";

let execCounter = 0;
let failureCounter = 0;

function genExecId(): string { return `exec-${Date.now()}-${++execCounter}`; }
function genFailureId(): string { return `sf-${Date.now()}-${++failureCounter}`; }

export class SkillExecutor {
  constructor(
    private registry: SkillRegistry,
    private modelRegistry: ModelRegistry,
    private investigationId: string,
  ) {}

  async execute(
    skill: Skill,
    state: InvestigationState,
    inputs: Record<string, unknown>,
    agentRoleMap?: Record<string, string>,
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const result: SkillExecutionResult = {
      skillId: skill.id,
      skillVersion: skill.version,
      investigationId: this.investigationId,
      inputs,
      stepsExecuted: [],
      outputs: {},
      evidenceCreated: [],
      claimsCreated: [],
      sourcesDiscovered: [],
      subskillsExecuted: [],
      failures: [],
      warnings: [],
      duration: 0,
      cost: 0,
      success: true,
      executedAt: Date.now(),
    };

    // Emit skill execution started event
    this.emitEvent("skill_execution_started", `Skill execution started: ${skill.name} v${skill.version}`, {
      skillId: skill.id,
      skillName: skill.name,
      version: skill.version,
    });

    // Check execution time limit
    const deadline = startTime + SKILL_FOUNDRY_LIMITS.maxSkillExecutionTime;

    try {
      // Execute each step in order, respecting dependencies
      const completedSteps = new Set<string>();
      const stepsById = new Map(skill.procedure.map(s => [s.id, s]));
      const remaining = [...skill.procedure];

      while (remaining.length > 0) {
        if (Date.now() > deadline) {
          result.warnings.push("Skill execution exceeded time limit");
          break;
        }

        // Find next step whose dependencies are met
        const stepIdx = remaining.findIndex(step =>
          !step.dependsOn || step.dependsOn.every(dep => completedSteps.has(dep))
        );

        if (stepIdx === -1) {
          result.warnings.push("Could not resolve step dependencies — remaining steps skipped");
          break;
        }

        const step = remaining.splice(stepIdx, 1)[0];

        // Emit step started
        this.emitEvent("skill_step_started", `Step: ${step.description}`, {
          skillId: skill.id,
          stepId: step.id,
          stepType: step.type,
        });

        try {
          const stepResult = await this.executeStep(skill, step, state, inputs, result, agentRoleMap);

          result.stepsExecuted.push(step.id);

          if (stepResult.evidenceIds.length > 0) {
            result.evidenceCreated.push(...stepResult.evidenceIds);
            this.emitEvent("skill_evidence_created", `Evidence created by step: ${step.description}`, {
              stepId: step.id,
              evidenceIds: stepResult.evidenceIds,
            });
          }
          if (stepResult.claimIds.length > 0) {
            result.claimsCreated.push(...stepResult.claimIds);
            this.emitEvent("skill_claim_created", `Claim created by step: ${step.description}`, {
              stepId: step.id,
              claimIds: stepResult.claimIds,
            });
          }
          if (stepResult.sourceIds.length > 0) {
            result.sourcesDiscovered.push(...stepResult.sourceIds);
          }

          result.cost += stepResult.cost;

          // Emit step completed
          this.emitEvent("skill_step_completed", `Step completed: ${step.description}`, {
            stepId: step.id,
            duration: stepResult.duration,
          });

          completedSteps.add(step.id);
        } catch (err) {
          result.failures.push(`Step ${step.id} (${step.type}): ${err instanceof Error ? err.message : String(err)}`);
          result.success = false;

          // Record failure
          const failure: SkillFailure = {
            id: genFailureId(),
            skillId: skill.id,
            skillVersion: skill.version,
            investigationId: this.investigationId,
            failureType: "EXECUTION_ERROR",
            expectedBehavior: step.expectedOutput ?? "Step should complete successfully",
            observedBehavior: err instanceof Error ? err.message : String(err),
            evidence: [],
            possibleCause: "Step execution error",
            recoverable: true,
            recommendedChange: `Review step ${step.id} procedure and adjust`,
            createdAt: Date.now(),
          };
          this.registry.recordFailure(failure);

          this.emitEvent("skill_execution_failed", `Step failed: ${step.description}`, {
            stepId: step.id,
            error: err instanceof Error ? err.message : String(err),
          });

          // If step is required (no dependsOn from other steps that need it), stop
          // For now, continue with remaining steps
        }
      }

      // Update performance
      result.duration = Date.now() - startTime;
      this.registry.recordExecution(
        skill.id,
        result.success,
        result.duration,
        result.cost,
        result.evidenceCreated.length,
        result.claimsCreated.length,
        this.investigationId,
      );

      // Emit completion
      this.emitEvent("skill_execution_completed", `Skill completed: ${skill.name} v${skill.version}`, {
        skillId: skill.id,
        success: result.success,
        duration: result.duration,
        cost: result.cost,
        evidenceCreated: result.evidenceCreated.length,
        claimsCreated: result.claimsCreated.length,
      });

    } catch (err) {
      result.success = false;
      result.duration = Date.now() - startTime;
      result.failures.push(err instanceof Error ? err.message : String(err));

      this.emitEvent("skill_execution_failed", `Skill execution failed: ${skill.name}`, {
        skillId: skill.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return result;
  }

  // ─── Step Execution ──────────────────────────────────────────────────────
  private async executeStep(
    skill: Skill,
    step: SkillStep,
    state: InvestigationState,
    inputs: Record<string, unknown>,
    result: SkillExecutionResult,
    agentRoleMap?: Record<string, string>,
  ): Promise<{ evidenceIds: string[]; claimIds: string[]; sourceIds: string[]; cost: number; duration: number; outputValue?: unknown }> {
    this.stepStartTime = Date.now();

    switch (step.type) {
      case "INVOKE_SUBSKILL":
        return this.invokeSubskill(skill, step, state, inputs, result);
      case "INVOKE_AGENT":
      case "SEARCH_SOURCES":
      case "EXTRACT_EVIDENCE":
      case "ANALYZE_CLAIM":
      case "COMPARE_SOURCES":
      case "VERIFY_INDEPENDENCE":
      case "RECONSTRUCT_TIMELINE":
      case "RESOLVE_ENTITY":
      case "INVESTIGATE_RELATIONSHIP":
      case "TEST_PREDICTION":
      case "IDENTIFY_CONTRADICTION":
      case "RESOLVE_CONTRADICTION":
      case "ANALYZE_CAUSALITY":
      case "CHECK_NARRATIVE":
      case "CLASSIFY_STATUS":
      case "GENERATE_HYPOTHESIS":
      case "SYNTHESIZE":
      case "RECORD_FINDING":
      case "VALIDATE_OUTPUT":
        return this.invokeAgent(skill, step, state, inputs, agentRoleMap);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  // ─── Invoke Subskill ───────────────────────────────────────────────────────
  private async invokeSubskill(
    parentSkill: Skill,
    step: SkillStep,
    state: InvestigationState,
    inputs: Record<string, unknown>,
    result: SkillExecutionResult,
  ): Promise<{ evidenceIds: string[]; claimIds: string[]; sourceIds: string[]; cost: number; duration: number; outputValue?: unknown }> {
    if (!step.subskillId) {
      return { evidenceIds: [], claimIds: [], sourceIds: [], cost: 0, duration: 0 };
    }

    const subskill = this.registry.getSkill(step.subskillId);
    if (!subskill) {
      result.warnings.push(`Subskill not found: ${step.subskillId}`);
      return { evidenceIds: [], claimIds: [], sourceIds: [], cost: 0, duration: 0 };
    }

    if (subskill.status !== "ACTIVE" && subskill.status !== "VALIDATED") {
      result.warnings.push(`Subskill ${subskill.name} is not active (status: ${subskill.status})`);
      return { evidenceIds: [], claimIds: [], sourceIds: [], cost: 0, duration: 0 };
    }

    this.emitEvent("skill_subskill_invoked", `Invoking subskill: ${subskill.name}`, {
      parentSkillId: parentSkill.id,
      subskillId: subskill.id,
    });

    const subResult = await this.execute(subskill, state, inputs);
    result.subskillsExecuted.push({ skillId: subskill.id, result: subResult });

    return {
      evidenceIds: subResult.evidenceCreated,
      claimIds: subResult.claimsCreated,
      sourceIds: subResult.sourcesDiscovered,
      cost: subResult.cost,
      duration: subResult.duration,
    };
  }

  // ─── Invoke Agent ──────────────────────────────────────────────────────────
  private async invokeAgent(
    skill: Skill,
    step: SkillStep,
    state: InvestigationState,
    inputs: Record<string, unknown>,
    agentRoleMap?: Record<string, string>,
  ): Promise<{ evidenceIds: string[]; claimIds: string[]; sourceIds: string[]; cost: number; duration: number; outputValue?: unknown }> {
    const role = (step.agentRole ?? "EVIDENCE_ANALYST") as AgentRole;
    const modelId = agentRoleMap?.[role] ?? "mock/deterministic";

    const { model, provider } = this.modelRegistry.resolve(modelId);

    const prompt = this.buildPrompt(skill, step, state, inputs);

    const request: AIRequest = {
      systemPrompt: `You are executing step "${step.description}" of skill "${skill.name}". Follow the procedure precisely.`,
      prompt,
      model: model.model,
      jsonMode: true,
      taskLabel: `skill-${skill.name}-${step.type}`,
      temperature: 0.5,
      maxTokens: 4096,
    };

    const response = await provider.generate(request);

    const evidenceIds: string[] = [];
    const claimIds: string[] = [];
    const sourceIds: string[] = [];

    // Parse response and extract evidence/claims/sources
    const parsed = (response.json ?? this.tryParse(response.text)) as Record<string, unknown> | null;

    if (parsed) {
      // Extract sources
      if (Array.isArray(parsed.sources)) {
        for (const src of parsed.sources as Array<Record<string, unknown>>) {
          const sourceId = `skill-src-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          const source: InvestigationSource = {
            id: sourceId,
            title: (src.source as string) ?? "Unknown source",
            sourceType: ((src.source_type as string) ?? "SECONDARY_REPORT") as any,
            quality: { authority: 0.5, proximity: 0.5, specificity: 0.5, independence: 0.5, transparency: 0.5, recency: 0.5, trackRecord: 0.5 },
            citedBy: [],
            cites: [],
            isPrimary: (src.is_primary as boolean) ?? false,
            addedBy: `SKILL:${skill.name}`,
            addedAt: Date.now(),
          };
          state.sources.set(sourceId, source);
          sourceIds.push(sourceId);
        }
      }

      // Extract evidence
      if (Array.isArray(parsed.key_facts)) {
        for (const fact of parsed.key_facts as string[]) {
          const evidenceId = `skill-ev-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          const evidence: Evidence = {
            id: evidenceId,
            text: fact,
            type: "OBSERVATION" as const,
            sourceId: sourceIds[0] ?? "unknown",
            extractedBy: `SKILL:${skill.name}`,
            extractedAt: Date.now(),
            independentConfirmation: false,
            rootSourceIds: [],
          };
          state.evidence.set(evidenceId, evidence);
          evidenceIds.push(evidenceId);
        }
      }

      // Extract claims
      if (Array.isArray(parsed.claims)) {
        for (const claim of parsed.claims as Array<Record<string, unknown>>) {
          const claimId = `skill-claim-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          const c: Claim = {
            id: claimId,
            text: (claim.text as string) ?? "",
            type: ((claim.type as string) ?? "FACTUAL") as any,
            supportingEvidence: [],
            contradictingEvidence: [],
            status: "UNVERIFIED",
            // sourceIds tracked separately
            supportingEvidence: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          state.claims.set(claimId, c);
          claimIds.push(claimId);
        }
      }

    }
    return {
      evidenceIds,
      claimIds,
      sourceIds,
      cost: 0, // mock provider has no cost
      duration: Date.now() - (this.stepStartTime ?? Date.now()),
    };
  }

  private stepStartTime: number | null = null;

  // ─── Prompt Builder ────────────────────────────────────────────────────────
  private buildPrompt(
    skill: Skill,
    step: SkillStep,
    state: InvestigationState,
    inputs: Record<string, unknown>,
  ): string {
    if (step.promptTemplate) {
      return step.promptTemplate
        .replace("{question}", state.question)
        .replace("{step_description}", step.description)
        .replace("{inputs}", JSON.stringify(inputs, null, 2));
    }

    const parts: string[] = [];
    parts.push(`Investigation: ${state.question}`);
    parts.push(`Skill: ${skill.name} — ${skill.description}`);
    parts.push(`Step: ${step.description} (${step.type})`);
    if (step.expectedOutput) parts.push(`Expected output: ${step.expectedOutput}`);

    // Include relevant state
    if (state.hypotheses.size > 0) {
      parts.push(`\nHypotheses:\n${[...state.hypotheses.values()].map(h => `- ${h.statement} (${h.supportLevel})`).join("\n")}`);
    }
    if (state.evidence.size > 0) {
      const recentEvidence = [...state.evidence.values()].slice(-10);
      parts.push(`\nRecent evidence:\n${recentEvidence.map(e => `- ${e.text}`).join("\n")}`);
    }

    parts.push(`\nInputs: ${JSON.stringify(inputs)}`);

    switch (step.type) {
      case "SEARCH_SOURCES":
        parts.push("\nFind and return sources relevant to this step. Output JSON: {sources: [{source, url, source_type, is_primary, key_facts: [string], cites?}]}");
        break;
      case "EXTRACT_EVIDENCE":
        parts.push("\nExtract key evidence from the available information. Output JSON: {key_facts: [string], sources: [{source, source_type, is_primary}]}");
        break;
      case "ANALYZE_CLAIM":
        parts.push("\nAnalyze the claim. Output JSON: {claims: [{text, type, status}], finding: string}");
        break;
      case "COMPARE_SOURCES":
        parts.push("\nCompare the sources. Output JSON: {comparison: string, contradictions: [string], agreements: [string]}");
        break;
      case "CLASSIFY_STATUS":
        parts.push("\nClassify the status. Output JSON: {classification: string, evidence_basis: string, confidence: number}");
        break;
      case "SYNTHESIZE":
        parts.push("\nSynthesize findings. Output JSON: {output: string, key_findings: [string], confidence: string}");
        break;
      default:
        parts.push("\nPerform the step and output JSON: {output: string, finding: string}");
    }

    return parts.join("\n");
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private tryParse(text: string): Record<string, unknown> | null {
    try {
      // Try to extract JSON from text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return null;
    } catch {
      return null;
    }
  }

  private emitEvent(type: string, message: string, details?: unknown): void {
    globalEventEmitter.recordEvent(this.investigationId, type as any, message, details, "SKILL_EXECUTOR");
  }
}
