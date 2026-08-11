// ─── SKILL DISCOVERY ──────────────────────────────────────────────────────
// Detects capability gaps and proposes new skills.
// Directive 05 / Skill Foundry.

import type {
  CapabilityGap,
  SkillCandidate,
  SkillProposal,
  SkillCategory,
  SkillInput,
  SkillOutput,
  SkillStep,
  SkillProvenance,
  Skill,
} from "./skill-types.js";
import { SKILL_FOUNDRY_LIMITS } from "./skill-types.js";
import type { InvestigationState } from "./types.js";
import type { SkillRegistry } from "./skill-registry.js";
import type { AIProvider, AIRequest } from "../providers/types.js";
import type { ModelRegistry } from "../providers/registry.js";
import { globalEventEmitter } from "./events.js";

let gapCounter = 0;
let candidateCounter = 0;
let proposalCounter = 0;

function genGapId(): string { return `gap-${Date.now()}-${++gapCounter}`; }
function genCandidateId(): string { return `cand-${Date.now()}-${++candidateCounter}`; }
function genProposalId(): string { return `prop-${Date.now()}-${++proposalCounter}`; }

// ─── Capability Gap Detector ────────────────────────────────────────────────
export class CapabilityGapDetector {
  private gaps: Map<string, CapabilityGap> = new Map();
  private candidates: Map<string, SkillCandidate> = new Map();
  private proposals: Map<string, SkillProposal> = new Map();
  private proposalsThisInvestigation = 0;

  constructor(
    private registry: SkillRegistry,
    private investigationId: string,
  ) {}

  /**
   * Analyze the investigation state for recurring capability gaps.
   */
  detectGaps(state: InvestigationState): CapabilityGap[] {
    const detected: CapabilityGap[] = [];

    // Signal 1: Repeated failed research tasks
    const failedTasks = [...state.researchTasks.values()].filter(t => t.status !== "COMPLETED");
    if (failedTasks.length >= 2) {
      const similarFailures = this.groupSimilarFailures(failedTasks);
      for (const group of similarFailures) {
        if (group.length >= 2) {
          const gap = this.createOrIncrementGap(
            `Repeated failure on: ${group[0].question.substring(0, 80)}`,
            this.getExistingSkillsUsed(state),
            this.inferMissingCapability(group[0].question),
            state.id,
          );
          detected.push(gap);
        }
      }
    }

    // Signal 2: Recurring unresolved information gaps
    const openGaps = [...state.informationGaps.values()].filter(g => g.status === "OPEN");
    if (openGaps.length >= 2) {
      const similarGaps = this.groupSimilarQuestions(openGaps.map(g => g.question));
      for (const group of similarGaps) {
        if (group.length >= 2) {
          const gap = this.createOrIncrementGap(
            `Recurring unresolved question: ${group[0].substring(0, 80)}`,
            this.getExistingSkillsUsed(state),
            this.inferMissingCapability(group[0]),
            state.id,
          );
          detected.push(gap);
        }
      }
    }

    // Signal 3: Repeated unresolved contradictions
    const unresolvedContradictions = [...state.contradictions.values()].filter(c => c.status === "UNRESOLVED");
    if (unresolvedContradictions.length >= 2) {
      const gap = this.createOrIncrementGap(
        "Multiple unresolved contradictions — may need a contradiction resolution capability",
        this.getExistingSkillsUsed(state),
        "Contradiction Resolution for this evidence type",
        state.id,
      );
      detected.push(gap);
    }

    // Signal 4: Recurring manual reasoning patterns (hypothesis iterations without convergence)
    const hypothesesWithIterations = [...state.hypotheses.values()].filter(h => h.iterations.length >= 3);
    if (hypothesesWithIterations.length >= 1) {
      const gap = this.createOrIncrementGap(
        `Hypothesis "${hypothesesWithIterations[0].statement.substring(0, 60)}" has ${hypothesesWithIterations[0].iterations.length} iterations without convergence`,
        this.getExistingSkillsUsed(state),
        "More targeted evidence collection for this hypothesis type",
        state.id,
      );
      detected.push(gap);
    }

    // Emit events for detected gaps
    for (const gap of detected) {
      globalEventEmitter.recordEvent(this.investigationId, "skill_capability_gap_detected" as any,
        `CAPABILITY GAP DETECTED\n\nProblem: ${gap.problem}\nMissing capability: ${gap.missingCapability}\nOccurrences: ${gap.occurrences}`,
        gap, "DIRECTOR");
    }

    return detected;
  }

