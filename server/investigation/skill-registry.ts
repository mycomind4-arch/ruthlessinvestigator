// ─── SKILL REGISTRY ────────────────────────────────────────────────────────
// Persistent storage and discovery for investigative skills.
// Directive 05 / Skill Foundry.

import { promises as fs } from "fs";
import * as path from "path";
import type {
  Skill,
  SkillSearchQuery,
  SkillDependency,
  SkillVersion,
  SkillPerformance,
  SkillStatus,
  SkillValidationResult,
  SkillFailure,
} from "./skill-types.js";
import { SKILL_FOUNDRY_LIMITS } from "./skill-types.js";

const SKILL_DATA_DIR = process.env.SKILL_DATA_DIR ?? path.join(process.cwd(), "skill-data");

let skillCounter = 0;
export function genSkillId(): string {
  return `skill-${Date.now()}-${++skillCounter}`;
}

// ─── Default Performance ────────────────────────────────────────────────────
export function defaultPerformance(): SkillPerformance {
  return {
    usageCount: 0,
    successCount: 0,
    failureCount: 0,
    averageDuration: 0,
    averageCost: 0,
    evidenceYield: 0,
    claimYield: 0,
    contradictionDetectionRate: 0,
    falsePositiveRate: 0,
    falseNegativeRate: 0,
    investigationsUsedIn: [],
  };
}

