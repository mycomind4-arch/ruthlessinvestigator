// ─── INTELLIGENT SKILL COMPOSITION (Steps 14-15) ──────────────────────────
// Composes multiple skills into composite procedures.
// NOT simple concatenation — identifies shared inputs, conflicts, and dependencies.

import type {
  Skill,
  SkillStep,
  SkillDependency,
} from "./skill-types.js";
import type {
  CompositeSkill,
  SkillCompositionPlan,
  SkillGraph,
  SkillGraphNode,
  SkillGraphEdge,
  SkillGraphEdgeType,
  SkillTrustLevel,
  FailureRootCause,
  FailureCategory,
  SkillFailureAnalysis,
} from "./skill-types-extended.js";
import type { InvestigationState } from "./types.js";
import type { SkillRegistry } from "./skill-registry.js";
import { defaultPerformance, genSkillId } from "./skill-registry.js";
import { globalEventEmitter } from "./events.js";

let compositionCounter = 0;

function genCompositionId(): string {
  return `composition-${Date.now()}-${++compositionCounter}`;
}

// ─── Composition Engine ─────────────────────────────────────────────────────
export class SkillCompositionEngine {
  constructor(
    private registry: SkillRegistry,
    private investigationId: string,
  ) {}

  /**
   * Plan a composition of multiple skills.
   * Analyzes shared inputs, conflicts, and dependency ordering.
   */
  planComposition(
    skillIds: string[],
    state: InvestigationState,
  ): SkillCompositionPlan | null {
    const skills = skillIds
      .map(id => this.registry.getSkill(id))
      .filter((s): s is Skill => s !== undefined);

    if (skills.length < 2) return null;

    // Identify shared entities
    const sharedEntities = this.findSharedEntities(skills, state);

    // Identify shared claims
    const sharedClaims = this.findSharedClaims(skills, state);

    // Identify shared evidence
    const sharedEvidence = this.findSharedEvidence(skills, state);

    // Find duplicate tasks (same step type + description)
    const duplicateTasks = this.findDuplicateTasks(skills);

    // Find conflicting assumptions
    const conflictingAssumptions = this.findConflictingAssumptions(skills);

    // Determine execution order based on dependencies
    const executionOrder = this.determineExecutionOrder(skills);

    // Build dependency connections (output → input mapping)
    const dependencyConnections = this.findDependencyConnections(skills);

    // Estimate cost and duration
    const estimatedCost = skills.reduce((sum, s) => sum + s.performance.averageCost, 0);
    const estimatedDuration = skills.reduce((sum, s) => sum + s.performance.averageDuration, 0);

    // Risk assessment
    const riskAssessment = this.assessRisk(skills, duplicateTasks, conflictingAssumptions);

    return {
      componentSkillIds: skillIds,
      executionOrder,
      sharedEntities,
      sharedClaims,
      sharedEvidence,
      duplicateTasks,
      conflictingAssumptions,
      dependencyConnections,
      estimatedCost,
      estimatedDuration,
      riskAssessment,
    };
  }

