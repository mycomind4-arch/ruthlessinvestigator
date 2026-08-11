// ─── SKILL LEARNING & CAPABILITY GAP ENGINE ────────────────────────────────
// Learns from repeated investigative work without granting itself authority
// to activate or replace skills. It detects recurring gaps, proposes reusable
// capabilities, and can compose existing skills for human/Director review.

import { promises as fs } from "fs";
import * as path from "path";
import {
  genSkillId,
  type CapabilityGap,
  type Skill,
  type SkillCandidate,
  type SkillCategory,
  type SkillProposal,
  type SkillStep,
} from "./skill-types.js";
import type { SkillRegistry } from "./skill-registry.js";

const LEARNING_DATA_DIR = process.env.SKILL_DATA_DIR ?? path.join(process.cwd(), "skill-data");
const LEARNING_FILE = path.join(LEARNING_DATA_DIR, "learning.json");

export interface LearningObservation {
  investigationId: string;
  taskId?: string;
  problem: string;
  existingSkillsUsed: string[];
  workaroundSteps: string[];
  success: boolean;
  evidenceCreated: number;
  contradictionDetected: number;
  cost: number;
}

export interface SkillLearningDecision {
  action: "NO_ACTION" | "TRACK_GAP" | "PROPOSE_SKILL" | "PROPOSE_COMPOSITION";
  reason: string;
  gap?: CapabilityGap;
  candidate?: SkillCandidate;
  proposal?: SkillProposal;
  composition?: { parentSkillId: string; childSkillIds: string[]; reason: string };
}

interface LearningSnapshot {
  observations: LearningObservation[];
  gaps: CapabilityGap[];
  candidates: SkillCandidate[];
}

function normalize(value: string): string { return value.trim().toLowerCase().replace(/\s+/g, " "); }

function categoryFor(problem: string): SkillCategory {
  const text = problem.toLowerCase();
  if (/caus|effect|driver|why/.test(text)) return "ANALYTICAL";
  if (/source|evidence|verify|document|record/.test(text)) return "PROCEDURAL";
  if (/strategy|priority|next|plan|research/.test(text)) return "STRATEGIC";
  return "META";
}

function makeSteps(observation: LearningObservation): SkillStep[] {
  const steps: SkillStep[] = observation.workaroundSteps.slice(0, 8).map((description, index) => ({
    id: `learned-step-${index + 1}`,
    type: index === 0 ? "SEARCH_SOURCES" : "RECORD_FINDING",
    description,
    inputs: ["question"],
    outputs: ["finding"],
    expectedOutput: "A provenance-linked investigative finding.",
  }));
  if (steps.length === 0) steps.push({ id: "learned-step-1", type: "ANALYZE_CLAIM", description: `Investigate the recurring problem: ${observation.problem}`, inputs: ["question"], outputs: ["finding"], expectedOutput: "A traceable finding that addresses the capability gap." });
  return steps;
}

/** Learns from observations; proposals remain gated and are never auto-activated. */
export class SkillLearningEngine {
  private observations: LearningObservation[] = [];
  private gaps = new Map<string, CapabilityGap>();
  private candidates = new Map<string, SkillCandidate>();

  constructor(private readonly registry: SkillRegistry) {}

