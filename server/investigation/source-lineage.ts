// ─── SOURCE LINEAGE ENGINE ──────────────────────────────────────────────
// Detects when multiple sources ultimately rely on the same underlying source.
// "17 sources repeat this claim, but our source graph identifies only 2
//  independent underlying evidence streams."

import type { InvestigationSource, Evidence } from "./types.js";
import { traceSourceLineage } from "./evidence-graph.js";

export interface CorrelatedEvidenceReport {
  totalSources: number;
  independentRootCount: number;
  correlated: boolean;
  rootSources: Array<{ id: string; title: string; dependents: string[] }>;
  message: string;
}

export function analyzeSourceLineage(
  sources: Map<string, InvestigationSource>,
  evidence: Map<string, Evidence>
): CorrelatedEvidenceReport[] {
  const reports: CorrelatedEvidenceReport[] = [];

  // Group evidence by the claim they support
  const claimToEvidence = new Map<string, string[]>();
  for (const ev of evidence.values()) {
    if (ev.supportsClaimId) {
      const existing = claimToEvidence.get(ev.supportsClaimId) ?? [];
      existing.push(ev.id);
      claimToEvidence.set(ev.supportsClaimId, existing);
    }
  }

  for (const [claimId, evidenceIds] of claimToEvidence) {
    const sourceIds = new Set<string>();
    const rootToDependents = new Map<string, string[]>();

    for (const evId of evidenceIds) {
      const ev = evidence.get(evId);
      if (!ev) continue;
      sourceIds.add(ev.sourceId);
      const roots = traceSourceLineage(ev.sourceId, sources);
      for (const rootId of roots) {
        const deps = rootToDependents.get(rootId) ?? [];
        deps.push(ev.sourceId);
        rootToDependents.set(rootId, deps);
      }
    }

    const rootCount = rootToDependents.size;
    const totalSources = sourceIds.size;

    if (totalSources > 1 && rootCount < totalSources) {
      const rootSources = [...rootToDependents.entries()].map(([rootId, deps]) => {
        const root = sources.get(rootId);
        return {
          id: rootId,
          title: root?.title ?? "Unknown",
          dependents: [...new Set(deps)],
        };
      });

      reports.push({
        totalSources,
        independentRootCount: rootCount,
        correlated: true,
        rootSources,
        message: `${totalSources} sources support this claim, but source lineage analysis identifies only ${rootCount} independent underlying source${rootCount === 1 ? "" : "s"}.`,
      });
    }
  }

  return reports;
}

/** Mark evidence as independent or correlated based on root sources */
export function flagEvidenceIndependence(
  evidence: Map<string, Evidence>,
  sources: Map<string, InvestigationSource>
): void {
  // Group evidence by root source
  const rootToEvidence = new Map<string, string[]>();

  for (const ev of evidence.values()) {
    const roots = traceSourceLineage(ev.sourceId, sources);
    for (const rootId of roots) {
      const existing = rootToEvidence.get(rootId) ?? [];
      existing.push(ev.id);
      rootToEvidence.set(rootId, existing);
    }
  }

  // If only one root source feeds multiple evidence items, they're not independent
  for (const ev of evidence.values()) {
    const roots = traceSourceLineage(ev.sourceId, sources);
    if (roots.length === 1) {
      // Check if other evidence also comes from this root
      const sameRoot = rootToEvidence.get(roots[0]) ?? [];
      ev.independentConfirmation = sameRoot.length === 1;
      ev.rootSourceIds = roots;
    } else {
      ev.independentConfirmation = roots.length > 1;
      ev.rootSourceIds = roots;
    }
  }
}
