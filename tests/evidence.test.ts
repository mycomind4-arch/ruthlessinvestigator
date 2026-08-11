// ─── TESTS: Evidence & Source Provenance ──────────────────────────────────
// Every evidence item traces to a source. Source lineage works.

import { describe, it, expect, beforeEach } from "vitest";
import type { InvestigationSource, Evidence } from "../server/investigation/types.js";
import { traceSourceLineage, countIndependentRoots } from "../server/investigation/evidence-graph.js";
import { flagEvidenceIndependence, analyzeSourceLineage } from "../server/investigation/source-lineage.js";

describe("Evidence Provenance", () => {
  it("Every evidence item references a source", () => {
    const sources = new Map<string, InvestigationSource>();
    const evidence = new Map<string, Evidence>();

    const srcId = "src-1";
    sources.set(srcId, {
      id: srcId, title: "DOE Report", sourceType: "GOVERNMENT_RECORD",
      quality: { authority: 0.8, proximity: 0.8, specificity: 0.6, independence: 0.8, transparency: 0.7, recency: 0.8, trackRecord: 0.7 },
      citedBy: [], cites: [], isPrimary: true, addedBy: "test", addedAt: Date.now(),
    });

    const evId = "ev-1";
    evidence.set(evId, {
      id: evId, text: "Data centers consumed 4.4% of U.S. electricity", type: "MEASUREMENT",
      sourceId: srcId, extractedBy: "test", extractedAt: Date.now(),
      independentConfirmation: true, rootSourceIds: [srcId],
    });

    const ev = evidence.get(evId)!;
    expect(ev.sourceId).toBeTruthy();
    expect(sources.get(ev.sourceId)).toBeDefined();
  });

  it("Source lineage traces to root sources", () => {
    const sources = new Map<string, InvestigationSource>();

    // A → B → C (chain)
    sources.set("A", { id: "A", title: "Root", sourceType: "GOVERNMENT_RECORD", quality: {} as any, citedBy: ["B"], cites: [], isPrimary: true, addedBy: "test", addedAt: 0 });
    sources.set("B", { id: "B", title: "Secondary", sourceType: "SECONDARY_REPORT", quality: {} as any, citedBy: ["C"], cites: ["A"], isPrimary: false, addedBy: "test", addedAt: 0 });
    sources.set("C", { id: "C", title: "Tertiary", sourceType: "SECONDARY_REPORT", quality: {} as any, citedBy: [], cites: ["B"], isPrimary: false, addedBy: "test", addedAt: 0 });

    const roots = traceSourceLineage("C", sources);
    expect(roots).toContain("A");
    expect(roots.length).toBe(1); // Only one root: A
  });

  it("Independent sources have separate roots", () => {
    const sources = new Map<string, InvestigationSource>();
    sources.set("A", { id: "A", title: "Root A", sourceType: "GOVERNMENT_RECORD", quality: {} as any, citedBy: [], cites: [], isPrimary: true, addedBy: "test", addedAt: 0 });
    sources.set("B", { id: "B", title: "Root B", sourceType: "ACADEMIC_FINDING", quality: {} as any, citedBy: [], cites: [], isPrimary: true, addedBy: "test", addedAt: 0 });

    const rootsA = traceSourceLineage("A", sources);
    const rootsB = traceSourceLineage("B", sources);
    expect(rootsA).toEqual(["A"]);
    expect(rootsB).toEqual(["B"]);
    expect(rootsA).not.toEqual(rootsB);
  });

  it("Correlated sources are detected", () => {
    const sources = new Map<string, InvestigationSource>();
    const evidence = new Map<string, Evidence>();

    // Root source
    sources.set("root", { id: "root", title: "DOE Report", sourceType: "GOVERNMENT_RECORD", quality: {} as any, citedBy: ["s1", "s2"], cites: [], isPrimary: true, addedBy: "test", addedAt: 0 });
    // Two secondary sources citing the same root
    sources.set("s1", { id: "s1", title: "Reuters article", sourceType: "SECONDARY_REPORT", quality: {} as any, citedBy: [], cites: ["root"], isPrimary: false, addedBy: "test", addedAt: 0 });
    sources.set("s2", { id: "s2", title: "McKinsey report", sourceType: "SECONDARY_REPORT", quality: {} as any, citedBy: [], cites: ["root"], isPrimary: false, addedBy: "test", addedAt: 0 });

    // Evidence from both secondary sources supporting the same claim
    evidence.set("ev1", { id: "ev1", text: "Fact 1", type: "OBSERVATION", sourceId: "s1", extractedBy: "test", extractedAt: 0, independentConfirmation: true, rootSourceIds: ["root"], supportsClaimId: "claim1" });
    evidence.set("ev2", { id: "ev2", text: "Fact 2", type: "OBSERVATION", sourceId: "s2", extractedBy: "test", extractedAt: 0, independentConfirmation: true, rootSourceIds: ["root"], supportsClaimId: "claim1" });

    flagEvidenceIndependence(evidence, sources);

    // Both should be flagged as not independent (same root)
    expect(evidence.get("ev1")!.independentConfirmation).toBe(false);
    expect(evidence.get("ev2")!.independentConfirmation).toBe(false);

    const reports = analyzeSourceLineage(sources, evidence);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0].correlated).toBe(true);
    expect(reports[0].totalSources).toBe(2);
    expect(reports[0].independentRootCount).toBe(1);
  });
});