  observe(observation: LearningObservation): SkillLearningDecision {
    this.observations.push(observation);
    const key = normalize(observation.problem);
    const prior = this.gaps.get(key);
    const occurrences = (prior?.occurrences ?? 0) + 1;
    const investigations = [...new Set([...(prior?.investigationIds ?? []), observation.investigationId])];
    const existing = this.registry.searchSkills({ name: observation.problem, status: "ACTIVE" });
    if (existing.length > 0 && observation.success) return { action: "NO_ACTION", reason: "An active skill already addresses this recurring problem and the observation succeeded." };

    const gap: CapabilityGap = prior ?? {
      id: genSkillId(), problem: observation.problem, existingSkillsUsed: [...observation.existingSkillsUsed],
      missingCapability: observation.workaroundSteps.join("; ") || observation.problem, occurrences: 0,
      investigationIds: [], candidateSkillName: `Investigate: ${observation.problem}`.slice(0, 100),
      candidateSkillCategory: categoryFor(observation.problem), detectedAt: Date.now(), firstDetectedAt: Date.now(),
    };
    gap.occurrences = occurrences;
    gap.investigationIds = investigations;
    gap.existingSkillsUsed = [...new Set([...gap.existingSkillsUsed, ...observation.existingSkillsUsed])];
    this.gaps.set(key, gap);

    if (occurrences < 2) return { action: "TRACK_GAP", reason: "Capability gap observed once; wait for recurrence before proposing a new skill.", gap };

    const candidate: SkillCandidate = {
      id: genSkillId(), name: gap.candidateSkillName, observedInInvestigations: investigations,
      occurrenceCount: occurrences, recurringProblem: observation.problem,
      existingWorkaround: [...new Set(observation.workaroundSteps)], potentialReuse: occurrences >= 4 ? "HIGH" : "MODERATE",
      proposedCategory: gap.candidateSkillCategory, detectedAt: Date.now(),
    };
    this.candidates.set(candidate.id, candidate);

    const proposal: SkillProposal = {
      id: genSkillId(), problem: observation.problem,
      whyExistingSkillsAreInsufficient: `The problem recurred ${occurrences} times despite the existing procedure set.`,
      proposedSkillName: gap.candidateSkillName, proposedSkillCategory: gap.candidateSkillCategory,
      proposedSkillDescription: `Reusable investigative procedure for ${observation.problem}.`,
      inputs: [{ name: "question", type: "question", required: true, description: "The investigative question requiring this capability." }],
      outputs: [{ name: "finding", type: "evidence", description: "A provenance-linked finding produced by the learned procedure." }],
      procedure: makeSteps(observation), candidateSubskills: observation.existingSkillsUsed,
      expectedBenefit: "Reduce repeated work while increasing evidence yield and procedural consistency.",
      exampleUseCases: [observation.problem], knownRisks: ["Overfitting to one investigation", "Premature activation", "Duplicating an existing skill"],
      validationPlan: "Run sandbox benchmarks against representative prior investigations before activation.",
      createdFromInvestigations: investigations, status: "PROPOSED",
      provenance: { type: "MODEL_PROPOSED", originatingInvestigation: observation.investigationId, createdFromCapabilityGap: gap.id, createdAt: Date.now() },
      createdAt: Date.now(),
    };
    return { action: "PROPOSE_SKILL", reason: "The capability gap has recurred; a reusable skill should be proposed for validation.", gap, candidate, proposal };
  }

  findComposition(parentSkillId: string, childSkillIds: string[]): SkillLearningDecision {
    const parent = this.registry.getSkill(parentSkillId);
    const children = childSkillIds.map(id => this.registry.getSkill(id)).filter(Boolean) as Skill[];
    if (!parent || children.length !== childSkillIds.length) return { action: "NO_ACTION", reason: "Composition requires registered parent and child skills." };
    if (children.some(skill => skill.status !== "ACTIVE")) return { action: "NO_ACTION", reason: "Only active validated skills may be proposed for composition." };
    if (parent.subskills.some(id => childSkillIds.includes(id))) return { action: "NO_ACTION", reason: "The requested composition already exists in the parent skill." };
    return { action: "PROPOSE_COMPOSITION", reason: "Existing validated skills can be composed into a reusable procedure; activation remains gated by validation.", composition: { parentSkillId, childSkillIds, reason: "Recurring workflow can be expressed as existing reusable capabilities." } };
  }

  async persist(): Promise<void> {
    await fs.mkdir(LEARNING_DATA_DIR, { recursive: true });
    const snapshot: LearningSnapshot = { observations: this.observations, gaps: this.getGaps(), candidates: this.getCandidates() };
    const tmp = `${LEARNING_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
    await fs.rename(tmp, LEARNING_FILE);
  }

  async load(): Promise<void> {
    try {
      const snapshot = JSON.parse(await fs.readFile(LEARNING_FILE, "utf8")) as LearningSnapshot;
      this.observations = snapshot.observations ?? [];
      this.gaps = new Map((snapshot.gaps ?? []).map(gap => [normalize(gap.problem), gap]));
      this.candidates = new Map((snapshot.candidates ?? []).map(candidate => [candidate.id, candidate]));
    } catch { /* first run: no learning state yet */ }
  }

  getGaps(): CapabilityGap[] { return [...this.gaps.values()]; }
  getCandidates(): SkillCandidate[] { return [...this.candidates.values()]; }
  getObservations(): LearningObservation[] { return [...this.observations]; }
}
