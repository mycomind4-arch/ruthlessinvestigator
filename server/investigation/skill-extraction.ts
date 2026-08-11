// ─── SKILL EXTRACTION AGENT (Step 8) ──────────────────────────────────────
// Examines successful investigations and extracts reusable investigative procedures.
// This is the core learning mechanism — NOT a summarizer.
// It answers: What procedure was used? Why did it work? When does it apply?

import type {
  Skill,
  SkillStep,
  SkillProvenance,
  SkillCategory,
  SkillInput,
  SkillOutput,
  SkillTest,
} from "./skill-types.js";
import type {
  ExtendedSkillStep,
  ExtendedSkillProvenance,
  ProvenanceMetrics,
  InvestigationPattern,
  SkillExtractionResult,
  ExtractionReasoning,
  SkillCandidateExtended,
  SkillRiskLevel,
} from "./skill-types-extended.js";
import type { InvestigationState, ResearchTask, Evidence, Claim, AgentRole } from "./types.js";
import type { ModelRegistry } from "../providers/registry.js";
import type { AIRequest, AIResponse } from "../providers/types.js";
import { globalEventEmitter } from "./events.js";
import { defaultPerformance, genSkillId } from "./skill-registry.js";

let extractionCounter = 0;

function genExtractionId(): string {
  return `extraction-${Date.now()}-${++extractionCounter}`;
}

// ─── Skill Extraction Agent ──────────────────────────────────────────────────
export class SkillExtractionAgent {
  constructor(
    private modelRegistry: ModelRegistry,
    private investigationId: string,
  ) {}

  /**
   * Examine a completed investigation and extract reusable procedures.
   * This is the main entry point for skill learning.
   */
  async extractFromInvestigation(
    state: InvestigationState,
    patterns: InvestigationPattern[],
  ): Promise<SkillExtractionResult[]> {
    const results: SkillExtractionResult[] = [];

    for (const pattern of patterns) {
      if (!this.isWorthExtracting(pattern)) continue;

      globalEventEmitter.recordEvent(this.investigationId, "skill_extraction_started" as any,
        `EXTRACTION STARTED\n\nPattern: ${pattern.description}\nObserved in: ${pattern.observedInInvestigations.length} investigations\nSuccess rate: ${(pattern.successRate * 100).toFixed(0)}%`,
        { patternId: pattern.id }, "SKILL_EXTRACTOR");

      const extraction = await this.extractPattern(state, pattern);
      if (extraction) {
        results.push(extraction);

        globalEventEmitter.recordEvent(this.investigationId, "skill_extracted" as any,
          `SKILL EXTRACTED\n\nName: ${extraction.skillName}\nPurpose: ${extraction.purpose}\nProcedure steps: ${extraction.procedure.length}\nRisk: ${extraction.riskLevel}`,
          extraction, "SKILL_EXTRACTOR");
      }
    }

    return results;
  }

  /**
   * Determine if a pattern is worth turning into a skill.
   * Not every recurring pattern should become a skill.
   */
  private isWorthExtracting(pattern: InvestigationPattern): boolean {
    // Must have occurred enough times
    if (pattern.occurrenceCount < 1) return false;

    // Must have reasonable success rate
    if (pattern.successRate < 0.5) return false;

    // Must be reproducible
    if (!pattern.reproducible) return false;

    // Must have some evidence yield
    if (pattern.averageEvidenceYield < 1) return false;

    return true;
  }

  /**
   * Extract a structured skill from an observed pattern.
   */
  private async extractPattern(
    state: InvestigationState,
    pattern: InvestigationPattern,
  ): Promise<SkillExtractionResult | null> {
    // Build the extraction prompt
    const prompt = this.buildExtractionPrompt(state, pattern);

    // Get the model's analysis
    let modelResponse: AIResponse;
    try {
      const resolved = this.modelRegistry.resolve("mock/deterministic");
      const request: AIRequest = {
        model: resolved.model.id,
        systemPrompt: this.getExtractionSystemPrompt(),
        prompt,
        maxTokens: 2000,
        temperature: 0.3,
      };
      modelResponse = await resolved.provider.generate(request);
    } catch {
      // If model fails, create a structural extraction from the pattern itself
      return this.structuralExtraction(state, pattern);
    }

    // Parse the model response
    const parsed = this.parseExtractionResponse(modelResponse.text, pattern);
    if (!parsed || parsed.procedure.length === 0) {
      // Fallback to structural extraction from the pattern itself
      return this.structuralExtraction(state, pattern);
    }

    return parsed;
  }

