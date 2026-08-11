// ─── INVESTIGATION PERSISTENCE ────────────────────────────────────────────
// File-based persistence for investigation state.
// Directive 05: Investigations must survive application restarts.

import { promises as fs } from "fs";
import * as path from "path";
import type { InvestigationState } from "./types.js";
import type { SerializedState, ResearchCycle, InvestigationDecision, ResearchMission, InvestigationCheckpoint, MemoryItem, AssessmentSnapshot, ReasoningEscalation, ReasoningArtifact, InvestigationMode, InvestigationBudget } from "./persistence-types.js";

const DATA_DIR = process.env.INVESTIGATION_DATA_DIR ?? path.join(process.cwd(), "investigation-data");

// ─── Serialize / Deserialize ──────────────────────────────────────────────

export function serializeState(state: InvestigationState, opts: {
  researchCycles: ResearchCycle[];
  decisions: InvestigationDecision[];
  missions: ResearchMission[];
  checkpoints: InvestigationCheckpoint[];
  memoryItems: MemoryItem[];
  assessmentSnapshots: AssessmentSnapshot[];
  reasoningEscalations: ReasoningEscalation[];
  reasoningArtifacts: ReasoningArtifact[];
  mode: InvestigationMode;
  expandedBudget: InvestigationBudget | null;
}): SerializedState {
  return {
    id: state.id,
    question: state.question,
    phase: state.phase,
    phaseHistory: state.phaseHistory,
    hypotheses: [...state.hypotheses.values()],
    claims: [...state.claims.values()],
    evidence: [...state.evidence.values()],
    sources: [...state.sources.values()],
    contradictions: [...state.contradictions.values()],
    disagreements: [...state.disagreements.values()],
    devilsEvidence: [...state.devilsEvidence.values()],
    informationGaps: [...state.informationGaps.values()],
    researchTasks: [...state.researchTasks.values()],
    adversarialChallenges: [...state.adversarialChallenges.values()],
    assessment: state.assessment,
    budgetUSD: state.budgetUSD,
    spentUSD: state.spentUSD,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    predictions: [...(state.predictions?.values() ?? [])],
    failedPredictions: [...(state.failedPredictions?.values() ?? [])],
    mindChangingEvidence: [...(state.mindChangingEvidence?.values() ?? [])],
    hypothesisCompetitions: [...(state.hypothesisCompetitions?.values() ?? [])],
    discriminatingTasks: [...(state.discriminatingTasks?.values() ?? [])],
    evidenceClusters: [...(state.evidenceClusters?.values() ?? [])],
    narrativePatterns: [...(state.narrativePatterns?.values() ?? [])],
    entities: [...(state.entities?.values() ?? [])],
    relationships: [...(state.relationships?.values() ?? [])],
    causalClaims: [...(state.causalClaims?.values() ?? [])],
    investigationMemory: [...(state.investigationMemory?.values() ?? [])],
    assessmentRevisions: [...(state.assessmentRevisions?.values() ?? [])],
    scorecard: state.scorecard,
    userOverrides: [...(state.userOverrides?.values() ?? [])],
    convergenceCheck: state.convergenceCheck,
    investigationCycle: state.investigationCycle,
    maxCycles: state.maxCycles,
    converged: state.converged,
    paused: state.paused,
    researchCycles: opts.researchCycles,
    decisions: opts.decisions,
    missions: opts.missions,
    checkpoints: opts.checkpoints,
    reasoningEscalations: opts.reasoningEscalations,
    reasoningArtifacts: opts.reasoningArtifacts,
    assessmentSnapshots: opts.assessmentSnapshots,
    mode: opts.mode,
    expandedBudget: opts.expandedBudget,
    memoryItems: opts.memoryItems,
  };
}

