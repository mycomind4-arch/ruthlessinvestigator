// ─── SKILL LEARNING REPORT & LIFECYCLE EVENTS (Steps 24, 29) ──────────────
// Generates investigation learning reports and manages lifecycle events.

import type { InvestigationState } from "./types.js";
import type { Skill, SkillFailure, SkillPerformance } from "./skill-types.js";
import type {
  InvestigationPattern,
  InvestigationLearningReport,
  SkillCandidateExtended,
  SkillCompositionPlan,
  SkillLifecycleEvent,
  SkillLifecycleEventRecord,
} from "./skill-types-extended.js";
import type { SkillRegistry } from "./skill-registry.js";
import type { ModelRegistry } from "../providers/registry.js";
import { PatternDetector, SkillExtractionAgent } from "./skill-extraction.js";
import { SkillCompositionEngine } from "./skill-composition.js";
import { globalEventEmitter } from "./events.js";

let eventCounter = 0;

function genEventId(): string {
  return `sle-${Date.now()}-${++eventCounter}`;
}

// ─── Lifecycle Event Stream ─────────────────────────────────────────────────
export class SkillLifecycleEventStream {
  private events: SkillLifecycleEventRecord[] = [];

  /**
   * Record a skill lifecycle event.
   */
  record(
    eventType: SkillLifecycleEvent,
    skillId?: string,
    investigationId?: string,
    message?: string,
    details?: unknown,
  ): SkillLifecycleEventRecord {
    const event: SkillLifecycleEventRecord = {
      id: genEventId(),
      eventType,
      skillId,
      investigationId,
      message: message ?? eventType,
      details,
      timestamp: Date.now(),
    };

    this.events.push(event);

    // Also emit to the investigation event stream
    if (investigationId) {
      globalEventEmitter.recordEvent(investigationId, eventType as any, message ?? eventType, details, "SKILL_LIFECYCLE");
    }

    return event;
  }

  /**
   * Get all events for a specific skill.
   */
  getEventsForSkill(skillId: string): SkillLifecycleEventRecord[] {
    return this.events.filter(e => e.skillId === skillId);
  }

  /**
   * Get all events for a specific investigation.
   */
  getEventsForInvestigation(investigationId: string): SkillLifecycleEventRecord[] {
    return this.events.filter(e => e.investigationId === investigationId);
  }

  /**
   * Get all events of a specific type.
   */
  getEventsByType(eventType: SkillLifecycleEvent): SkillLifecycleEventRecord[] {
    return this.events.filter(e => e.eventType === eventType);
  }

  /**
   * Get all events.
   */
  getAllEvents(): SkillLifecycleEventRecord[] {
    return [...this.events];
  }

  /**
   * Clear old events (for memory management).
   */
  clearOldEvents(maxAge: number): void {
    const cutoff = Date.now() - maxAge;
    this.events = this.events.filter(e => e.timestamp > cutoff);
  }
}

// ─── Learning Report Generator ──────────────────────────────────────────────
export class LearningReportGenerator {
  constructor(
    private registry: SkillRegistry,
    private modelRegistry: ModelRegistry,
  ) {}