  /**
   * Build the prompt for the extraction agent.
   */
  private buildExtractionPrompt(state: InvestigationState, pattern: InvestigationPattern): string {
    return `You are an investigative skill extractor. Examine the following investigation pattern and extract a reusable, structured investigative procedure.

INVESTIGATION QUESTION: ${state.question}

PATTERN TYPE: ${pattern.type}
PATTERN DESCRIPTION: ${pattern.description}
OBSERVED IN ${pattern.observedInInvestigations.length} INVESTIGATIONS
SUCCESS RATE: ${(pattern.successRate * 100).toFixed(0)}%
AVERAGE EVIDENCE YIELD: ${pattern.averageEvidenceYield}
AVERAGE GAP REDUCTION: ${pattern.averageGapReduction}
REPRODUCIBLE: ${pattern.reproducible}
ADVERSARIAL SURVIVAL: ${pattern.adversarialSurvival}

${pattern.taskSequence ? `TASK SEQUENCE:\n${pattern.taskSequence.map((t, i) => `${i + 1}. ${t}`).join("\n")}` : ""}

${pattern.evidenceTypes ? `EVIDENCE TYPES PRODUCED:\n${pattern.evidenceTypes.join(", ")}` : ""}

${pattern.sourceTypes ? `SOURCE TYPES USED:\n${pattern.sourceTypes.join(", ")}` : ""}

${pattern.agentAssignments ? `SUCCESSFUL AGENTS:\n${pattern.agentAssignments.join(", ")}` : ""}

Based on this pattern, extract a structured investigative skill. Answer:

1. What procedure was used?
2. Why did it work?
3. Under what conditions does it work?
4. What inputs does it require?
5. What outputs does it produce?
6. What evidence validates the procedure?
7. When should it NOT be used?
8. What could cause it to fail?

Respond as JSON:
{
  "skillName": "...",
  "description": "...",
  "purpose": "...",
  "category": "PROCEDURAL|ANALYTICAL|STRATEGIC|META",
  "procedure": [
    {
      "id": "step-1",
      "type": "SEARCH_SOURCES|EXTRACT_EVIDENCE|SYNTHESIZE|...",
      "description": "...",
      "agentRole": "...",
      "inputs": ["..."],
      "outputs": ["..."],
      "dependsOn": []
    }
  ],
  "inputs": [{"name": "...", "type": "...", "required": true, "description": "..."}],
  "outputs": [{"name": "...", "type": "...", "description": "..."}],
  "successCriteria": ["..."],
  "failureCriteria": ["..."],
  "applicableInvestigationTypes": ["..."],
  "knownLimitations": ["..."],
  "riskLevel": "LOW|MODERATE|HIGH|CRITICAL",
  "reasoning": {
    "whatProcedureWasUsed": "...",
    "whyItWorked": "...",
    "conditionsForSuccess": "...",
    "whenNotToUse": "...",
    "potentialFailureModes": ["..."]
  }
}`;
  }

  private getExtractionSystemPrompt(): string {
    return `You are a skill extraction agent for the Ruthless Investigator system. Your job is to examine successful investigative behavior and convert it into a structured, reusable procedure. You must NOT simply summarize the investigation. You must identify the PROCEDURE that was used, WHY it worked, and UNDER WHAT CONDITIONS it applies. Skills are data, not code. Never include executable instructions. Never include shell commands or API calls. Focus on investigative methodology.`;
  }

  /**
   * Parse the extraction response into a SkillExtractionResult.
   */
  private parseExtractionResponse(
    content: string,
    pattern: InvestigationPattern,
  ): SkillExtractionResult | null {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);

