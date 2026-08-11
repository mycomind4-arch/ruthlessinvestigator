// ─── EVIDENCE GRAPH ──────────────────────────────────────────────────────
// The reasoning structure connecting investigations, hypotheses, claims,
// evidence, sources, and their relationships.

import type {
  InvestigationState,
  Hypothesis,
  Claim,
  Evidence,
  InvestigationSource,
  Contradiction,
} from "./types.js";

export type GraphEdgeType =
  | "supports"
  | "contradicts"
  | "weakens"
  | "depends_on"
  | "cites"
  | "related_to"
  | "belongs_to";

export interface GraphEdge {
  from: string;
  to: string;
  type: GraphEdgeType;
  label?: string;
}

export interface GraphNode {
  id: string;
  type: "investigation" | "hypothesis" | "claim" | "evidence" | "source" | "contradiction";
  label: string;
  data: Record<string, unknown>;
}

export interface EvidenceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildEvidenceGraph(state: InvestigationState): EvidenceGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Investigation node
  nodes.push({
    id: state.id,
    type: "investigation",
    label: state.question,
    data: { phase: state.phase },
  });

  // Hypotheses
  for (const hyp of state.hypotheses.values()) {
    nodes.push({
      id: hyp.id,
      type: "hypothesis",
      label: hyp.statement,
      data: { supportLevel: hyp.supportLevel },
    });
    edges.push({ from: state.id, to: hyp.id, type: "belongs_to" });

    // Hypothesis → Claims
    for (const claimId of hyp.claims) {
      edges.push({ from: hyp.id, to: claimId, type: "belongs_to" });
    }

    // Expected evidence
    for (const exp of hyp.expectedEvidence) {
      if (exp.evidenceId) {
        edges.push({ from: exp.evidenceId, to: hyp.id, type: "supports", label: "expected" });
      }
      if (exp.negativeEvidenceId) {
        edges.push({ from: exp.negativeEvidenceId, to: hyp.id, type: "contradicts", label: "expected (negative)" });
      }
    }
  }

  // Claims
  for (const claim of state.claims.values()) {
    nodes.push({
      id: claim.id,
      type: "claim",
      label: claim.text,
      data: { type: claim.type, status: claim.status },
    });

    // Claim dependencies
    for (const depId of claim.dependsOn ?? []) {
      edges.push({ from: claim.id, to: depId, type: "depends_on" });
    }
  }

  // Evidence
  for (const ev of state.evidence.values()) {
    nodes.push({
      id: ev.id,
      type: "evidence",
      label: ev.text,
      data: { type: ev.type, independent: ev.independentConfirmation },
    });

    // Evidence → Source
    edges.push({ from: ev.id, to: ev.sourceId, type: "depends_on", label: "sourced from" });

    // Evidence → Claims
    if (ev.supportsClaimId) {
      edges.push({ from: ev.id, to: ev.supportsClaimId, type: "supports" });
    }
    if (ev.contradictsClaimId) {
      edges.push({ from: ev.id, to: ev.contradictsClaimId, type: "contradicts" });
    }
  }

  // Sources
  for (const src of state.sources.values()) {
    nodes.push({
      id: src.id,
      type: "source",
      label: src.title,
      data: { sourceType: src.sourceType, isPrimary: src.isPrimary, quality: src.quality },
    });

    // Source → Source citation edges
    for (const citedId of src.cites) {
      edges.push({ from: src.id, to: citedId, type: "cites" });
    }
  }

  // Contradictions
  for (const con of state.contradictions.values()) {
    nodes.push({
      id: con.id,
      type: "contradiction",
      label: con.description,
      data: { status: con.status },
    });
    edges.push({ from: con.claimA, to: con.id, type: "related_to" });
    edges.push({ from: con.claimB, to: con.id, type: "related_to" });
  }

  return { nodes, edges };
}

/** Get the full lineage path from a source to its root sources */
export function traceSourceLineage(
  sourceId: string,
  sources: Map<string, InvestigationSource>
): string[] {
  const visited = new Set<string>();
  const roots: string[] = [];

  function walk(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const src = sources.get(id);
    if (!src) return;
    if (src.cites.length === 0) {
      roots.push(id);
    } else {
      for (const citedId of src.cites) {
        walk(citedId);
      }
    }
  }

  walk(sourceId);
  return roots;
}

/** Count independent root sources for a set of evidence items */
export function countIndependentRoots(
  evidenceIds: string[],
  state: InvestigationState
): { rootCount: number; totalSources: number; rootIds: string[] } {
  const allRoots = new Set<string>();
  const allSources = new Set<string>();

  for (const evId of evidenceIds) {
    const ev = state.evidence.get(evId);
    if (!ev) continue;
    allSources.add(ev.sourceId);
    const roots = traceSourceLineage(ev.sourceId, state.sources);
    roots.forEach((r) => allRoots.add(r));
  }

  return {
    rootCount: allRoots.size,
    totalSources: allSources.size,
    rootIds: [...allRoots],
  };
}
