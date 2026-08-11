// ─── INVESTIGATION MEMORY SYSTEM ──────────────────────────────────────────
// Directive 05: Structured memory with provenance, staleness, and distillation.
// Memory items are NOT truth — they preserve their epistemic status explicitly.

import type {
  MemoryItem,
  MemoryCategory,
  MemoryStaleness,
  AssessmentSnapshot,
  AssessmentDiff,
} from "./persistence-types.js";
import type { InvestigationState } from "./types.js";

let memoryCounter = 0;

export function genMemoryId(): string {
  return `mem-${Date.now()}-${++memoryCounter}`;
}

// ─── Memory Store ─────────────────────────────────────────────────────────

export class MemoryStore {
  private items: Map<string, MemoryItem> = new Map();

  /**
   * Store a new memory item with provenance.
   * Memory must NEVER silently become truth.
   */
  store(
    category: MemoryCategory,
    content: string,
    provenance: string,
    confidence: number,
    opts?: {
      relatedHypothesisId?: string;
      relatedEvidenceId?: string;
      relatedSourceId?: string;
      cycleId?: string;
    },
  ): MemoryItem {
    const item: MemoryItem = {
      id: genMemoryId(),
      category,
      content,
      provenance,
      confidence,
      staleness: "CURRENT",
      relatedHypothesisId: opts?.relatedHypothesisId,
      relatedEvidenceId: opts?.relatedEvidenceId,
      relatedSourceId: opts?.relatedSourceId,
      cycleId: opts?.cycleId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.items.set(item.id, item);
    return item;
  }

  /**
   * Supersede a memory item — mark it as superseded by new information.
   * The old item is preserved historically; it does not disappear.
   */
  supersede(
    oldItemId: string,
    newItemId: string,
    reason: string,
  ): void {
    const old = this.items.get(oldItemId);
    if (!old) return;
    old.staleness = "SUPERSEDED";
    old.supersededBy = newItemId;
    old.supersedeReason = reason;
    old.updatedAt = Date.now();
  }

  /**
   * Mark a memory item as stale (e.g., aging information).
   */
  markStale(itemId: string, staleness: MemoryStaleness): void {
    const item = this.items.get(itemId);
    if (!item) return;
    item.staleness = staleness;
    item.updatedAt = Date.now();
  }

  /**
   * Get all current (non-stale) memory items.
   */
  getCurrent(): MemoryItem[] {
    return [...this.items.values()].filter((m) => m.staleness === "CURRENT");
  }

  /**
   * Get memory items by category.
   */
  getByCategory(category: MemoryCategory): MemoryItem[] {
    return [...this.items.values()].filter((m) => m.category === category);
  }

  /**
   * Get memory items relevant to a hypothesis.
   */
  getForHypothesis(hypothesisId: string): MemoryItem[] {
    return [...this.items.values()].filter(
      (m) => m.relatedHypothesisId === hypothesisId && m.staleness !== "RETRACTED"
    );
  }

  /**
   * Search memory by keyword.
   */
  search(query: string): MemoryItem[] {
    const lower = query.toLowerCase();
    return [...this.items.values()].filter(
      (m) => m.content.toLowerCase().includes(lower) && m.staleness !== "RETRACTED"
    );
  }

  get(id: string): MemoryItem | undefined {
    return this.items.get(id);
  }

  getAll(): MemoryItem[] {
    return [...this.items.values()];
  }

  getStale(): MemoryItem[] {
    return [...this.items.values()].filter(
      (m) => m.staleness === "STALE" || m.staleness === "SUPERSEDED"
    );
  }

  serialize(): MemoryItem[] {
    return [...this.items.values()];
  }

  loadItems(items: MemoryItem[]): void {
    for (const item of items) {
      this.items.set(item.id, item);
    }
  }

  size(): number {
    return this.items.size;
  }
}

// ─── Memory Distillation ──────────────────────────────────────────────────
// At the end of every major cycle, create a compact memory update.

export interface DistilledMemory {
  established: string[];        // what became established
  weakened: string[];           // what became weaker
  disproven: string[];          // what was disproven
  remainsUnknown: string[];     // what remains unknown
  rememberForFuture: string[];  // what future agents should remember
  doNotAssume: string[];        // what future agents should NOT assume
  cycleId: string;
  timestamp: number;
}

export function distillCycleMemory(
  state: InvestigationState,
  cycleId: string,
): DistilledMemory {
  const established: string[] = [];
  const weakened: string[] = [];
  const disproven: string[] = [];
  const remainsUnknown: string[] = [];
  const rememberForFuture: string[] = [];
  const doNotAssume: string[] = [];

  // Analyze hypothesis changes
  for (const hyp of state.hypotheses.values()) {
    const lastIteration = hyp.iterations[hyp.iterations.length - 1];
    if (lastIteration) {
      if (lastIteration.newSupport === "STRONG" || lastIteration.newSupport === "MODERATE") {
        if (lastIteration.previousSupport === "WEAK" || lastIteration.previousSupport === "NONE") {
          established.push(`${hyp.statement} — now ${lastIteration.newSupport}`);
        }
      }
      if (lastIteration.newSupport === "WEAK" || lastIteration.newSupport === "INSUFFICIENT_EVIDENCE") {
        if (lastIteration.previousSupport === "STRONG" || lastIteration.previousSupport === "MODERATE") {
          weakened.push(`${hyp.statement} — weakened from ${lastIteration.previousSupport} to ${lastIteration.newSupport} (${lastIteration.reason})`);
        }
      }
      if (lastIteration.newSupport === "NONE" && lastIteration.previousSupport !== "NONE") {
        disproven.push(`${hyp.statement} — ${lastIteration.reason}`);
      }
    }

    // Unknowns
    for (const unknown of hyp.unknowns) {
      remainsUnknown.push(unknown);
    }
  }

  // Analyze failed predictions
  for (const pred of state.failedPredictions?.values() ?? []) {
    disproven.push(`Prediction failed: ${pred.expectedResult} — observed: ${pred.observedResult}`);
    doNotAssume.push(`Do not assume: ${pred.expectedResult}`);
  }

  // Analyze contradictions
  for (const con of state.contradictions.values()) {
    if (con.status === "UNRESOLVED") {
      remainsUnknown.push(`Unresolved contradiction: ${con.description}`);
    }
    if (con.status === "EXPLAINED" || con.status === "CONFIRMED") {
      established.push(`Contradiction resolved: ${con.description} → ${con.resolution}`);
    }
  }

  // Analyze source contamination
  for (const cluster of state.evidenceClusters?.values() ?? []) {
    if (cluster.independentRoots < cluster.totalSources * 0.5) {
      doNotAssume.push(`Evidence cluster has limited source independence (${cluster.independentRoots} independent roots for ${cluster.totalSources} sources — ${cluster.message})`);
    }
  }

  // Information gaps
  for (const gap of state.informationGaps.values()) {
    if (gap.status === "OPEN") {
      remainsUnknown.push(gap.question);
    }
  }

  // Remember important evidence
  const independentEvidence = [...state.evidence.values()].filter((e) => e.independentConfirmation);
  if (independentEvidence.length > 0) {
    rememberForFuture.push(`${independentEvidence.length} independently confirmed evidence items available`);
  }

  return {
    established,
    weakened,
    disproven,
    remainsUnknown,
    rememberForFuture,
    doNotAssume,
    cycleId,
    timestamp: Date.now(),
  };
}

// ─── Assessment Snapshot Management ──────────────────────────────────────

export function createAssessmentSnapshot(
  state: InvestigationState,
  cycleId: string,
  revisionNumber: number,
): AssessmentSnapshot {
  return {
    id: `snap-${Date.now()}-${revisionNumber}`,
    investigationId: state.id,
    cycleId,
    revisionNumber,
    snapshot: {
      confidenceLevel: state.assessment?.confidenceLevel ?? "VERY_LOW",
      summary: state.assessment?.summary ?? "No assessment yet",
      hypotheses: [...state.hypotheses.values()].map((h) => ({
        id: h.id,
        statement: h.statement,
        supportLevel: h.supportLevel,
      })),
      majorUnknowns: state.assessment?.majorUnknowns ?? [],
      majorAssumptions: state.assessment?.majorAssumptions ?? [],
      strongestCounterargument: state.assessment?.strongestCounterargument ?? "",
    },
    timestamp: Date.now(),
  };
}

// ─── Assessment Comparison ────────────────────────────────────────────────

export function compareSnapshots(
  from: AssessmentSnapshot,
  to: AssessmentSnapshot,
): AssessmentDiff {
  const changes: AssessmentDiff["changes"] = [];
  const newUnknowns: string[] = [];
  const resolvedUnknowns: string[] = [];

  // Compare hypotheses
  for (const newHyp of to.snapshot.hypotheses) {
    const oldHyp = from.snapshot.hypotheses.find((h) => h.id === newHyp.id);
    if (!oldHyp) {
      changes.push({
        hypothesisId: newHyp.id,
        hypothesisStatement: newHyp.statement,
        previousSupport: "NONE",
        newSupport: newHyp.supportLevel,
        direction: "NEW",
        trigger: "New hypothesis created",
        reason: "Hypothesis did not exist in previous assessment",
      });
      continue;
    }

    if (oldHyp.supportLevel !== newHyp.supportLevel) {
      const oldIdx = ["NONE", "INSUFFICIENT_EVIDENCE", "WEAK", "MODERATE", "STRONG"].indexOf(oldHyp.supportLevel);
      const newIdx = ["NONE", "INSUFFICIENT_EVIDENCE", "WEAK", "MODERATE", "STRONG"].indexOf(newHyp.supportLevel);
      const direction = newIdx > oldIdx ? "STRENGTHENED" : "WEAKENED";

      changes.push({
        hypothesisId: newHyp.id,
        hypothesisStatement: newHyp.statement,
        previousSupport: oldHyp.supportLevel,
        newSupport: newHyp.supportLevel,
        direction: direction as "STRENGTHENED" | "WEAKENED",
        trigger: "Evidence update",
        reason: `Support level changed from ${oldHyp.supportLevel} to ${newHyp.supportLevel}`,
      });
    } else {
      changes.push({
        hypothesisId: newHyp.id,
        hypothesisStatement: newHyp.statement,
        previousSupport: oldHyp.supportLevel,
        newSupport: newHyp.supportLevel,
        direction: "UNCHANGED",
        trigger: "",
        reason: "No change",
      });
    }
  }

  // Removed hypotheses
  for (const oldHyp of from.snapshot.hypotheses) {
    if (!to.snapshot.hypotheses.find((h) => h.id === oldHyp.id)) {
      changes.push({
        hypothesisId: oldHyp.id,
        hypothesisStatement: oldHyp.statement,
        previousSupport: oldHyp.supportLevel,
        newSupport: "NONE",
        direction: "REMOVED",
        trigger: "Hypothesis removed",
        reason: "Hypothesis no longer present",
      });
    }
  }

  // Unknowns
  for (const u of to.snapshot.majorUnknowns) {
    if (!from.snapshot.majorUnknowns.includes(u)) {
      newUnknowns.push(u);
    }
  }
  for (const u of from.snapshot.majorUnknowns) {
    if (!to.snapshot.majorUnknowns.includes(u)) {
      resolvedUnknowns.push(u);
    }
  }

  return {
    fromSnapshotId: from.id,
    toSnapshotId: to.id,
    changes,
    newUnknowns,
    resolvedUnknowns,
    timestamp: Date.now(),
  };
}