  /**
   * Check if a detected gap warrants a skill proposal.
   */
  shouldProposeSkill(gap: CapabilityGap): boolean {
    // Only propose if the gap has occurred enough times
    if (gap.occurrences < 2) return false;

    // Don't propose if we've hit the limit
    if (this.proposalsThisInvestigation >= SKILL_FOUNDRY_LIMITS.maxSkillProposalsPerInvestigation) return false;

    // Don't propose if a skill already exists for this capability
    const existing = this.registry.searchSkills({
      name: gap.missingCapability,
      status: "ACTIVE",
    });
    if (existing.length > 0) return false;

    return true;
  }

  /**
   * Create a skill proposal from a capability gap.
   */
  createProposal(gap: CapabilityGap, provenance: SkillProvenance): SkillProposal {
    const proposal: SkillProposal = {
      id: genProposalId(),
      problem: gap.problem,
      whyExistingSkillsAreInsufficient: `Existing skills (${gap.existingSkillsUsed.join(", ")}) have been used ${gap.occurrences} times without resolving this problem.`,
      proposedSkillName: gap.candidateSkillName,
      proposedSkillCategory: gap.candidateSkillCategory,
      proposedSkillDescription: `Investigative skill to address: ${gap.missingCapability}`,
      inputs: [{ name: "question", type: "question", required: true, description: "The question to investigate" }],
      outputs: [{ name: "finding", type: "assessment", description: "Assessment of the investigated question" }],
      procedure: [
        { id: "step-1", type: "SEARCH_SOURCES", description: `Search for sources related to ${gap.missingCapability}`, inputs: ["question"], outputs: ["sources"] },
        { id: "step-2", type: "EXTRACT_EVIDENCE", description: "Extract evidence from sources", inputs: ["sources"], outputs: ["evidence"] },
        { id: "step-3", type: "SYNTHESIZE", description: "Synthesize findings", inputs: ["evidence"], outputs: ["finding"] },
      ],
      candidateSubskills: gap.existingSkillsUsed,
      expectedBenefit: `Reduce repeated manual investigation of ${gap.missingCapability}`,
      exampleUseCases: gap.investigationIds.map(id => `Investigation ${id}`),
      knownRisks: ["Skill may not generalize to all variations of this problem"],
      validationPlan: "Test against historical investigation data and benchmark cases",
      createdFromInvestigations: gap.investigationIds,
      status: "PROPOSED",
      provenance,
      createdAt: Date.now(),
    };

    this.proposals.set(proposal.id, proposal);
    this.proposalsThisInvestigation++;

    globalEventEmitter.recordEvent(this.investigationId, "skill_proposed" as any,
      `SKILL PROPOSED\n\nName: ${proposal.proposedSkillName}\nCategory: ${proposal.proposedSkillCategory}\nProblem: ${proposal.problem}\nExpected benefit: ${proposal.expectedBenefit}`,
      proposal, "DIRECTOR");

    return proposal;
  }