      const provenance: ExtendedSkillProvenance = {
        type: "MODEL_PROPOSED",
        originatingInvestigation: this.investigationId,
        createdAt: Date.now(),
        sourceInvestigations: pattern.observedInInvestigations,
        sourceTasks: pattern.taskSequence,
        sourceAgents: pattern.agentAssignments,
        successMetrics: {
          investigationsObserved: pattern.observedInInvestigations.length,
          successRate: pattern.successRate,
          averageEvidenceYield: pattern.averageEvidenceYield,
          averageGapReduction: pattern.averageGapReduction,
          adversarialSurvivalRate: pattern.adversarialSurvival ? 1 : 0,
        },
      };

      return {
        skillName: parsed.skillName ?? `Learned Skill from ${pattern.type}`,
        description: parsed.description ?? pattern.description,
        purpose: parsed.purpose ?? pattern.description,
        category: parsed.category ?? "PROCEDURAL",
        procedure: Array.isArray(parsed.procedure) ? parsed.procedure : [],
        inputs: Array.isArray(parsed.inputs) ? parsed.inputs : [],
        outputs: Array.isArray(parsed.outputs) ? parsed.outputs : [],
        successCriteria: Array.isArray(parsed.successCriteria) ? parsed.successCriteria : [],
        failureCriteria: Array.isArray(parsed.failureCriteria) ? parsed.failureCriteria : [],
        applicableInvestigationTypes: Array.isArray(parsed.applicableInvestigationTypes) ? parsed.applicableInvestigationTypes : [],
        knownLimitations: Array.isArray(parsed.knownLimitations) ? parsed.knownLimitations : [],
        provenance,
        riskLevel: parsed.riskLevel ?? "MODERATE",
        extractionReasoning: {
          whatProcedureWasUsed: parsed.reasoning?.whatProcedureWasUsed ?? "",
          whyItWorked: parsed.reasoning?.whyItWorked ?? "",
          conditionsForSuccess: parsed.reasoning?.conditionsForSuccess ?? "",
          whenNotToUse: parsed.reasoning?.whenNotToUse ?? "",
          potentialFailureModes: Array.isArray(parsed.reasoning?.potentialFailureModes) ? parsed.reasoning.potentialFailureModes : [],
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Fallback: structurally extract from the pattern without LLM.
   */
  private structuralExtraction(
    state: InvestigationState,
    pattern: InvestigationPattern,
  ): SkillExtractionResult {
    const provenance: ExtendedSkillProvenance = {
      type: "MODEL_PROPOSED",
      originatingInvestigation: this.investigationId,
      createdAt: Date.now(),
      sourceInvestigations: pattern.observedInInvestigations,
      sourceTasks: pattern.taskSequence,
      sourceAgents: pattern.agentAssignments,
      successMetrics: {
        investigationsObserved: pattern.observedInInvestigations.length,
        successRate: pattern.successRate,
        averageEvidenceYield: pattern.averageEvidenceYield,
        averageGapReduction: pattern.averageGapReduction,
        adversarialSurvivalRate: pattern.adversarialSurvival ? 1 : 0,
      },
    };

    // Build procedure from the task sequence
    const procedure: ExtendedSkillStep[] = (pattern.taskSequence ?? ["Search", "Extract", "Synthesize"]).map((task, i) => ({
      id: `step-${i + 1}`,
      type: i === 0 ? "SEARCH_SOURCES" : i === 1 ? "EXTRACT_EVIDENCE" : "SYNTHESIZE",
      description: task,
      agentRole: pattern.agentAssignments?.[Math.min(i, (pattern.agentAssignments ?? []).length - 1)] ?? "PRIMARY_SOURCE_RESEARCHER",
      inputs: i === 0 ? ["question"] : [`step-${i}`],
      outputs: [`step-${i + 1}-output`],
      dependsOn: i > 0 ? [`step-${i}`] : [],
    }));

    return {
      skillName: `Learned: ${pattern.type}`,
      description: pattern.description,
      purpose: `Investigative procedure observed in ${pattern.observedInInvestigations.length} investigations with ${(pattern.successRate * 100).toFixed(0)}% success rate`,
      category: pattern.type === "TASK_SEQUENCE" ? "PROCEDURAL" : "ANALYTICAL",
      procedure,
      inputs: [{ name: "question", type: "question", required: true, description: "The investigation question" }],
      outputs: [{ name: "finding", type: "assessment", description: "Investigation findings" }],
      successCriteria: [`Evidence yield > ${pattern.averageEvidenceYield}`, `Success rate > ${(pattern.successRate * 100).toFixed(0)}%`],
      failureCriteria: ["No evidence produced", "Cost exceeds budget"],
      applicableInvestigationTypes: [],
      knownLimitations: [`Only validated in ${pattern.observedInInvestigations.length} investigations`],
      provenance,
      riskLevel: pattern.successRate > 0.7 ? "LOW" : "MODERATE",
      extractionReasoning: {
        whatProcedureWasUsed: pattern.taskSequence?.join(" → ") ?? pattern.description,
        whyItWorked: `Produced ${pattern.averageEvidenceYield} evidence items on average with ${(pattern.successRate * 100).toFixed(0)}% success rate`,
        conditionsForSuccess: `Requires ${pattern.sourceTypes?.join(", ") ?? "appropriate sources"} and ${pattern.agentAssignments?.join(", ") ?? "appropriate agents"}`,
        whenNotToUse: `Do not use when ${pattern.evidenceTypes?.length === 0 ? "no relevant evidence is expected" : "evidence types do not match"}`,
        potentialFailureModes: ["Insufficient sources", "Wrong agent assignment", "Context mismatch"],
      },
    };
  }

  /**
   * Convert an extraction result into a registered Skill.
   */
  extractionToSkill(
    extraction: SkillExtractionResult,
    validationTests: SkillTest[] = [],
  ): Skill {
    const skill: Skill = {
      id: genSkillId(),
      name: extraction.skillName,
      description: extraction.description,
      purpose: extraction.purpose,
      category: extraction.category as SkillCategory,
      inputs: extraction.inputs as SkillInput[],
      outputs: extraction.outputs as SkillOutput[],
      prerequisites: [],
      procedure: extraction.procedure as SkillStep[],
      subskills: [],
      compatibleAgents: extraction.procedure.map(s => s.agentRole).filter((r): r is string => r !== undefined),
      compatibleSources: [],
      validationTests,
      knownFailureModes: extraction.extractionReasoning.potentialFailureModes,
      provenance: {
        type: "MODEL_PROPOSED",
        originatingInvestigation: extraction.provenance.originatingInvestigation,
        createdAt: Date.now(),
        sourceEvidence: extraction.provenance.sourceEvidence,
      },
      version: 1,
      status: "PROPOSED",
      performance: defaultPerformance(),
      versions: [],
      failures: [],
      domain: extraction.applicableInvestigationTypes?.[0],
      maxCompositionDepth: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return skill;
  }
}

// ─── Pattern Detector ────────────────────────────────────────────────────────
// Analyzes completed investigations for recurring successful patterns.
export class PatternDetector {
  constructor(
    private investigationId: string,
  ) {}

  /**
   * Detect patterns from a completed investigation.
   */
  detectPatterns(state: InvestigationState): InvestigationPattern[] {
    const patterns: InvestigationPattern[] = [];

    // 1. Detect successful task sequences
    const taskSequence = this.detectTaskSequencePattern(state);
    if (taskSequence) patterns.push(taskSequence);

    // 2. Detect evidence type patterns
    const evidencePattern = this.detectEvidenceTypePattern(state);
    if (evidencePattern) patterns.push(evidencePattern);

    // 3. Detect source type patterns
    const sourcePattern = this.detectSourceTypePattern(state);
    if (sourcePattern) patterns.push(sourcePattern);

    // 4. Detect successful agent assignments
    const agentPattern = this.detectAgentAssignmentPattern(state);
    if (agentPattern) patterns.push(agentPattern);

    // 5. Detect gap resolution patterns
    const gapPattern = this.detectGapResolutionPattern(state);
    if (gapPattern) patterns.push(gapPattern);

    // 6. Detect contradiction resolution patterns
    const contradictionPattern = this.detectContradictionPattern(state);
    if (contradictionPattern) patterns.push(contradictionPattern);

    return patterns;
  }

  private detectTaskSequencePattern(state: InvestigationState): InvestigationPattern | null {
    const completedTasks = [...state.researchTasks.values()]
      .filter(t => t.status === "COMPLETED")
      .sort((a, b) => a.createdAt - b.createdAt);

    if (completedTasks.length < 2) return null;

    const taskTypes = completedTasks.map(t => t.assignedTo ?? "UNKNOWN");
    const evidenceCount = state.evidence.size;
    const gapCount = state.informationGaps.size;
    const totalGaps = [...state.informationGaps.values()].length;
    const resolvedGaps = [...state.informationGaps.values()].filter(g => g.status !== "OPEN").length;

    return {
      id: `pat-${Date.now()}-seq`,
      type: "TASK_SEQUENCE",
      description: `Task sequence: ${taskTypes.join(" → ")}`,
      observedInInvestigations: [state.id],
      occurrenceCount: 1,
      taskSequence: taskTypes,
      successRate: completedTasks.length > 0 ? 1 : 0,
      averageEvidenceYield: evidenceCount / Math.max(completedTasks.length, 1),
      averageGapReduction: totalGaps > 0 ? resolvedGaps / totalGaps : 0,
      averageCost: state.spentUSD,
      averageDuration: 0,
      reproducible: completedTasks.length >= 2,
      adversarialSurvival: false, // requires cross-investigation validation
      detectedAt: Date.now(),
    };
  }

  private detectEvidenceTypePattern(state: InvestigationState): InvestigationPattern | null {
    const evidenceList = [...state.evidence.values()];
    if (evidenceList.length < 2) return null;

    const typeCounts = new Map<string, number>();
    for (const e of evidenceList) {
      const type = (e as any).type ?? "UNKNOWN";
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    }

    // Find dominant evidence type
    let dominantType = "UNKNOWN";
    let maxCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }

    if (maxCount < 2) return null;

    return {
      id: `pat-${Date.now()}-evid`,
      type: "EVIDENCE_TYPE",
      description: `Dominant evidence type: ${dominantType} (${maxCount} items)`,
      observedInInvestigations: [state.id],
      occurrenceCount: 1,
      evidenceTypes: [dominantType],
      successRate: 1,
      averageEvidenceYield: maxCount,
      averageGapReduction: 0,
      averageCost: 0,
      averageDuration: 0,
      reproducible: true,
      adversarialSurvival: false,
      detectedAt: Date.now(),
    };
  }

  private detectSourceTypePattern(state: InvestigationState): InvestigationPattern | null {
    const sources = [...state.sources.values()];
    if (sources.length < 2) return null;

    const sourceTypes = sources.map(s => (s as any).type ?? "UNKNOWN");
    const uniqueTypes = [...new Set(sourceTypes)];

    return {
      id: `pat-${Date.now()}-src`,
      type: "SOURCE_TYPE",
      description: `Source types: ${uniqueTypes.join(", ")}`,
      observedInInvestigations: [state.id],
      occurrenceCount: 1,
      sourceTypes: uniqueTypes,
      successRate: 1,
      averageEvidenceYield: state.evidence.size / Math.max(sources.length, 1),
      averageGapReduction: 0,
      averageCost: 0,
      averageDuration: 0,
      reproducible: true,
      adversarialSurvival: false,
      detectedAt: Date.now(),
    };
  }

  private detectAgentAssignmentPattern(state: InvestigationState): InvestigationPattern | null {
    const agentRuns = ((state as any).agentRuns ?? []) ?? [];
    if (agentRuns.length < 2) return null;

    const successfulAgents = agentRuns
      .filter((r: any) => r.success)
      .map((r: any) => r.agentRole as string);

    if (successfulAgents.length < 2) return null;

    return {
      id: `pat-${Date.now()}-agent`,
      type: "AGENT_ASSIGNMENT",
      description: `Successful agents: ${successfulAgents.join(", ")}`,
      observedInInvestigations: [state.id],
      occurrenceCount: 1,
      agentAssignments: successfulAgents,
      successRate: successfulAgents.length / agentRuns.length,
      averageEvidenceYield: state.evidence.size / Math.max(successfulAgents.length, 1),
      averageGapReduction: 0,
      averageCost: 0,
      averageDuration: 0,
      reproducible: true,
      adversarialSurvival: false,
      detectedAt: Date.now(),
    };
  }

  private detectGapResolutionPattern(state: InvestigationState): InvestigationPattern | null {
    const gaps = [...state.informationGaps.values()];
    const resolved = gaps.filter(g => g.status !== "OPEN");
    if (resolved.length < 1) return null;

    return {
      id: `pat-${Date.now()}-gap`,
      type: "GAP_RESOLUTION",
      description: `Resolved ${resolved.length} information gaps`,
      observedInInvestigations: [state.id],
      occurrenceCount: 1,
      successRate: gaps.length > 0 ? resolved.length / gaps.length : 0,
      averageEvidenceYield: 0,
      averageGapReduction: gaps.length > 0 ? resolved.length / gaps.length : 0,
      averageCost: 0,
      averageDuration: 0,
      reproducible: true,
      adversarialSurvival: false,
      detectedAt: Date.now(),
    };
  }

  private detectContradictionPattern(state: InvestigationState): InvestigationPattern | null {
    const contradictions = [...state.contradictions.values()];
    if (contradictions.length < 1) return null;

    const resolved = contradictions.filter(c => c.status !== "UNRESOLVED");

    return {
      id: `pat-${Date.now()}-contr`,
      type: "CONTRADICTION_PATTERN",
      description: `Found ${contradictions.length} contradictions, resolved ${resolved.length}`,
      observedInInvestigations: [state.id],
      occurrenceCount: 1,
      successRate: contradictions.length > 0 ? resolved.length / contradictions.length : 0,
      averageEvidenceYield: 0,
      averageGapReduction: 0,
      averageCost: 0,
      averageDuration: 0,
      reproducible: true,
      adversarialSurvival: false,
      detectedAt: Date.now(),
    };
  }

  /**
   * Merge patterns from multiple investigations to find cross-investigation patterns.
   */
  mergePatterns(patterns: InvestigationPattern[]): InvestigationPattern[] {
    const merged: InvestigationPattern[] = [];
    const grouped = new Map<string, InvestigationPattern[]>();

    for (const pattern of patterns) {
      // Group by type + description similarity
      const key = `${pattern.type}:${pattern.description.substring(0, 50)}`;
      const group = grouped.get(key) ?? [];
      group.push(pattern);
      grouped.set(key, group);
    }

    for (const group of grouped.values()) {
      if (group.length < 2) {
        // Still include single patterns
        merged.push(group[0]);
        continue;
      }

      // Merge into a cross-investigation pattern
      const allInvestigations = group.flatMap(p => p.observedInInvestigations);
      const uniqueInvestigations = [...new Set(allInvestigations)];

      merged.push({
        ...group[0],
        id: `pat-${Date.now()}-merged`,
        observedInInvestigations: uniqueInvestigations,
        occurrenceCount: group.length,
        successRate: group.reduce((sum, p) => sum + p.successRate, 0) / group.length,
        averageEvidenceYield: group.reduce((sum, p) => sum + p.averageEvidenceYield, 0) / group.length,
        averageGapReduction: group.reduce((sum, p) => sum + p.averageGapReduction, 0) / group.length,
        averageCost: group.reduce((sum, p) => sum + p.averageCost, 0) / group.length,
        reproducible: group.length >= 2,
        adversarialSurvival: group.some(p => p.adversarialSurvival),
        detectedAt: Date.now(),
      });
    }

    return merged;
  }
}