  /**
   * Generate a learning report from a completed investigation.
   */
  async generateReport(
    state: InvestigationState,
    skillsUsed: Array<{ skillId: string; skillName: string; succeeded: boolean; evidenceProduced: number; contradictionsFound: number }>,
  ): Promise<InvestigationLearningReport> {
    const detector = new PatternDetector(state.id);
    const patterns = detector.detectPatterns(state);

    // Filter patterns worth becoming skills
    const skillWorthyPatterns = patterns.filter(p =>
      p.occurrenceCount >= 1 && p.successRate >= 0.5 && p.reproducible
    );

    // Extract skill candidates from patterns
    const extractor = new SkillExtractionAgent(this.modelRegistry, state.id);
    const extractions = await extractor.extractFromInvestigation(state, skillWorthyPatterns);

    // Convert extractions to skill candidates
    const newSkillCandidates: SkillCandidateExtended[] = extractions.map((extraction, i) => ({
      id: `cand-${Date.now()}-${i}`,
      pattern: patterns[i] ?? patterns[0],
      proposedSkill: {
        name: extraction.skillName,
        description: extraction.description,
        purpose: extraction.purpose,
        category: extraction.category,
        inputs: extraction.inputs,
        outputs: extraction.outputs,
        procedure: extraction.procedure,
        successCriteria: extraction.successCriteria,
        failureCriteria: extraction.failureCriteria,
      },
      supportingInvestigations: extraction.provenance.sourceInvestigations ?? [state.id],
      expectedBenefit: extraction.extractionReasoning.whyItWorked,
      evidenceOfEffectiveness: extraction.provenance.successMetrics ?? {
        investigationsObserved: 1,
        successRate: 1,
        averageEvidenceYield: 0,
        averageGapReduction: 0,
        adversarialSurvivalRate: 0,
      },
      knownLimitations: extraction.knownLimitations,
      validationRequirements: [
        "Structural validation — procedure has valid steps",
        "Reproducibility validation — can produce useful results",
        "Cost validation — economically reasonable",
        "Adversarial validation — skeptic can find weaknesses",
      ],
      riskLevel: extraction.riskLevel,
      createdAt: Date.now(),
    }));

    // Determine which skills succeeded and failed
    const skillsSucceeded = skillsUsed.filter(s => s.succeeded).map(s => s.skillId);
    const skillsFailed = skillsUsed.filter(s => !s.succeeded).map(s => s.skillId);

    // Check for skills that need revision based on failures
    const existingSkillsRevised: Array<{
      skillId: string;
      revisionReason: string;
      newVersion: number;
    }> = [];

    for (const failedSkill of skillsUsed.filter(s => !s.succeeded)) {
      const skill = this.registry.getSkill(failedSkill.skillId);
      if (skill && skill.failures.length > 0) {
        const recentFailure = skill.failures[skill.failures.length - 1];
        if (recentFailure.recoverable) {
          existingSkillsRevised.push({
            skillId: failedSkill.skillId,
            revisionReason: `Failure: ${recentFailure.failureType} — ${recentFailure.possibleCause}`,
            newVersion: skill.version + 1,
          });
        }
      }
    }

    // Check for potential compositions
    const compositionEngine = new SkillCompositionEngine(this.registry, state.id);
    const usedSkillIds = skillsUsed.map(s => s.skillId);
    let newCompositionsDiscovered: SkillCompositionPlan[] = [];
    if (usedSkillIds.length >= 2) {
      const plan = compositionEngine.planComposition(usedSkillIds, state);
      if (plan) {
        newCompositionsDiscovered = [plan];
      }
    }

    // Extract methodological lessons
    const methodologicalLessons = this.extractLessons(state, patterns, skillsUsed);

    const report: InvestigationLearningReport = {
      investigationId: state.id,
      patternsDiscovered: patterns,
      potentialSkills: newSkillCandidates,
      skillsUsed,
      skillsSucceeded,
      skillsFailed,
      newSkillCandidates,
      existingSkillsRevised,
      newCompositionsDiscovered,
      methodologicalLessons,
      generatedAt: Date.now(),
    };

    // Emit learning report event
    globalEventEmitter.recordEvent(state.id, "skill_learning_report_generated" as any,
      `INVESTIGATION LEARNING REPORT\n\nInvestigation: ${state.id}\nPatterns: ${patterns.length}\nNew skill candidates: ${newSkillCandidates.length}\nSkills used: ${skillsUsed.length}\nSkills succeeded: ${skillsSucceeded.length}\nSkills failed: ${skillsFailed.length}\nCompositions: ${newCompositionsDiscovered.length}\nMethodological lessons: ${methodologicalLessons.length}`,
      report, "LEARNING_SYSTEM");

    return report;
  }

