// A deterministic, source-linked Ruthless Investigator case review.
// Invokes the real evidence graph, source-lineage, and contradiction modules.
// It does NOT invoke the mock LLM provider (whose canned output concerns data centers).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { InvestigationSource, Evidence, Claim, Hypothesis, InvestigationState, EvidenceType, ClaimType } from "../server/investigation/types.js";
import { buildEvidenceGraph, countIndependentRoots, traceSourceLineage } from "../server/investigation/evidence-graph.js";
import { analyzeSourceLineage } from "../server/investigation/source-lineage.js";
import { detectPotentialContradictions } from "../server/investigation/contradiction.js";

type SourceInput = {id:string;title:string;url:string;sourceType:EvidenceType;isPrimary:boolean;notes:string;cites:string[]};
type ClaimInput = {id:string;text:string;type:ClaimType;evidenceClass:string;scope:string};
type EvidenceInput = {id:string;sourceId:string;text:string;type:EvidenceType;supports?:string[];contradicts?:string[]};
type HypothesisInput = {id:string;statement:string;status:string;claims:string[];caution:string};
export type CaseInput = {
  caseId:string;question:string;asOf:string;method:string;
  sources:SourceInput[];claims:ClaimInput[];evidence:EvidenceInput[];
  hypotheses:HypothesisInput[];
  investigativeLeads:Array<{event:string;status:string;url:string;note:string}>;
};
const quality={authority:0,proximity:0,specificity:0,independence:0,transparency:0,recency:0,trackRecord:0};