  /**
   * Compose multiple skills into a CompositeSkill.
   */
  compose(
    skillIds: string[],
    state: InvestigationState,
    name: string,
    description: string,
  ): CompositeSkill | null {
    const plan = this.planComposition(skillIds, state);
    if (!plan) return null;

    const skills = skillIds
      .map(id => this.registry.getSkill(id))
      .filter((s): s is Skill => s !== undefined);

    // Merge procedures in execution order
    const mergedProcedure: SkillStep[] = [];
    let stepCounter = 0;
    const stepMapping = new Map<string, string>(); // original step ID → new step ID

    for (const group of plan.executionOrder) {
      for (const skillId of group) {
        const skill = skills.find(s => s.id === skillId);
        if (!skill) continue;

        for (const step of skill.procedure) {
          const newStepId = `comp-step-${++stepCounter}`;
          stepMapping.set(`${skill.id}:${step.id}`, newStepId);

          const newStep: SkillStep = {
            ...step,
            id: newStepId,
            dependsOn: step.dependsOn?.map(dep =>
              stepMapping.get(`${skill.id}:${dep}`) ?? dep
            ),
          };

          // Add dependency connections from other skills
          for (const conn of plan.dependencyConnections) {
            if (conn.toSkillId === skillId && step.inputs.includes(conn.inputName)) {
              // This step receives input from another skill's output
              const fromSkill = skills.find(s => s.id === conn.fromSkillId);
              if (fromSkill) {
                // Add dependency on the producing step
                for (const fromStep of fromSkill.procedure) {
                  if (fromStep.outputs.includes(conn.outputName)) {
                    const mappedId = stepMapping.get(`${fromSkill.id}:${fromStep.id}`);
                    if (mappedId && !newStep.dependsOn?.includes(mappedId)) {
                      newStep.dependsOn = [...(newStep.dependsOn ?? []), mappedId];
                    }
                  }
                }
              }
            }
          }

          mergedProcedure.push(newStep);
        }
      }
    }

    // Merge inputs and outputs
    const allInputs = skills.flatMap(s => s.inputs);
    const allOutputs = skills.flatMap(s => s.outputs);
    const allCompatibleAgents = [...new Set(skills.flatMap(s => s.compatibleAgents))];
    const allCompatibleSources = [...new Set(skills.flatMap(s => s.compatibleSources))];

    // Build conflict rules
    const conflictRules = plan.conflictingAssumptions.map((conflict, i) => ({
      skillA: skills[i % skills.length].id,
      skillB: skills[(i + 1) % skills.length].id,
      conflict,
      resolution: "REPORT_BOTH" as const,
    }));

    // Build intermediate outputs
    const intermediateOutputs = plan.dependencyConnections.map(conn => ({
      fromSkillId: conn.fromSkillId,
      outputName: conn.outputName,
      toSkillId: conn.toSkillId,
      inputName: conn.inputName,
    }));

    // Final outputs: outputs from the last skills in the execution order
    const finalGroup = plan.executionOrder[plan.executionOrder.length - 1] ?? [];
    const finalSkills = finalGroup.map(id => skills.find(s => s.id === id)).filter((s): s is Skill => s !== undefined);
    const finalOutputs = finalSkills.flatMap(s => s.outputs.map(o => o.name));

    const composite: CompositeSkill = {
      id: genSkillId(),
      name,
      description,
      purpose: `Composite of ${skills.map(s => s.name).join(" + ")}`,
      category: "STRATEGIC",
      inputs: allInputs,
      outputs: allOutputs,
      prerequisites: skills.map(s => ({
        skillId: s.id,
        skillName: s.name,
        required: true,
        description: `Component of ${name}`,
      })),
      procedure: mergedProcedure,
      subskills: skillIds,
      compatibleAgents: allCompatibleAgents,
      compatibleSources: allCompatibleSources,
      validationTests: [],
      knownFailureModes: plan.conflictingAssumptions,
      provenance: {
        type: "COMPOSED",
        originatingInvestigation: this.investigationId,
        createdAt: Date.now(),
      },
      version: 1,
      status: "PROPOSED",
      performance: defaultPerformance(),
      versions: [],
      failures: [],
      maxCompositionDepth: 5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      componentSkills: skillIds,
      executionOrder: plan.executionOrder,
      dependencies: plan.dependencyConnections.map(conn => ({
        fromSkillId: conn.fromSkillId,
        toSkillId: conn.toSkillId,
        type: "PRODUCES_INPUT_FOR" as const,
        description: conn.connectionReason,
      })),
      sharedInputs: plan.sharedEntities,
      intermediateOutputs,
      conflictRules,
      finalOutputs,
    };

    globalEventEmitter.recordEvent(this.investigationId, "skill_composed" as any,
      `SKILL COMPOSED\n\nName: ${name}\nComponents: ${skills.map(s => s.name).join(" + ")}\nSteps: ${mergedProcedure.length}\nShared entities: ${plan.sharedEntities.length}\nConflicts: ${plan.conflictingAssumptions.length}`,
      { plan }, "SKILL_COMPOSER");

    return composite;
  }

