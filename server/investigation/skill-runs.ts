// ─── SKILL RUN RECORDS & QUALITY METRICS (Directive 05, Steps 4-5) ────────
// Track every skill execution with full provenance and quality metrics.

import type { Skill } from "./skill-types.js";
import type { InvestigationState, Evidence, Claim, Contradiction } from "./types.js";

// ─── SkillRun (Step 4) ────────────────────────────────────────────────────

export interface SkillRun {
  id: string;
  skillId: string;
  skillName: string;
  skillVersion: number;
  investigationId: string;
  taskId: string;
  taskDescription: string;
  agentRole: string;
  provider: string;
  model: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  evidenceProduced: string[];       // evidence IDs
  claimsProduced: string[];         // claim IDs
  contradictionsFound: string[];     // contradiction IDs
  timeMs: number;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  outcome: "SUCCESS" | "PARTIAL" | "FAILURE" | "ERROR";
  qualityAssessment: SkillQualityAssessment;
  errors: string[];
  downstreamImpact: SkillDownstreamImpact;
  createdAt: number;
}

export interface SkillQualityAssessment {
  // Multi-dimensional quality (Step 5) — NOT collapsed into one score
  evidenceYield: "NONE" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  evidenceQuality: "NONE" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  sourceQuality: "NONE" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  claimAccuracy: "NONE" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  contradictionDiscovery: "NONE" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  hypothesisImpact: "NONE" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  informationGain: "NONE" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  costEfficiency: "NONE" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  timeEfficiency: "NONE" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  repeatability: "UNKNOWN" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  failureRate: number;             // 0-1, historical
  humanValidation: "NONE" | "PENDING" | "VALIDATED" | "REJECTED";
  notes: string;
}

export interface SkillDownstreamImpact {
  evidenceUsedByOtherTasks: number;
  claimsUsedInAssessment: number;
  contradictionsAffectedHypotheses: number;
  informationGapsResolved: number;
  hypothesisRevisionsTriggered: number;
  assessmentChangesTriggered: number;
}

// ─── Skill Memory (Step 19) ────────────────────────────────────────────────

export interface SkillMemory {
  skillId: string;
  lessons: SkillLesson[];
  preferredModels: string[];
  avoidModels: string[];
  bestPrecedingSkill?: string;
  bestFollowingSkill?: string;
  performanceConditions: {
    performsWellWhen: string[];
    performsPoorlyWhen: string[];
  };
  updatedAt: number;
}

export interface SkillLesson {
  id: string;
  type: "STRENGTH" | "WEAKNESS" | "PREFERENCE" | "WARNING" | "OPTIMIZATION";
  description: string;
  evidence: string;                 // which investigation/run this was observed in
  confidence: number;               // 0-1, increases with repeated observations
  observationCount: number;
  firstObserved: number;
  lastObserved: number;
}

// ─── Skill Run Recorder ──────────────────────────────────────────────────

export class SkillRunRecorder {
  private runs: Map<string, SkillRun> = new Map();
  private memory: Map<string, SkillMemory> = new Map();

  recordRun(run: Omit<SkillRun, "id" | "createdAt">): SkillRun {
    const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const full: SkillRun = { ...run, id, createdAt: Date.now() };
    this.runs.set(id, full);

    // Update skill memory based on this run
    this.updateMemory(full);

    return full;
  }

  getRun(id: string): SkillRun | undefined {
    return this.runs.get(id);
  }

  getRunsForSkill(skillId: string): SkillRun[] {
    return [...this.runs.values()].filter(r => r.skillId === skillId);
  }

  getRunsForInvestigation(investigationId: string): SkillRun[] {
    return [...this.runs.values()].filter(r => r.investigationId === investigationId);
  }

  getAllRuns(): SkillRun[] {
    return [...this.runs.values()];
  }

  // ─── Skill Memory ───────────────────────────────────────────────────────

  getMemory(skillId: string): SkillMemory | undefined {
    return this.memory.get(skillId);
  }

  getAllMemory(): SkillMemory[] {
    return [...this.memory.values()];
  }

  private updateMemory(run: SkillRun): void {
    let mem = this.memory.get(run.skillId);
    if (!mem) {
      mem = {
        skillId: run.skillId,
        lessons: [],
        preferredModels: [],
        avoidModels: [],
        performanceConditions: { performsWellWhen: [], performsPoorlyWhen: [] },
        updatedAt: Date.now(),
      };
      this.memory.set(run.skillId, mem);
    }

    // Learn from successful runs
    if (run.outcome === "SUCCESS" || run.outcome === "PARTIAL") {
      if (!mem.preferredModels.includes(run.model) && run.qualityAssessment.evidenceYield !== "NONE") {
        mem.preferredModels.push(run.model);
      }

      // Record strengths
      if (run.qualityAssessment.evidenceYield === "HIGH" || run.qualityAssessment.evidenceYield === "VERY_HIGH") {
        this.addOrUpdateLesson(mem, {
          type: "STRENGTH",
          description: `High evidence yield observed with ${run.model}`,
          evidence: run.investigationId,
          confidence: 0.5,
        });
      }

      if (run.qualityAssessment.costEfficiency === "HIGH" || run.qualityAssessment.costEfficiency === "VERY_HIGH") {
        this.addOrUpdateLesson(mem, {
          type: "OPTIMIZATION",
          description: `Cost-efficient run at $${run.costUSD.toFixed(3)}`,
          evidence: run.investigationId,
          confidence: 0.5,
        });
      }
    }

    // Learn from failures
    if (run.outcome === "FAILURE" || run.outcome === "ERROR") {
      this.addOrUpdateLesson(mem, {
        type: "WEAKNESS",
        description: `Failed run: ${run.errors.join("; ") || "unknown error"}`,
        evidence: run.investigationId,
        confidence: 0.3,
      });

      // Avoid models that fail repeatedly
      const failures = this.getRunsForSkill(run.skillId).filter(r =>
        r.model === run.model && r.outcome === "FAILURE"
      );
      if (failures.length >= 2 && !mem.avoidModels.includes(run.model)) {
        mem.avoidModels.push(run.model);
        this.addOrUpdateLesson(mem, {
          type: "WARNING",
          description: `Model ${run.model} failed ${failures.length} times — consider avoiding`,
          evidence: run.investigationId,
          confidence: 0.7,
        });
      }
    }

    mem.updatedAt = Date.now();
  }