  /**
   * Detect recurring skill sequences that could become composite skills.
   */
  detectSkillSequences(skillUsageLog: string[][]): SkillCandidate[] {
    const candidates: SkillCandidate[] = [];
    const sequenceCounts = new Map<string, { count: number; investigations: string[] }>();

    for (let i = 0; i < skillUsageLog.length; i++) {
      const seq = skillUsageLog[i];
      for (let len = 2; len <= Math.min(5, seq.length); len++) {
        for (let j = 0; j <= seq.length - len; j++) {
          const subseq = seq.slice(j, j + len).join(" → ");
          const existing = sequenceCounts.get(subseq);
          if (existing) {
            existing.count++;
            if (!existing.investigations.includes(`inv-${i}`)) {
              existing.investigations.push(`inv-${i}`);
            }
          } else {
            sequenceCounts.set(subseq, { count: 1, investigations: [`inv-${i}`] });
          }
        }
      }
    }

    // Find sequences that appear in 2+ investigations
    for (const [seq, info] of sequenceCounts) {
      if (info.count >= 2 && info.investigations.length >= 2) {
        const candidate: SkillCandidate = {
          id: genCandidateId(),
          name: `Composite: ${seq.substring(0, 60)}`,
          observedInInvestigations: info.investigations,
          occurrenceCount: info.count,
          recurringProblem: `The sequence ${seq} was used ${info.count} times across ${info.investigations.length} investigations`,
          existingWorkaround: seq.split(" → "),
          potentialReuse: info.count >= 3 ? "HIGH" : "MODERATE",
          proposedCategory: "STRATEGIC",
          detectedAt: Date.now(),
        };
        candidates.push(candidate);
        this.candidates.set(candidate.id, candidate);

        globalEventEmitter.recordEvent(this.investigationId, "skill_candidate_created" as any,
          `SKILL CANDIDATE\n\nName: ${candidate.name}\nObserved in: ${candidate.observedInInvestigations.length} investigations\nRecurring problem: ${candidate.recurringProblem}\nPotential reuse: ${candidate.potentialReuse}`,
          candidate, "DIRECTOR");
      }
    }

    return candidates;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────
  private createOrIncrementGap(
    problem: string,
    existingSkills: string[],
    missingCapability: string,
    investigationId: string,
  ): CapabilityGap {
    // Check if a similar gap already exists
    const existing = [...this.gaps.values()].find(g =>
      g.missingCapability === missingCapability ||
      g.problem === problem
    );

    if (existing) {
      existing.occurrences++;
      if (!existing.investigationIds.includes(investigationId)) {
        existing.investigationIds.push(investigationId);
      }
      existing.detectedAt = Date.now();
      return existing;
    }

    const gap: CapabilityGap = {
      id: genGapId(),
      problem,
      existingSkillsUsed: existingSkills,
      missingCapability,
      occurrences: 1,
      investigationIds: [investigationId],
      candidateSkillName: this.toSkillName(missingCapability),
      candidateSkillCategory: this.inferCategory(missingCapability),
      detectedAt: Date.now(),
      firstDetectedAt: Date.now(),
    };
    this.gaps.set(gap.id, gap);
    return gap;
  }

  private groupSimilarFailures(tasks: Array<{ question: string }>): Array<Array<{ question: string }>> {
    return this.groupSimilarQuestions(tasks.map(t => t.question)).map(group =>
      group.map(q => ({ question: q }))
    );
  }

  private groupSimilarQuestions(questions: string[]): string[][] {
    const groups: string[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < questions.length; i++) {
      if (used.has(i)) continue;
      const group = [questions[i]];
      used.add(i);
      for (let j = i + 1; j < questions.length; j++) {
        if (used.has(j)) continue;
        if (this.areSimilar(questions[i], questions[j])) {
          group.push(questions[j]);
          used.add(j);
        }
      }
      groups.push(group);
    }
    return groups;
  }

  private areSimilar(a: string, b: string): boolean {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.length / union.size > 0.3;
  }

  private inferMissingCapability(question: string): string {
    // Simple heuristic: extract the core action from the question
    const lower = question.toLowerCase();
    if (lower.includes("status")) return "Status Verification";
    if (lower.includes("ownership") || lower.includes("who owns")) return "Ownership Verification";
    if (lower.includes("financ") || lower.includes("funding")) return "Financing Investigation";
    if (lower.includes("construct") || lower.includes("build")) return "Construction Status Verification";
    if (lower.includes("operational") || lower.includes("operating")) return "Operational Status Verification";
    if (lower.includes("permit") || lower.includes("regulatory")) return "Regulatory Status Verification";
    if (lower.includes("timeline") || lower.includes("when")) return "Timeline Verification";
    if (lower.includes("cancel") || lower.includes("abandon")) return "Cancellation Detection";
    return "Specialized Evidence Collection";
  }

  private inferCategory(capability: string): SkillCategory {
    const lower = capability.toLowerCase();
    if (lower.includes("verif") || lower.includes("search") || lower.includes("collection")) return "PROCEDURAL";
    if (lower.includes("analysis") || lower.includes("resolution")) return "ANALYTICAL";
    if (lower.includes("investigation") || lower.includes("reality check")) return "STRATEGIC";
    return "PROCEDURAL";
  }

  private toSkillName(capability: string): string {
    return capability
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  private getExistingSkillsUsed(state: InvestigationState): string[] {
    const active = this.registry.findActiveSkills();
    return active.map(s => s.name);
  }

  getGaps(): CapabilityGap[] { return [...this.gaps.values()]; }
  getCandidates(): SkillCandidate[] { return [...this.candidates.values()]; }
  getProposals(): SkillProposal[] { return [...this.proposals.values()]; }
}