  // ─── Analysis Helpers ────────────────────────────────────────────────────

  private findSharedEntities(skills: Skill[], state: InvestigationState): string[] {
    const entitySets = skills.map(s => {
      const entities = s.inputs
        .filter(i => i.type === "entity")
        .map(i => i.name);
      return new Set(entities);
    });

    if (entitySets.length < 2) return [];

    const shared = [...entitySets[0]].filter(e =>
      entitySets.every(set => set.has(e))
    );
    return shared;
  }

  private findSharedClaims(skills: Skill[], state: InvestigationState): string[] {
    const claimTypes = skills.map(s =>
      s.inputs.filter(i => i.type === "claim").map(i => i.name)
    );
    if (claimTypes.length < 2) return [];

    const shared = claimTypes[0].filter(c =>
      claimTypes.every(types => types.includes(c))
    );
    return shared;
  }

  private findSharedEvidence(skills: Skill[], state: InvestigationState): string[] {
    const evidenceTypes = skills.map(s =>
      s.inputs.filter(i => i.type === "evidence").map(i => i.name)
    );
    if (evidenceTypes.length < 2) return [];

    const shared = evidenceTypes[0].filter(e =>
      evidenceTypes.every(types => types.includes(e))
    );
    return shared;
  }

  private findDuplicateTasks(skills: Skill[]): string[] {
    const taskMap = new Map<string, number>();
    for (const skill of skills) {
      for (const step of skill.procedure) {
        const key = `${step.type}:${step.description.substring(0, 50)}`;
        taskMap.set(key, (taskMap.get(key) ?? 0) + 1);
      }
    }
    return [...taskMap.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  }

  private findConflictingAssumptions(skills: Skill[]): string[] {
    const conflicts: string[] = [];
    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        // Check if one skill's output type conflicts with another's assumption
        const a = skills[i];
        const b = skills[j];
        if (a.knownFailureModes.some(f => b.name.includes(f.substring(0, 10)))) {
          conflicts.push(`${a.name} failure mode may conflict with ${b.name}`);
        }
      }
    }
    return conflicts;
  }

  /**
   * Determine the execution order of skills based on their inputs/outputs.
   * Skills that produce inputs for other skills should run first.
   */
  determineExecutionOrder(skills: Skill[]): string[][] {
    // Build dependency graph: skill A must run before skill B if A produces an output B needs
    const deps = new Map<string, Set<string>>();
    for (const skill of skills) deps.set(skill.id, new Set());

    for (let i = 0; i < skills.length; i++) {
      for (let j = 0; j < skills.length; j++) {
        if (i === j) continue;
        const a = skills[i];
        const b = skills[j];
        // If A produces output that B needs as input, A must run first
        for (const output of a.outputs) {
          for (const input of b.inputs) {
            if (output.type === input.type && output.name === input.name) {
              deps.get(b.id)!.add(a.id);
            }
          }
        }
      }
    }

    // Topological sort with parallel groups
    const order: string[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(skills.map(s => s.id));

    while (remaining.size > 0) {
      const ready: string[] = [];
      for (const id of remaining) {
        const depsForId = deps.get(id)!;
        if ([...depsForId].every(d => completed.has(d))) {
          ready.push(id);
        }
      }

      if (ready.length === 0) {
        // Circular dependency — just add remaining in any order
        order.push([...remaining]);
        break;
      }

      order.push(ready);
      for (const id of ready) {
        completed.add(id);
        remaining.delete(id);
      }
    }

    return order;
  }

  private findDependencyConnections(skills: Skill[]): Array<{
    fromSkillId: string;
    outputName: string;
    toSkillId: string;
    inputName: string;
    connectionReason: string;
  }> {
    const connections: Array<{
      fromSkillId: string;
      outputName: string;
      toSkillId: string;
      inputName: string;
      connectionReason: string;
    }> = [];

    for (let i = 0; i < skills.length; i++) {
      for (let j = 0; j < skills.length; j++) {
        if (i === j) continue;
        const a = skills[i];
        const b = skills[j];
        for (const output of a.outputs) {
          for (const input of b.inputs) {
            if (output.type === input.type) {
              connections.push({
                fromSkillId: a.id,
                outputName: output.name,
                toSkillId: b.id,
                inputName: input.name,
                connectionReason: `${a.name} produces ${output.name} which ${b.name} needs as ${input.name}`,
              });
            }
          }
        }
      }
    }

    return connections;
  }

  private assessRisk(skills: Skill[], duplicateTasks: string[], conflicts: string[]): string {
    const risks: string[] = [];
    if (duplicateTasks.length > 0) {
      risks.push(`${duplicateTasks.length} duplicate tasks detected — may waste resources`);
    }
    if (conflicts.length > 0) {
      risks.push(`${conflicts.length} conflicting assumptions — results may be inconsistent`);
    }
    const totalCost = skills.reduce((sum, s) => sum + s.performance.averageCost, 0);
    if (totalCost > 5.0) {
      risks.push(`High estimated cost: ${totalCost}`);
    }
    if (risks.length === 0) return "LOW";
    if (risks.length <= 2) return "MODERATE";
    return "HIGH";
  }
}

