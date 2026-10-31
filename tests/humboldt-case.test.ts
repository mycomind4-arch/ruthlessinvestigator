import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyzeCase, type CaseInput } from "../scripts/run-humboldt-case.js";
const source=fileURLToPath(new URL("../cases/humboldt-activity-2026/corpus.json",import.meta.url));
const data=JSON.parse(readFileSync(source,"utf8")) as CaseInput;
describe("Humboldt activity evidence-lineage audit",()=>{
  const output=analyzeCase(data);
  it("actually builds the Ruthless Investigator source/evidence/claim graph",()=>{
    expect(output.counts.graphNodes).toBeGreaterThan(output.counts.sources);
    expect(output.counts.graphEdges).toBeGreaterThan(output.counts.evidenceItems);
    expect(output.counts.evidenceItems).toBe(18);
  });
  it("does not fabricate support for active underground military construction",()=>{
    const claim=output.claimReviews.find(x=>x.id==="c-active-tunnels");
    expect(claim?.supporting).toHaveLength(0);
    expect(claim?.status).toBe("not-substantiated-in-reviewed-corpus");
    expect(output.assessment.activeUndergroundMilitaryConstruction).toBe("not-substantiated-by-the-reviewed-corpus");
  });
  it("detects when repeat PG&E explanations originate from one statement",()=>{
    const c=output.claimReviews.find(x=>x.id==="c-sept-pge");
    expect(c?.supporting).toHaveLength(2);
    expect(c?.publicationRoots).toBe(1);
    expect(output.sourceLineageWarnings.length).toBeGreaterThan(0);
  });
  it("does not confuse October PG&E sightings with military aircraft",()=>{
    const army=output.claimReviews.find(x=>x.id==="c-military-flights");
    expect(army?.supporting.some(x=>x.sourceId==="reddit-oct-25")).toBe(false);
    expect(output.claimReviews.find(x=>x.id==="c-oct-utility-sightings")?.supporting).toHaveLength(1);
  });
  it("retains both sides of the firework vs falling-object debate",()=>{
    const c=output.claimReviews.find(x=>x.id==="c-sept-boom-firework");
    expect(c?.supporting.length).toBeGreaterThan(0);
    expect(c?.contrary.length).toBeGreaterThan(0);
    expect(c?.status).toBe("conflicting-or-incomplete");
    expect(output.counts.structuralConflicts).toBeGreaterThan(0);
  });
  it("excludes inaccessible or undated online claims from supporting evidence",()=>{
    expect(output.unreviewedLeads.length).toBeGreaterThan(0);
    expect(output.claimReviews.find(x=>x.id==="c-active-tunnels")?.supporting).toHaveLength(0);
  });
});