  /**
   * Format the report as readable text (for "What did the system learn?" — Step 29).
   */
  formatReport(report: InvestigationLearningReport): string {
    const lines: string[] = [];
    lines.push("══════════════════════════════════════════════════");
    lines.push("   INVESTIGATION LEARNING REPORT");
    lines.push("══════════════════════════════════════════════════");
    lines.push("");
    lines.push(`Investigation: ${report.investigationId}`);
    lines.push("");

    // Patterns
    lines.push("─── PATTERNS DISCOVERED ───");
    if (report.patternsDiscovered.length === 0) {
      lines.push("  No reusable patterns detected.");
    } else {
      for (const pattern of report.patternsDiscovered) {
        lines.push(`  • ${pattern.type}: ${pattern.description}`);
        lines.push(`    Success rate: ${(pattern.successRate * 100).toFixed(0)}% | Evidence yield: ${pattern.averageEvidenceYield.toFixed(1)} | Reproducible: ${pattern.reproducible ? "Yes" : "No"}`);
      }
    }
    lines.push("");

    // Skills used
    lines.push("─── SKILLS USED ───");
    if (report.skillsUsed.length === 0) {
      lines.push("  No skills were used in this investigation.");
    } else {
      for (const skill of report.skillsUsed) {
        const status = skill.succeeded ? "✓ SUCCEEDED" : "✗ FAILED";
        lines.push(`  ${status} — ${skill.skillName}`);
        lines.push(`    Evidence produced: ${skill.evidenceProduced} | Contradictions found: ${skill.contradictionsFound}`);
      }
    }
    lines.push("");

    // New skill candidates
    lines.push("─── NEW SKILL CANDIDATES ───");
    if (report.newSkillCandidates.length === 0) {
      lines.push("  No new skill candidates identified.");
    } else {
      for (const candidate of report.newSkillCandidates) {
        lines.push(`  • ${candidate.proposedSkill.name}`);
        lines.push(`    Discovered because: ${candidate.pattern.description}`);
        lines.push(`    Observed result: ${Math.round(candidate.evidenceOfEffectiveness.successRate * 100)}% success across ${candidate.evidenceOfEffectiveness.investigationsObserved} investigation(s)`);
        lines.push(`    Risk: ${candidate.riskLevel}`);
        lines.push(`    Status: VALIDATION REQUIRED`);
      }
    }
    lines.push("");

    // Skills revised
    if (report.existingSkillsRevised.length > 0) {
      lines.push("─── SKILLS REVISED ───");
      for (const rev of report.existingSkillsRevised) {
        lines.push(`  • Skill ${rev.skillId} → v${rev.newVersion}`);
        lines.push(`    Reason: ${rev.revisionReason}`);
      }
      lines.push("");
    }

    // Compositions
    if (report.newCompositionsDiscovered.length > 0) {
      lines.push("─── NEW COMPOSITIONS DISCOVERED ───");
      for (const comp of report.newCompositionsDiscovered) {
        lines.push(`  • Components: ${comp.componentSkillIds.join(" + ")}`);
        lines.push(`    Shared entities: ${comp.sharedEntities.length} | Duplicates: ${comp.duplicateTasks.length} | Conflicts: ${comp.conflictingAssumptions.length}`);
        lines.push(`    Risk: ${comp.riskAssessment}`);
      }
      lines.push("");
    }

    // Lessons
    if (report.methodologicalLessons.length > 0) {
      lines.push("─── METHODOLOGICAL LESSONS ───");
      for (const lesson of report.methodologicalLessons) {
        lines.push(`  • ${lesson}`);
      }
      lines.push("");
    }

    lines.push("══════════════════════════════════════════════════");

    return lines.join("\n");
  }

  /**
   * Extract methodological lessons from the investigation.
   */
  private extractLessons(
    state: InvestigationState,
    patterns: InvestigationPattern[],
    skillsUsed: Array<{ skillId: string; skillName: string; succeeded: boolean; evidenceProduced: number; contradictionsFound: number }>,
  ): string[] {
    const lessons: string[] = [];

    // Lesson from evidence yield
    if (state.evidence.size > 10) {
      lessons.push(`High evidence yield (${state.evidence.size} items) — investigation methodology was effective`);
    } else if (state.evidence.size < 3 && state.investigationCycle > 1) {
      lessons.push(`Low evidence yield (${state.evidence.size} items) despite ${state.investigationCycle} cycles — methodology may need improvement`);
    }

    // Lesson from skill success/failure
    const successRate = skillsUsed.length > 0
      ? skillsUsed.filter(s => s.succeeded).length / skillsUsed.length
      : 0;
    if (skillsUsed.length > 0 && successRate < 0.5) {
      lessons.push(`Skills had ${(successRate * 100).toFixed(0)}% success rate — skills may need revision or different context`);
    }

    // Lesson from contradictions
    const contradictions = [...state.contradictions.values()];
    if (contradictions.length > 0) {
      const resolved = contradictions.filter(c => c.status !== "UNRESOLVED").length;
      lessons.push(`${contradictions.length} contradictions found, ${resolved} resolved — ${Math.round(resolved / contradictions.length * 100)}% resolution rate`);
    }

    // Lesson from gaps
    const gaps = [...state.informationGaps.values()];
    if (gaps.length > 0) {
      const resolvedGaps = gaps.filter(g => g.status !== "OPEN").length;
      lessons.push(`${gaps.length} information gaps identified, ${resolvedGaps} resolved`);
    }

    // Lesson from convergence
    if (state.converged) {
      lessons.push("Investigation converged — evidence was sufficient to reach a confident assessment");
    } else {
      lessons.push("Investigation did not converge — more research or different approach needed");
    }

    return lessons;
  }
}