// ─── SKILL GRAPH (Step 18) ──────────────────────────────────────────────────
export class SkillGraphBuilder {
  constructor(
    private registry: SkillRegistry,
  ) {}

  /**
   * Build the skill relationship graph from the registry.
   */
  buildGraph(): SkillGraph {
    const allSkills = this.registry.getAllSkills();
    const nodes: SkillGraphNode[] = [];
    const edges: SkillGraphEdge[] = [];

    for (const skill of allSkills) {
      nodes.push({
        skillId: skill.id,
        name: skill.name,
        category: skill.category,
        status: skill.status,
        trustLevel: this.inferTrustLevel(skill),
        performance: skill.performance,
      });

      // Add edges from prerequisites
      for (const dep of skill.prerequisites) {
        edges.push({
          fromSkillId: skill.id,
          toSkillId: dep.skillId,
          type: "REQUIRES",
          description: dep.description,
        });
      }

      // Add edges from subskills
      for (const subId of skill.subskills) {
        edges.push({
          fromSkillId: skill.id,
          toSkillId: subId,
          type: "COMPOSED_FROM",
          description: `Subskill of ${skill.name}`,
        });
      }

      // Add edges from versions
      for (const version of skill.versions) {
        // Find the skill with this version number
        const olderVersion = allSkills.find(s =>
          s.name === skill.name && s.version === version.version
        );
        if (olderVersion) {
          edges.push({
            fromSkillId: skill.id,
            toSkillId: olderVersion.id,
            type: "IMPROVES",
            description: version.changeReason,
          });
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Find all skills related to a given skill.
   */
  findRelated(skillId: string): SkillGraphEdge[] {
    const graph = this.buildGraph();
    return graph.edges.filter(e => e.fromSkillId === skillId || e.toSkillId === skillId);
  }

  /**
   * Find the shortest path between two skills in the graph.
   */
  findPath(fromSkillId: string, toSkillId: string): string[] | null {
    const graph = this.buildGraph();
    const adj = new Map<string, string[]>();

    for (const edge of graph.edges) {
      const list = adj.get(edge.fromSkillId) ?? [];
      list.push(edge.toSkillId);
      adj.set(edge.fromSkillId, list);
    }

    // BFS
    const queue: Array<{ id: string; path: string[] }> = [{ id: fromSkillId, path: [fromSkillId] }];
    const visited = new Set<string>([fromSkillId]);

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      if (id === toSkillId) return path;

      const neighbors = adj.get(id) ?? [];
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push({ id: next, path: [...path, next] });
        }
      }
    }

    return null;
  }

  private inferTrustLevel(skill: Skill): SkillTrustLevel {
    if (skill.status === "DEPRECATED") return "DEPRECATED";
    if (skill.status === "DISABLED") return "SUSPENDED";
    if (skill.status === "REJECTED" || skill.status === "FAILED") return "UNTRUSTED";
    if (skill.status === "PROPOSED" || skill.status === "SANDBOXED") return "EXPERIMENTAL";
    if (skill.status === "TESTING" || skill.status === "VALIDATED") return "PROVISIONAL";
    if (skill.status === "ACTIVE") return "TRUSTED";
    return "UNTRUSTED";
  }
}

// ─── SKILL SPECIALIZATION & GENERALIZATION (Steps 16-17) ──────────────────
export class SkillSpecializationEngine {
  constructor(
    private registry: SkillRegistry,
    private investigationId: string,
  ) {}