// ─── Skill Registry ────────────────────────────────────────────────────────
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private nameIndex: Map<string, string> = new Map(); // name → latest skill ID

  // ─── Registration ────────────────────────────────────────────────────────
  registerSkill(skill: Skill): void {
    // Validate before registering
    this.validateSkill(skill);
    this.skills.set(skill.id, skill);
    this.nameIndex.set(skill.name, skill.id);
  }

  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  getSkillByName(name: string): Skill | undefined {
    const id = this.nameIndex.get(name);
    return id ? this.skills.get(id) : undefined;
  }

  // ─── Discovery ────────────────────────────────────────────────────────────
  searchSkills(query: SkillSearchQuery): Skill[] {
    let results = [...this.skills.values()];

    if (query.name) {
      const lower = query.name.toLowerCase();
      results = results.filter(s =>
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower) ||
        s.purpose.toLowerCase().includes(lower)
      );
    }
    if (query.category) results = results.filter(s => s.category === query.category);
    if (query.domain) results = results.filter(s => s.domain === query.domain);
    if (query.status) results = results.filter(s => s.status === query.status);
    if (query.compatibleAgent) results = results.filter(s => s.compatibleAgents.includes(query.compatibleAgent!));
    if (query.inputType) results = results.filter(s => s.inputs.some(i => i.type === query.inputType));
    if (query.outputType) results = results.filter(s => s.outputs.some(o => o.type === query.outputType));
    if (query.minSuccessRate !== undefined) {
      results = results.filter(s => {
        const rate = s.performance.usageCount > 0 ? s.performance.successCount / s.performance.usageCount : 0;
        return rate >= query.minSuccessRate!;
      });
    }
    if (query.maxCost !== undefined) results = results.filter(s => s.performance.averageCost <= query.maxCost!);

    return results;
  }

  findCompatibleSkills(agentRole: string, inputType: string): Skill[] {
    return this.searchSkills({
      compatibleAgent: agentRole,
      inputType,
      status: "ACTIVE",
    });
  }

  findActiveSkills(): Skill[] {
    return this.searchSkills({ status: "ACTIVE" });
  }

  // ─── Composition ────────────────────────────────────────────────────────
  composeSkills(parentSkill: Skill, childSkills: Skill[]): Skill {
    // Validate composition
    for (const child of childSkills) {
      if (!this.skills.has(child.id)) {
        throw new Error(`Child skill ${child.name} is not registered`);
      }
    }

    // Check for cycles
    this.detectCycles(parentSkill.id, childSkills.map(s => s.id), new Set());

    // Check max depth
    const maxDepth = this.calculateMaxDepth(parentSkill);
    if (maxDepth >= SKILL_FOUNDRY_LIMITS.maxCompositionDepth) {
      throw new Error(`Maximum composition depth (${SKILL_FOUNDRY_LIMITS.maxCompositionDepth}) exceeded`);
    }

    // Create composed skill
    const composed: Skill = {
      ...parentSkill,
      id: genSkillId(),
      subskills: childSkills.map(s => s.id),
      prerequisites: childSkills.map(s => ({
        skillId: s.id,
        skillName: s.name,
        required: true,
        description: `Subskill of ${parentSkill.name}`,
      })),
      provenance: {
        ...parentSkill.provenance,
        type: "COMPOSED",
        createdAt: Date.now(),
      },
      version: 1,
      status: "PROPOSED",
      performance: defaultPerformance(),
      versions: [],
      failures: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.registerSkill(composed);
    return composed;
  }

  // ─── Cycle Detection ────────────────────────────────────────────────────
  detectCycles(skillId: string, proposedDependencies: string[], visited: Set<string>): void {
    if (visited.has(skillId)) {
      throw new Error(`Circular dependency detected: skill ${skillId} appears in its own dependency tree`);
    }
    if (proposedDependencies.includes(skillId)) {
      throw new Error(`Circular dependency detected: skill ${skillId} depends on itself`);
    }

    visited.add(skillId);
    for (const depId of proposedDependencies) {
      const dep = this.skills.get(depId);
      if (dep) {
        this.detectCycles(depId, dep.subskills, new Set(visited));
      }
    }
  }

  calculateMaxDepth(skill: Skill, visited: Set<string> = new Set()): number {
    if (visited.has(skill.id)) return 0;
    visited.add(skill.id);
    if (skill.subskills.length === 0) return 0;
    let maxChildDepth = 0;
    for (const subId of skill.subskills) {
      const sub = this.skills.get(subId);
      if (sub) {
        maxChildDepth = Math.max(maxChildDepth, this.calculateMaxDepth(sub, new Set(visited)));
      }
    }
    return 1 + maxChildDepth;
  }

  // ─── Dependency Validation ────────────────────────────────────────────────
  validateSkillDependencies(skill: Skill): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const dep of skill.prerequisites) {
      const depSkill = this.getSkill(dep.skillId) ?? this.getSkillByName(dep.skillName);
      if (!depSkill) {
        errors.push(`Dependency not found: ${dep.skillName} (${dep.skillId})`);
      }
    }

    // Check for cycles
    try {
      this.detectCycles(skill.id, skill.subskills, new Set());
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }

    // Check max depth
    const depth = this.calculateMaxDepth(skill);
    if (depth > SKILL_FOUNDRY_LIMITS.maxCompositionDepth) {
      errors.push(`Maximum composition depth exceeded: ${depth} > ${SKILL_FOUNDRY_LIMITS.maxCompositionDepth}`);
    }

    return { valid: errors.length === 0, errors };
  }

  // ─── Lifecycle Management ──────────────────────────────────────────────
  activateSkill(id: string): void {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Skill ${id} not found`);
    if (skill.status !== "VALIDATED" && skill.status !== "DISABLED") {
      throw new Error(`Cannot activate skill in status ${skill.status}`);
    }
    skill.status = "ACTIVE";
    skill.updatedAt = Date.now();
  }

  deactivateSkill(id: string): void {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Skill ${id} not found`);
    skill.status = "DISABLED";
    skill.updatedAt = Date.now();
  }

  deprecateSkill(id: string): void {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Skill ${id} not found`);
    skill.status = "DEPRECATED";
    skill.updatedAt = Date.now();
  }

  rejectSkill(id: string): void {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Skill ${id} not found`);
    skill.status = "REJECTED";
    skill.updatedAt = Date.now();
  }

  // ─── Versioning ──────────────────────────────────────────────────────────
  createVersion(
    skillId: string,
    changes: string[],
    changeReason: string,
    newDefinition?: Partial<Skill>,
  ): Skill {
    const oldSkill = this.skills.get(skillId);
    if (!oldSkill) throw new Error(`Skill ${skillId} not found`);

    // Record version history
    const versionRecord: SkillVersion = {
      version: oldSkill.version,
      parentVersion: oldSkill.versions.length > 0 ? oldSkill.version : null,
      changeReason,
      changes,
      createdAt: Date.now(),
    };

    const newVersion: Skill = {
      ...oldSkill,
      ...(newDefinition ?? {}),
      id: genSkillId(),
      version: oldSkill.version + 1,
      status: "PROPOSED",
      performance: defaultPerformance(),
      versions: [...oldSkill.versions, versionRecord],
      failures: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Mark old version as improved
    oldSkill.status = "IMPROVED";
    oldSkill.updatedAt = Date.now();

    this.registerSkill(newVersion);
    return newVersion;
  }

  getVersionHistory(skillId: string): SkillVersion[] {
    const skill = this.skills.get(skillId);
    if (!skill) return [];
    return skill.versions;
  }

  // ─── Performance Tracking ──────────────────────────────────────────────────
  recordExecution(
    skillId: string,
    success: boolean,
    duration: number,
    cost: number,
    evidenceCount: number,
    claimCount: number,
    investigationId: string,
  ): void {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    skill.performance.usageCount++;
    if (success) skill.performance.successCount++;
    else skill.performance.failureCount++;

    // Update running averages
    const n = skill.performance.usageCount;
    skill.performance.averageDuration = (skill.performance.averageDuration * (n - 1) + duration) / n;
    skill.performance.averageCost = (skill.performance.averageCost * (n - 1) + cost) / n;
    skill.performance.evidenceYield = (skill.performance.evidenceYield * (n - 1) + evidenceCount) / n;
    skill.performance.claimYield = (skill.performance.claimYield * (n - 1) + claimCount) / n;

    if (!skill.performance.investigationsUsedIn.includes(investigationId)) {
      skill.performance.investigationsUsedIn.push(investigationId);
    }
    skill.performance.lastUsedAt = Date.now();
    skill.updatedAt = Date.now();
  }

  recordFailure(failure: SkillFailure): void {
    const skill = this.skills.get(failure.skillId);
    if (!skill) return;
    skill.failures.push(failure);
    skill.updatedAt = Date.now();
  }

  recordValidation(skillId: string, result: SkillValidationResult): void {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    // Update false positive/negative rates from validation
    skill.performance.falsePositiveRate = result.falsePositives / Math.max(result.testsRun, 1);
    skill.performance.falseNegativeRate = result.falseNegatives / Math.max(result.testsRun, 1);
    skill.updatedAt = Date.now();
  }

  // ─── Validation ──────────────────────────────────────────────────────────
  private validateSkill(skill: Skill): void {
    const errors: string[] = [];

    if (!skill.name) errors.push("Skill must have a name");
    if (!skill.description) errors.push("Skill must have a description");
    if (!skill.purpose) errors.push("Skill must have a purpose");
    if (!skill.category) errors.push("Skill must have a category");
    if (skill.procedure.length === 0) errors.push("Skill must have at least one procedure step");
    if (skill.maxCompositionDepth > SKILL_FOUNDRY_LIMITS.maxCompositionDepth) {
      errors.push(`Max composition depth exceeds limit (${SKILL_FOUNDRY_LIMITS.maxCompositionDepth})`);
    }

    // Check for self-dependency
    if (skill.subskills.includes(skill.id)) {
      errors.push("Skill cannot depend on itself");
    }

    if (errors.length > 0) {
      throw new Error(`Invalid skill: ${errors.join("; ")}`);
    }
  }

  // ─── Persistence ──────────────────────────────────────────────────────────
  async persist(): Promise<void> {
    try {
      await fs.mkdir(SKILL_DATA_DIR, { recursive: true });
    } catch { /* exists */ }

    const filepath = path.join(SKILL_DATA_DIR, "skills.json");
    const tmpPath = `${filepath}.tmp`;
    const data = JSON.stringify([...this.skills.values()], null, 2);
    await fs.writeFile(tmpPath, data);
    await fs.rename(tmpPath, filepath);
  }

  async load(): Promise<void> {
    const filepath = path.join(SKILL_DATA_DIR, "skills.json");
    try {
      const data = await fs.readFile(filepath, "utf-8");
      const skills = JSON.parse(data) as Skill[];
      for (const skill of skills) {
        this.skills.set(skill.id, skill);
        this.nameIndex.set(skill.name, skill.id);
      }
    } catch { /* no file yet */ }
  }

  getAllSkills(): Skill[] {
    return [...this.skills.values()];
  }

  size(): number {
    return this.skills.size;
  }
}