export function analyzeCase(data:CaseInput) {
  if (!data?.caseId || !data.question || !Array.isArray(data.sources) ||
      !Array.isArray(data.claims) || !Array.isArray(data.evidence)) throw Error("Invalid case input");
  const sources=new Map<string,InvestigationSource>();
  const evidence=new Map<string,Evidence>();
  const claims=new Map<string,Claim>();
  const hypotheses=new Map<string,Hypothesis>();
  for (const s of data.sources) {
    if (sources.has(s.id) || !/^https?:\/\//.test(s.url)) throw Error("Duplicate or invalid source " + s.id);
    sources.set(s.id,{id:s.id,title:s.title,url:s.url,sourceType:s.sourceType,
      quality:{...quality},isPrimary:s.isPrimary,addedBy:"case-audit",addedAt:0,
      cites:s.cites,citedBy:[]});
  }
  for (const s of sources.values()) for (const parent of s.cites) {
    const p=sources.get(parent);
    if (!p) throw Error("Missing root source " + parent);
    p.citedBy.push(s.id);
  }
  for (const c of data.claims) {
    if (claims.has(c.id)) throw Error("Duplicate claim " + c.id);
    claims.set(c.id,{id:c.id,text:c.text,type:c.type,createdBy:"case-audit",
      createdAt:0,status:"UNVERIFIED",supportingEvidence:[],contradictingEvidence:[]});
  }
  for (const e of data.evidence) {
    if (evidence.has(e.id) || !sources.has(e.sourceId)) throw Error("Invalid evidence " + e.id);
    if ((e.supports??[]).length>1 || (e.contradicts??[]).length>1) throw Error("Non-atomic evidence " + e.id);
    const ev:Evidence={
      id:e.id,text:e.text,type:e.type,sourceId:e.sourceId,extractedBy:"case-audit",
      extractedAt:0,independentConfirmation:false,
      rootSourceIds:traceSourceLineage(e.sourceId,sources),
      supportsClaimId:e.supports?.[0],contradictsClaimId:e.contradicts?.[0],
    };
    evidence.set(e.id,ev);
    for (const id of (e.supports??[])) {
      const claim=claims.get(id);
      if (!claim) throw Error("Missing support claim " + id);
      claim.supportingEvidence.push(e.id);
    }
    for (const id of (e.contradicts??[])) {
      const claim=claims.get(id);
      if (!claim) throw Error("Missing contrary claim " + id);
      claim.contradictingEvidence.push(e.id);
    }
  }
  for (const h of data.hypotheses) {
    for (const id of h.claims) if (!claims.has(id)) throw Error("Missing hypothesis claim " + id);
    hypotheses.set(h.id,{
      id:h.id,statement:h.statement,type:"CAUSAL",supportLevel:"INSUFFICIENT_EVIDENCE",
      claims:h.claims,supportingEvidence:[],contradictingEvidence:[],assumptions:[],
      expectedEvidence:[],unknowns:[h.caution],agentAssessments:[],iterations:[],
      createdAt:0,updatedAt:0,
    });
  }
  const state={
    id:data.caseId,question:data.question,phase:"EVIDENCE_ANALYSIS",
    sources,evidence,claims,hypotheses,contradictions:new Map(),
  } as unknown as InvestigationState;
  const claimReviews=data.claims.map(c=>{
    const claim=claims.get(c.id)!;
    const supporting=claim.supportingEvidence.map(id=>evidence.get(id)!);
    const contrary=claim.contradictingEvidence.map(id=>evidence.get(id)!);
    const roots=countIndependentRoots(claim.supportingEvidence,state);
    return {
      id:c.id,claim:c.text,evidenceClass:c.evidenceClass,scope:c.scope,
      supporting: supporting.map(ev=>({id:ev.id,text:ev.text,sourceId:ev.sourceId,rootSourceIds:ev.rootSourceIds})),
      contrary: contrary.map(ev=>({id:ev.id,text:ev.text,sourceId:ev.sourceId,rootSourceIds:ev.rootSourceIds})),
      publicationRoots:roots.rootCount,
      status:supporting.length===0 ? "not-substantiated-in-reviewed-corpus" :
        contrary.length>0 ? "conflicting-or-incomplete" : "source-backed-not-conclusively-verified",
    };
  });
  const lineageWarnings=analyzeSourceLineage(sources,evidence);
  const conflicts=detectPotentialContradictions(claims,evidence).map((c,i)=>({
    id:"conflict-"+(i+1),description:c.description,claimA:c.claimA,claimB:c.claimB,
    status:"potential-disputed-accounts-not-adjudicated",
    note:"Multiple commenters on one Reddit thread need separate verification.",
  }));
  const graph=buildEvidenceGraph(state);
  return {
    caseId:data.caseId,question:data.question,asOf:data.asOf,
    analysisMethod:"Ruthless Investigator evidence-graph, source-lineage and contradiction modules. No LLM council calls.",
    counts:{
      sources:sources.size,evidenceItems:evidence.size,claims:claims.size,
      hypotheses:hypotheses.size,graphNodes:graph.nodes.length,
      graphEdges:graph.edges.length,sourceLineageWarnings:lineageWarnings.length,
      structuralConflicts:conflicts.length,
    },
    assessment:{
      activeUndergroundMilitaryConstruction:"not-substantiated-by-the-reviewed-corpus",
      militaryFlights:"documented-for-several-specific-dates",
      utilityAndCoastGuardExplanations:"documented-for-specific-programs-only",
      boomsAndVibrations:"witness-reports-with-causes-incomplete-or-disputed",
      predictionDate:null,
      caution:"Eyewitness reports are not underground measurements. Historical military installations do not establish active covert construction.",
    },
    hypotheses:data.hypotheses,claimReviews,sourceLineageWarnings:lineageWarnings,
    conflicts,unreviewedLeads:data.investigativeLeads,sources:data.sources,
    graph,
  };
}
export function markdown(report:ReturnType<typeof analyzeCase>):string {
  const rows=[
    "# Ruthless Investigator: McKinleyville and Humboldt military/underground claims",
    "",
    "Assessment dated: "+report.asOf,
    "Method: "+report.analysisMethod,
    "",
    "## Findings",
    "Confirmed or attributed: military/Coast Guard aircraft and PG&E inspections on several documented dates.",
    "Unresolved: certain booms and vibrations; their physical causes have not been established.",
    "Not substantiated: active secret underground military construction in the reviewed material.",
    "The lack of evidence is not proof that no undisclosed infrastructure exists.",
    "",
    "## Counts",
    ...Object.entries(report.counts).map(([key,value])=>"- "+key+": "+value),
    "",
    "## Competing hypotheses",
    ...report.hypotheses.map(h=>"- "+h.id+": "+h.statement+" ("+h.status+"). Limit: "+h.caution),
    "",
    "## Claims and provenance",
  ];
  for (const c of report.claimReviews) {
    rows.push("", "### "+c.id+": "+c.claim,
      "Status: "+c.status+"; supporting items: "+c.supporting.length+
      "; contrary items: "+c.contrary.length+"; source roots: "+c.publicationRoots+" (not necessarily independent eyewitnesses).");
    for (const e of c.supporting)rows.push("- SUPPORT: "+e.text+" ["+e.sourceId+"; roots="+e.rootSourceIds.join(",")+"]");
    for (const e of c.contrary)rows.push("- LIMIT/CONTRARY: "+e.text+" ["+e.sourceId+"]");
  }
  rows.push("", "## Source lineage flags");
  rows.push(...(report.sourceLineageWarnings.length
    ? report.sourceLineageWarnings.map(w=>"- "+w.message)
    : ["- No multi-publication same-root warnings; some anecdotes still lack independent corroboration."]));
  rows.push("", "## Potential contradictions");
  rows.push(...(report.conflicts.length
    ? report.conflicts.map(c=>"- "+c.description+" (not adjudicated)")
    : ["- No structurally detected contradictions; this does not prove consensus."]));
  rows.push("", "## Unreviewed or undated leads");
  rows.push(...report.unreviewedLeads.map(l=>"- "+l.event+": "+l.status+". "+l.note+" "+l.url));
  rows.push("", "## Highest-value next inquiries",
    "1. Get exact time-of-day reports for September 10 Arcata rattling; compare with USGS and local permitted construction work.",
    "2. Compare late-September boom accounts with emergency dispatch logs and any video, checking the firework-witness account.",
    "3. Keep February Coast Guard, August National Guard and autumn PG&E operations separate by exact day and aircraft.",
    "4. Seek dated engineering, excavation, subsurface seismic or disposal records before accepting an underground military theory.",
    "5. Seek original architectural plans for alleged hospitals/Arcata civic passages.",
    "",
    "## Source URLs");
  rows.push(...report.sources.map(s=>"- "+s.title+": "+s.url));
  rows.push("", "## Limits",
    "This deterministic audit consumes a curated source corpus and invokes Ruthless Investigator code, NOT the full multi-model investigation council.",
    "The mock LLM provider was intentionally excluded because its preset output covers unrelated data centers.",
    "Source URLs were reviewed separately; the runner does not independently retrieve the sites in real time.",
    "");
  return rows.join("\n");
}
async function main(){
  const input=fileURLToPath(new URL("../cases/humboldt-activity-2026/corpus.json",import.meta.url));
  const data=JSON.parse(await readFile(input,"utf8")) as CaseInput;
  const report=analyzeCase(data);
  const folder=resolve(process.argv[2]??"case-output/humboldt-2026");
  await mkdir(folder,{recursive:true});
  await writeFile(resolve(folder,"assessment.json"),JSON.stringify(report,null,2)+"\n");
  await writeFile(resolve(folder,"assessment.md"),markdown(report));
  console.log(JSON.stringify({
    caseId:report.caseId,counts:report.counts,
    assessment:report.assessment,
    hypotheses:report.hypotheses.map(h=>({id:h.id,status:h.status})),
  },null,2));
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  main().catch(e=>{console.error("Case audit failed:",e.message);process.exitCode=1});
}