  /**
   * Detect if a general skill should be specialized for a domain.
   */
  detectSpecialization(
    skill: Skill,
    domainUsage: Map<string, { count: number; successRate: number; avgEvidenceYield: number }>,
  ): { shouldSpecialize: boolean; domain: string; reason: string } | null {
    // Look for a domain where this skill has significantly better or worse performance
    const overallSuccessRate = skill.performance.usageCount > 0
      ? skill.performance.successCount / skill.performance.usageCount
      : 0;

    for (const [domain, stats] of domainUsage) {
      if (stats.count < 3) continue; // need at least 3 uses in this domain

      const domainSuccessRate = stats.successRate;
      // If domain performance is significantly different from overall
      if (Math.abs(domainSuccessRate - overallSuccessRate) > 0.2) {
        const reason = domainSuccessRate > overallSuccessRate
          ? `Skill performs ${(domainSuccessRate * 100).toFixed(0)}% success in ${domain} vs ${(overallSuccessRate * 100).toFixed(0)}% overall — specialization may improve performance`
          : `Skill performs poorly in ${domain} (${(domainSuccessRate * 100).toFixed(0)}% success) — a specialized version may avoid known failure modes`;

        return {
          shouldSpecialize: true,
          domain,
          reason,
        };
      }
    }

    return null;
  }