export function deserializeState(serialized: SerializedState): {
  state: Partial<InvestigationState>;
  researchCycles: ResearchCycle[];
  decisions: InvestigationDecision[];
  missions: ResearchMission[];
  checkpoints: InvestigationCheckpoint[];
  memoryItems: MemoryItem[];
  assessmentSnapshots: AssessmentSnapshot[];
  reasoningEscalations: ReasoningEscalation[];
  reasoningArtifacts: ReasoningArtifact[];
  mode: InvestigationMode;
  expandedBudget: InvestigationBudget | null;
} {
  const state: Partial<InvestigationState> = {
    id: serialized.id,
    question: serialized.question,
    phase: (serialized.paused ? "PAUSED" : serialized.phase) as InvestigationState["phase"],
    phaseHistory: serialized.phaseHistory as InvestigationState["phaseHistory"],
    hypotheses: new Map((serialized.hypotheses as any[]).map((h: any) => [h.id, h])),
    claims: new Map((serialized.claims as any[]).map((c: any) => [c.id, c])),
    evidence: new Map((serialized.evidence as any[]).map((e: any) => [e.id, e])),
    sources: new Map((serialized.sources as any[]).map((s: any) => [s.id, s])),
    contradictions: new Map((serialized.contradictions as any[]).map((c: any) => [c.id, c])),
    disagreements: new Map((serialized.disagreements as any[]).map((d: any) => [d.id, d])),
    devilsEvidence: new Map((serialized.devilsEvidence as any[]).map((d: any) => [d.id, d])),
    informationGaps: new Map((serialized.informationGaps as any[]).map((g: any) => [g.id, g])),
    researchTasks: new Map((serialized.researchTasks as any[]).map((t: any) => [t.id, t])),
    adversarialChallenges: new Map((serialized.adversarialChallenges as any[]).map((a: any) => [a.id, a])),
    assessment: serialized.assessment as InvestigationState["assessment"],
    budgetUSD: serialized.budgetUSD,
    spentUSD: serialized.spentUSD,
    createdAt: serialized.createdAt,
    updatedAt: serialized.updatedAt,
    predictions: new Map((serialized.predictions as any[]).map((p: any) => [p.id, p])),
    failedPredictions: new Map((serialized.failedPredictions as any[]).map((p: any) => [p.id, p])),
    mindChangingEvidence: new Map((serialized.mindChangingEvidence as any[]).map((m: any) => [m.id, m])),
    hypothesisCompetitions: new Map((serialized.hypothesisCompetitions as any[]).map((h: any) => [h.id, h])),
    discriminatingTasks: new Map((serialized.discriminatingTasks as any[]).map((d: any) => [d.id, d])),
    evidenceClusters: new Map((serialized.evidenceClusters as any[]).map((e: any) => [e.id, e])),
    narrativePatterns: new Map((serialized.narrativePatterns as any[]).map((n: any) => [n.id, n])),
    entities: new Map((serialized.entities as any[]).map((e: any) => [e.id, e])),
    relationships: new Map((serialized.relationships as any[]).map((r: any) => [r.id, r])),
    causalClaims: new Map((serialized.causalClaims as any[]).map((c: any) => [c.id, c])),
    investigationMemory: new Map((serialized.investigationMemory as any[]).map((m: any) => [m.id, m])),
    assessmentRevisions: new Map((serialized.assessmentRevisions as any[]).map((a: any) => [a.id, a])),
    scorecard: serialized.scorecard as InvestigationState["scorecard"],
    userOverrides: new Map((serialized.userOverrides as any[]).map((u: any) => [u.id, u])),
    convergenceCheck: serialized.convergenceCheck as InvestigationState["convergenceCheck"],
    investigationCycle: serialized.investigationCycle,
    maxCycles: serialized.maxCycles,
    converged: serialized.converged,
    paused: serialized.paused,
  };

  return {
    state,
    researchCycles: serialized.researchCycles as ResearchCycle[],
    decisions: serialized.decisions as InvestigationDecision[],
    missions: serialized.missions as ResearchMission[],
    checkpoints: serialized.checkpoints as InvestigationCheckpoint[],
    memoryItems: serialized.memoryItems as MemoryItem[],
    assessmentSnapshots: serialized.assessmentSnapshots as AssessmentSnapshot[],
    reasoningEscalations: serialized.reasoningEscalations as ReasoningEscalation[],
    reasoningArtifacts: serialized.reasoningArtifacts as ReasoningArtifact[],
    mode: serialized.mode as InvestigationMode,
    expandedBudget: serialized.expandedBudget as InvestigationBudget | null,
  };
}

// ─── File I/O ────────────────────────────────────────────────────────────

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch { /* already exists */ }
}

export async function saveInvestigation(serialized: SerializedState): Promise<void> {
  await ensureDataDir();
  const filepath = path.join(DATA_DIR, `${serialized.id}.json`);
  const tmpPath = `${filepath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(serialized, null, 2));
  await fs.rename(tmpPath, filepath); // atomic write
}

export async function loadInvestigation(id: string): Promise<SerializedState | null> {
  const filepath = path.join(DATA_DIR, `${id}.json`);
  try {
    const data = await fs.readFile(filepath, "utf-8");
    return JSON.parse(data) as SerializedState;
  } catch {
    return null;
  }
}

export async function listInvestigations(): Promise<Array<{ id: string; question: string; phase: string; updatedAt: number }>> {
  await ensureDataDir();
  const files = await fs.readdir(DATA_DIR);
  const result: Array<{ id: string; question: string; phase: string; updatedAt: number }> = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf-8")) as SerializedState;
      result.push({
        id: data.id,
        question: data.question,
        phase: data.phase,
        updatedAt: data.updatedAt,
      });
    } catch { /* skip corrupt files */ }
  }

  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteInvestigation(id: string): Promise<void> {
  const filepath = path.join(DATA_DIR, `${id}.json`);
  try {
    await fs.unlink(filepath);
  } catch { /* already gone */ }
}

export async function findIncompleteInvestigations(): Promise<SerializedState[]> {
  await ensureDataDir();
  const files = await fs.readdir(DATA_DIR);
  const result: SerializedState[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf-8")) as SerializedState;
      // Incomplete = not converged, not failed, not paused by user
      if (!data.converged && data.phase !== "FAILED" && !data.paused) {
        result.push(data);
      }
    } catch { /* skip */ }
  }

  return result;
}