  private addOrUpdateLesson(
    mem: SkillMemory,
    lesson: Omit<SkillLesson, "id" | "observationCount" | "firstObserved" | "lastObserved">,
  ): void {
    // Check if a similar lesson already exists
    const existing = mem.lessons.find(l =>
      l.type === lesson.type && l.description === lesson.description
    );

    if (existing) {
      // Reinforce existing lesson
      existing.observationCount++;
      existing.confidence = Math.min(existing.confidence + 0.1, 1.0);
      existing.lastObserved = Date.now();
    } else {
      mem.lessons.push({
        ...lesson,
        id: `lesson-${mem.lessons.length + 1}`,
        observationCount: 1,
        firstObserved: Date.now(),
        lastObserved: Date.now(),
      });
    }
  }

  // ─── Quality Assessment ─────────────────────────────────────────────────

  static assessQuality(
    run: Omit<SkillRun, "id" | "createdAt" | "qualityAssessment">,
    state: InvestigationState,
  ): SkillQualityAssessment {
    const evidenceCount = run.evidenceProduced.length;
    const claimCount = run.claimsProduced.length;
    const contradictionCount = run.contradictionsFound.length;

    // Evidence yield
    const evidenceYield = this.countToLevel(evidenceCount, [0, 1, 3, 6, 10]);

    // Evidence quality — check if evidence has primary sources
    const producedEvidence = run.evidenceProduced
      .map(id => state.evidence.get(id))
      .filter((e): e is Evidence => e !== undefined);
    const primaryCount = producedEvidence.filter(e =>
      (e as any)?.sourceType === "PRIMARY_SOURCE" || (e as any)?.isPrimary === true
    ).length;
    const evidenceQuality = this.countToLevel(primaryCount, [0, 0, 1, 2, 4]);

    // Source quality
    const sourceQuality = evidenceQuality; // Simplified

    // Claim accuracy
    const claimsWithEvidence = run.claimsProduced
      .map(id => state.claims.get(id))
      .filter((c): c is Claim => c !== undefined)
      .filter(c => (c as any)?.status === "VERIFIED" || (c as any)?.status === "CONFIRMED").length;
    const claimAccuracy = this.countToLevel(claimsWithEvidence, [0, 0, 1, 2, 4]);

    // Contradiction discovery
    const contradictionDiscovery = this.countToLevel(contradictionCount, [0, 0, 1, 2, 4]);

    // Hypothesis impact — simplified
    const hypothesisImpact: SkillQualityAssessment["hypothesisImpact"] =
      contradictionCount > 0 ? "MODERATE" : evidenceCount > 3 ? "HIGH" : evidenceCount > 0 ? "LOW" : "NONE";

    // Information gain
    const informationGain: SkillQualityAssessment["informationGain"] =
      evidenceCount > 5 ? "HIGH" : evidenceCount > 2 ? "MODERATE" : evidenceCount > 0 ? "LOW" : "NONE";

    // Cost efficiency
    const costEfficiency = this.assessCostEfficiency(run.costUSD, evidenceCount);

    // Time efficiency
    const timeEfficiency = run.timeMs < 5000 ? "VERY_HIGH" : run.timeMs < 15000 ? "HIGH" : run.timeMs < 30000 ? "MODERATE" : "LOW";

    return {
      evidenceYield,
      evidenceQuality,
      sourceQuality,
      claimAccuracy,
      contradictionDiscovery,
      hypothesisImpact,
      informationGain,
      costEfficiency,
      timeEfficiency,
      repeatability: "UNKNOWN",
      failureRate: 0,
      humanValidation: "NONE",
      notes: "",
    };
  }

  private static countToLevel(count: number, thresholds: [number, number, number, number, number]): SkillQualityAssessment["evidenceYield"] {
    if (count >= thresholds[4]) return "VERY_HIGH";
    if (count >= thresholds[3]) return "HIGH";
    if (count >= thresholds[2]) return "MODERATE";
    if (count >= thresholds[1]) return "LOW";
    return "NONE";
  }

  private static assessCostEfficiency(cost: number, evidenceCount: number): SkillQualityAssessment["costEfficiency"] {
    if (cost === 0 && evidenceCount > 0) return "VERY_HIGH";
    if (cost === 0) return "NONE";
    const costPerEvidence = evidenceCount > 0 ? cost / evidenceCount : cost;
    if (costPerEvidence < 0.01) return "VERY_HIGH";
    if (costPerEvidence < 0.05) return "HIGH";
    if (costPerEvidence < 0.15) return "MODERATE";
    if (costPerEvidence < 0.30) return "LOW";
    return "NONE";
  }
}