  /**
   * Create a specialized version of a skill for a specific domain.
   */
  specialize(
    parentSkill: Skill,
    domain: string,
    modifications?: Partial<Skill>,
  ): Skill {
    const specialized: Skill = {
      ...parentSkill,
      id: genSkillId(),
      name: `${parentSkill.name} — ${domain}`,
      description: `${parentSkill.description} (Specialized for ${domain})`,
      domain,
      version: 1,
      status: "PROPOSED",
      performance: defaultPerformance(),
      versions: [],
      failures: [],
      provenance: {
        ...parentSkill.provenance,
        type: "MODEL_IMPROVED",
        createdAt: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...modifications,
    };

    globalEventEmitter.recordEvent(this.investigationId, "skill_specialized" as any,
      `SKILL SPECIALIZED\n\nParent: ${parentSkill.name}\nSpecialized: ${specialized.name}\nDomain: ${domain}`,
      { parentSkillId: parentSkill.id, specializedId: specialized.id, domain }, "SKILL_SPECIALIZER");

    return specialized;
  }

  /**
   * Detect if multiple specialized skills can be generalized.
   */
  detectGeneralization(skillNames: string[]): { shouldGeneralize: boolean; commonStructure: string; reason: string } | null {
    const skills = skillNames
      .map(n => this.registry.getSkillByName(n))
      .filter((s): s is Skill => s !== undefined);

    if (skills.length < 2) return null;

    // Check if they share the same procedure structure
    const structureSignatures = skills.map(s =>
      s.procedure.map(step => step.type).join(" → ")
    );

    const allSame = structureSignatures.every(sig => sig === structureSignatures[0]);
    if (!allSame) return null;

    // Check if they have the same category
    const allSameCategory = skills.every(s => s.category === skills[0].category);
    if (!allSameCategory) return null;

    // Check if they share compatible agents
    const sharedAgents = skills[0].compatibleAgents.filter(agent =>
      skills.every(s => s.compatibleAgents.includes(agent))
    );

    if (sharedAgents.length === 0) return null;

    const reason = `${skills.length} specialized skills share the same procedure structure (${structureSignatures[0]}) — can be generalized`;

    return {
      shouldGeneralize: true,
      commonStructure: structureSignatures[0],
      reason,
    };
  }

  /**
   * Create a generalized skill from multiple specialized skills.
   */
  generalize(
    childSkills: Skill[],
    generalizedName: string,
  ): Skill | null {
    if (childSkills.length < 2) return null;

    // Use the first skill as a template
    const template = childSkills[0];

    const generalized: Skill = {
      ...template,
      id: genSkillId(),
      name: generalizedName,
      description: `Generalized from ${childSkills.length} specialized skills: ${childSkills.map(s => s.name).join(", ")}`,
      purpose: `General procedure extracted from ${childSkills.map(s => s.domain ?? s.name).join(", ")}`,
      domain: undefined,
      version: 1,
      status: "PROPOSED",
      performance: defaultPerformance(),
      versions: [],
      failures: [],
      provenance: {
        type: "MODEL_IMPROVED",
        createdAt: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    globalEventEmitter.recordEvent(this.investigationId, "skill_generalized" as any,
      `SKILL GENERALIZED\n\nFrom: ${childSkills.map(s => s.name).join(", ")}\nGeneral: ${generalizedName}`,
      { childSkillIds: childSkills.map(s => s.id), generalizedId: generalized.id }, "SKILL_GENERALIZER");

    return generalized;
  }
}

// ─── SKILL FAILURE ANALYSIS (Step 19) ───────────────────────────────────────
let failureAnalysisCounter = 0;

export class SkillFailureAnalyzer {
  constructor(
    private registry: SkillRegistry,
    private investigationId: string,
  ) {}

  /**
   * Analyze a skill failure to determine root cause and recommend changes.
   */
  analyze(failure: import("./skill-types.js").SkillFailure): import("./skill-types-extended.js").SkillFailureAnalysis {
    const rootCause = this.determineRootCause(failure);
    const category = this.categorizeFailure(failure, rootCause);
    const analysis = this.buildAnalysis(failure, rootCause, category);
    const recommendedChanges = this.recommendChanges(failure, rootCause, category);
    const newVersionNeeded = this.isNewVersionNeeded(failure, rootCause);

    const result = {
      id: `sfa-${Date.now()}-${++failureAnalysisCounter}`,
      failure,
      rootCause,
      category,
      analysis,
      recommendedChanges,
      newVersionNeeded,
      confidenceInAnalysis: this.estimateConfidence(failure, rootCause),
      analyzedAt: Date.now(),
    };

    globalEventEmitter.recordEvent(this.investigationId, "skill_failure_analyzed" as any,
      `FAILURE ANALYZED\n\nSkill: ${failure.skillId}\nRoot cause: ${rootCause}\nCategory: ${category}\nNew version needed: ${newVersionNeeded}`,
      result, "SKILL_FAILURE_ANALYZER");

    return result;
  }

  private determineRootCause(failure: import("./skill-types.js").SkillFailure): import("./skill-types-extended.js").FailureRootCause {
    // Analyze the failure to determine root cause
    if (failure.failureType === "EXECUTION_ERROR") return "TOOL_LIMITATION";
    if (failure.failureType === "DEPENDENCY_FAILED") return "WRONG_PREREQUISITE";
    if (failure.failureType === "MISSING_EVIDENCE") return "INSUFFICIENT_EVIDENCE";
    if (failure.failureType === "TIMEOUT") return "BAD_SEQUENCING";
    if (failure.failureType === "BUDGET_EXCEEDED") return "TOOL_LIMITATION";
    if (failure.failureType === "FALSE_POSITIVE" || failure.failureType === "FALSE_NEGATIVE") return "OVERFITTING";

    if (/source|primary|secondary/i.test(failure.possibleCause)) return "WRONG_SOURCE";
    if (/agent|role/i.test(failure.possibleCause)) return "WRONG_AGENT";
    if (/sequence|order/i.test(failure.possibleCause)) return "BAD_SEQUENCING";
    if (/assumption|premise/i.test(failure.possibleCause)) return "INCORRECT_ASSUMPTION";
    if (/contamin|same source|dependency/i.test(failure.possibleCause)) return "SOURCE_CONTAMINATION";

    return "UNKNOWN";
  }

  private categorizeFailure(
    failure: import("./skill-types.js").SkillFailure,
    rootCause: import("./skill-types-extended.js").FailureRootCause,
  ): import("./skill-types-extended.js").FailureCategory {
    if (rootCause === "WRONG_PREREQUISITE" || rootCause === "BAD_SEQUENCING") return "STRUCTURAL";
    if (rootCause === "WRONG_SOURCE" || rootCause === "INSUFFICIENT_EVIDENCE") return "CONTEXTUAL";
    if (rootCause === "TOOL_LIMITATION" || failure.failureType === "BUDGET_EXCEEDED") return "RESOURCE";
    if (rootCause === "INCORRECT_ASSUMPTION" || rootCause === "OVERFITTING") return "EPISTEMIC";
    if (rootCause === "SOURCE_CONTAMINATION") return "EPISTEMIC";
    return "ENVIRONMENTAL";
  }

  private buildAnalysis(
    failure: import("./skill-types.js").SkillFailure,
    rootCause: import("./skill-types-extended.js").FailureRootCause,
    category: import("./skill-types-extended.js").FailureCategory,
  ): string {
    return `Failure in skill ${failure.skillId} v${failure.skillVersion} during investigation ${failure.investigationId}.\n\n` +
      `Type: ${failure.failureType}\n` +
      `Root cause: ${rootCause}\n` +
      `Category: ${category}\n` +
      `Expected: ${failure.expectedBehavior}\n` +
      `Observed: ${failure.observedBehavior}\n` +
      `Possible cause: ${failure.possibleCause}\n` +
      `Recoverable: ${failure.recoverable ? "Yes" : "No"}`;
  }

  private recommendChanges(
    failure: import("./skill-types.js").SkillFailure,
    rootCause: import("./skill-types-extended.js").FailureRootCause,
    _category: import("./skill-types-extended.js").FailureCategory,
  ): string[] {
    const changes: string[] = [];

    if (failure.recommendedChange) changes.push(failure.recommendedChange);

    switch (rootCause) {
      case "WRONG_PREREQUISITE":
        changes.push("Review and update prerequisite skills");
        changes.push("Add prerequisite check before execution");
        break;
      case "WRONG_SOURCE":
        changes.push("Update source selection criteria");
        changes.push("Add source quality verification step");
        break;
      case "WRONG_AGENT":
        changes.push("Reassign step to a different agent role");
        break;
      case "INSUFFICIENT_EVIDENCE":
        changes.push("Add additional evidence collection steps");
        changes.push("Lower expected evidence threshold or add fallback");
        break;
      case "INCORRECT_ASSUMPTION":
        changes.push("Review and document assumptions explicitly");
        changes.push("Add assumption validation step");
        break;
      case "BAD_SEQUENCING":
        changes.push("Reorder procedure steps");
        changes.push("Add explicit dependency annotations");
        break;
      case "OVERFITTING":
        changes.push("Add adversarial test cases");
        changes.push("Diversify training scenarios");
        break;
      case "SOURCE_CONTAMINATION":
        changes.push("Add source independence verification");
        changes.push("Trace source lineage before accepting evidence");
        break;
      default:
        changes.push("Investigate and document the failure mode");
    }

    return [...new Set(changes)]; // deduplicate
  }

  private isNewVersionNeeded(
    failure: import("./skill-types.js").SkillFailure,
    rootCause: import("./skill-types-extended.js").FailureRootCause,
  ): boolean {
    if (!failure.recoverable) return false;
    if (rootCause === "TOOL_LIMITATION") return false;
    return true;
  }

  private estimateConfidence(
    _failure: import("./skill-types.js").SkillFailure,
    rootCause: import("./skill-types-extended.js").FailureRootCause,
  ): number {
    if (rootCause === "UNKNOWN") return 0.3;
    if (rootCause === "TOOL_LIMITATION") return 0.9;
    return 0.7;
  }
}
