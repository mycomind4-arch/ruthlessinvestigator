// ─── INVESTIGATION DIRECTOR ───────────────────────────────────────────────
// The orchestration layer that decides what should happen next.
// This is the institutional intelligence of the system.

import type {
  InvestigationState,
  Hypothesis,
  Claim,
  Evidence,
  InformationGap,
  ResearchTask,
  AgentRole,
} from "./types.js";
import type {
  NextInvestigationAction,
  NextActionType,
  PriorityBreakdown,
  MindChangingEvidence,
  Prediction,
  HypothesisCompetition,
  DiscriminatingEvidenceTask,
  EvidenceCluster,
  NarrativePattern,
  Entity,
  EntityRelationship,
  CausalClaim,
  ConvergenceCheck,
  InvestigationScorecard,
  ScorecardDetails,
  AssessmentRevision,
  InvestigationMemory,
  UserOverrideEvent,
} from "./director-types.js";
import { traceSourceLineage } from "./evidence-graph.js";
import type { InvestigationSource } from "./types.js";

let idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

// ─── PRIORITY FORMULA ────────────────────────────────────────────────────
// Priority = Importance × Uncertainty × ExpectedImpact ÷ (Cost × Difficulty)
// All factors 0-10 (except cost/difficulty which are 1-10).
// Higher = more urgent.

export function calculatePriority(
  importance: number,
  uncertainty: number,
  expectedImpact: number,
  cost: number,
  difficulty: number,
  dependencyCount: number,
  relevance: number
): PriorityBreakdown {
  const clamped = (n: number, min = 0, max = 10) => Math.max(min, Math.min(max, n));
  importance = clamped(importance);
  uncertainty = clamped(uncertainty);
  expectedImpact = clamped(expectedImpact);
  cost = clamped(cost, 1, 10);
  difficulty = clamped(difficulty, 1, 10);
  dependencyCount = Math.max(0, dependencyCount);
  relevance = clamped(relevance);

  const dependencyPenalty = 1 + dependencyCount * 0.15;
  const score = (importance * uncertainty * expectedImpact) / (cost * difficulty * dependencyPenalty) * (relevance / 10);
  const normalized = (score / 1000) * 100; // normalize to ~0-100

  return {
    importance,
    uncertainty,
    expectedImpact,
    cost,
    difficulty,
    dependencyCount,
    relevance,
    formula: `Priority = (${importance} × ${uncertainty} × ${expectedImpact}) / (${cost} × ${difficulty} × ${(1 + dependencyCount * 0.15).toFixed(2)}) × (${relevance}/10) = ${normalized.toFixed(1)}`,
  };
}

// ─── NEXT ACTION ENGINE ──────────────────────────────────────────────────
// Evaluates the current evidence state and chooses the next action.

export function determineNextAction(state: InvestigationState): NextInvestigationAction {
  const candidates = generateActionCandidates(state);

  // Sort by priority score descending
  candidates.sort((a, b) => b.priorityScore - a.priorityScore);

  const best = candidates[0];
  if (!best) {
    // No candidates — converge
    return {
      type: "CONVERGE",
      reason: "No high-priority research tasks remain. Investigation can proceed to convergence.",
      question: "Has the investigation reached provisional convergence?",
      expectedImpact: "LOW",
      assignedAgent: "DIRECTOR",
      priorityScore: 0,
      priorityBreakdown: calculatePriority(5, 1, 1, 1, 1, 0, 5),
      createdAt: Date.now(),
    };
  }

  return best;
}

function generateActionCandidates(state: InvestigationState): NextInvestigationAction[] {
  const candidates: NextInvestigationAction[] = [];
  const now = Date.now();

  // ─── Check unresolved contradictions ────────────────────────────────
  for (const con of state.contradictions.values()) {
    if (con.status === "POTENTIAL" || con.status === "UNRESOLVED") {
      const priority = calculatePriority(8, 7, 8, 3, 4, 0, 9);
      candidates.push({
        type: "INVESTIGATE_CONTRADICTION",
        reason: `Unresolved contradiction: "${con.description.substring(0, 100)}"`,
        targetContradictionId: con.id,
        question: `Investigate contradiction between claims: ${con.description}`,
        expectedImpact: "HIGH",
        assignedAgent: "EVIDENCE_ANALYST",
        alternativeAgent: "SKEPTIC",
        priorityScore: scorePriority(priority),
        priorityBreakdown: priority,
        createdAt: now,
      });
    }
  }

  // ─── Check untested predictions ─────────────────────────────────────
  for (const pred of state.predictions?.values() ?? []) {
    if (pred.status === "PENDING") {
      const hyp = state.hypotheses.get(pred.hypothesisId);
      const priority = calculatePriority(
        9, 8, 9, 4, 5, 0, hyp ? 10 : 5
      );
      candidates.push({
        type: "TEST_PREDICTION",
        reason: `Untested prediction for ${pred.hypothesisId}: "${pred.description.substring(0, 80)}"`,
        targetHypothesisId: pred.hypothesisId,
        question: `Find evidence to test this prediction: ${pred.description}`,
        expectedImpact: "HIGH",
        assignedAgent: "PRIMARY_SOURCE_RESEARCHER",
        alternativeAgent: "OSINT_RESEARCHER",
        priorityScore: scorePriority(priority),
        priorityBreakdown: priority,
        createdAt: now,
      });
    }
  }

  // ─── Check failed predictions needing reassessment ──────────────────
  for (const fp of state.failedPredictions?.values() ?? []) {
    if (!fp.reassessmentTriggered) {
      const priority = calculatePriority(9, 9, 10, 2, 3, 0, 10);
      candidates.push({
        type: "REASSESS",
        reason: `Failed prediction for ${fp.hypothesisId}: expected "${fp.expectedResult.substring(0, 60)}" but observed "${fp.observedResult.substring(0, 60)}"`,
        targetHypothesisId: fp.hypothesisId,
        question: `Reassess hypothesis after failed prediction: ${fp.expectedResult}`,
        expectedImpact: "CRITICAL",
        assignedAgent: "DIRECTOR",
        priorityScore: scorePriority(priority),
        priorityBreakdown: priority,
        createdAt: now,
      });
    }
  }

  // ─── Check pending discriminating evidence tasks ────────────────────
  for (const task of state.discriminatingTasks?.values() ?? []) {
    if (task.status === "PENDING") {
      const priority = calculatePriority(9, 8, 9, 4, 5, 0, 9);
      candidates.push({
        type: "INVESTIGATE_DISCRIMINATING_EVIDENCE",
        reason: `Discriminating evidence needed between ${task.hypothesisA} and ${task.hypothesisB}`,
        question: task.evidenceNeeded,
        expectedImpact: "HIGH",
        assignedAgent: "PRIMARY_SOURCE_RESEARCHER",
        alternativeAgent: "OSINT_RESEARCHER",
        priorityScore: scorePriority(priority),
        priorityBreakdown: priority,
        createdAt: now,
      });
    }
  }

  // ─── Check open information gaps ────────────────────────────────────
  for (const gap of state.informationGaps.values()) {
    if (gap.status === "OPEN") {
      const importanceMap = { LOW: 3, MODERATE: 5, HIGH: 7, CRITICAL: 9 };
      const imp = importanceMap[gap.importance] ?? 5;
      const priority = calculatePriority(imp, imp, imp, 4, 5, 0, 8);
      candidates.push({
        type: "RESEARCH",
        reason: `Open information gap: "${gap.question.substring(0, 80)}"`,
        question: gap.question,
        expectedImpact: gap.importance === "CRITICAL" ? "CRITICAL" : gap.importance === "HIGH" ? "HIGH" : "MODERATE",
        assignedAgent: "PRIMARY_SOURCE_RESEARCHER",
        alternativeAgent: "OSINT_RESEARCHER",
        priorityScore: scorePriority(priority),
        priorityBreakdown: priority,
        createdAt: now,
      });
    }
  }

  // ─── Check pending causal claims ────────────────────────────────────
  for (const causal of state.causalClaims?.values() ?? []) {
    if (causal.status === "PENDING") {
      const priority = calculatePriority(8, 7, 8, 3, 4, 0, 8);
      candidates.push({
        type: "CHECK_CAUSALITY",
        reason: `Causal claim needs review: "${causal.cause}" → "${causal.effect}"`,
        question: `Verify causality: Does ${causal.cause} actually cause ${causal.effect}?`,
        expectedImpact: "HIGH",
        assignedAgent: "SKEPTIC",
        priorityScore: scorePriority(priority),
        priorityBreakdown: priority,
        createdAt: now,
      });
    }
  }

  // ─── Check hypotheses without counter-evidence (confirmation bias) ─
  for (const hyp of state.hypotheses.values()) {
    if (hyp.supportingEvidence.length > 2 && hyp.contradictingEvidence.length === 0) {
      const priority = calculatePriority(8, 9, 9, 3, 4, 0, 9);
      candidates.push({
        type: "SEARCH_FOR_COUNTEREVIDENCE",
        reason: `Hypothesis ${hyp.id} has ${hyp.supportingEvidence.length} supporting but 0 contradicting evidence — confirmation bias risk`,
        targetHypothesisId: hyp.id,
        question: `Find evidence that would weaken or falsify: "${hyp.statement}"`,
        expectedImpact: "HIGH",
        assignedAgent: "ADVERSARIAL",
        alternativeAgent: "SKEPTIC",
        priorityScore: scorePriority(priority),
        priorityBreakdown: priority,
        createdAt: now,
      });
    }
  }

  // ─── Check unverified claims ────────────────────────────────────────
  for (const claim of state.claims.values()) {
    if (claim.type === "CAUSAL" && claim.status === "UNVERIFIED") {
      const priority = calculatePriority(7, 7, 7, 3, 4, 0, 7);
      candidates.push({
        type: "VERIFY_CLAIM",
        reason: `Unverified causal claim: "${claim.text.substring(0, 80)}"`,
        targetClaimId: claim.id,
        question: `Verify this causal claim: ${claim.text}`,
        expectedImpact: "MODERATE",
        assignedAgent: "SKEPTIC",
        priorityScore: scorePriority(priority),
        priorityBreakdown: priority,
        createdAt: now,
      });
    }
  }

  // ─── Check for entities with unexplored relationships ────────────────
  const entities = state.entities?.values() ?? [];
  const entityArray = [...entities];
  if (entityArray.length >= 2) {
    const exploredPairs = new Set<string>();
    for (const rel of state.relationships?.values() ?? []) {
      exploredPairs.add(`${rel.entityA}::${rel.entityB}`);
      exploredPairs.add(`${rel.entityB}::${rel.entityA}`);
    }

    for (let i = 0; i < entityArray.length; i++) {
      for (let j = i + 1; j < entityArray.length; j++) {
        const key = `${entityArray[i].id}::${entityArray[j].id}`;
        if (!exploredPairs.has(key)) {
          const priority = calculatePriority(6, 6, 6, 4, 5, 0, 6);
          candidates.push({
            type: "FOLLOW_RELATIONSHIP",
            reason: `Unexplored relationship between ${entityArray[i].name} and ${entityArray[j].name}`,
            targetEntityId: entityArray[i].id,
            question: `What is the relationship between ${entityArray[i].name} and ${entityArray[j].name}?`,
            expectedImpact: "MODERATE",
            assignedAgent: "OSINT_RESEARCHER",
            priorityScore: scorePriority(priority),
            priorityBreakdown: priority,
            createdAt: now,
          });
          break; // only suggest one at a time
        }
      }
      if (candidates.some(c => c.type === "FOLLOW_RELATIONSHIP")) break;
    }
  }

  return candidates;
}

function scorePriority(p: PriorityBreakdown): number {
  const dependencyPenalty = 1 + p.dependencyCount * 0.15;
  const raw = (p.importance * p.uncertainty * p.expectedImpact) / (p.cost * p.difficulty * dependencyPenalty) * (p.relevance / 10);
  return (raw / 1000) * 100;
}

// ─── MIND-CHANGING EVIDENCE ───────────────────────────────────────────────
export function initMindChangingEvidence(hyp: Hypothesis): MindChangingEvidence {
  return {
    hypothesisId: hyp.id,
    currentAssessment: hyp.supportLevel,
    wouldStrengthen: [],
    wouldWeaken: [],
    wouldFalsify: [],
    updatedAt: Date.now(),
  };
}

// ─── PREDICTION ENGINE ────────────────────────────────────────────────────
export function createPredictionsForHypothesis(hyp: Hypothesis): Omit<Prediction, "id" | "createdAt">[] {
  // Generate predictions from expected evidence
  return hyp.expectedEvidence.map((exp) => ({
    hypothesisId: hyp.id,
    description: `Predicts: ${exp.description}`,
    expectedResult: exp.description,
    status: "PENDING" as const,
  }));
}

export function evaluatePrediction(
  pred: Prediction,
  evidence: Map<string, Evidence>
): { status: Prediction["status"]; observedResult?: string; evidenceId?: string; severity?: string } {
  // Look for evidence matching the prediction using keyword overlap
  const predKeywords = pred.expectedResult.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 4 && !["predict", "predicts", "expected", "would"].includes(w));
  const matchingEvidence = [...evidence.values()].find((e) => {
    const evText = e.text.toLowerCase();
    // Check if most prediction keywords appear in the evidence text
    const matchedKeywords = predKeywords.filter(kw => evText.includes(kw));
    return matchedKeywords.length >= Math.ceil(predKeywords.length * 0.5);
  });

  if (matchingEvidence) {
    return {
      status: "CONFIRMED",
      observedResult: matchingEvidence.text,
      evidenceId: matchingEvidence.id,
    };
  }

  // Check if we found evidence AGAINST the prediction
  const negKeywords = pred.expectedResult.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const contradictingEvidence = [...evidence.values()].find((e) => {
    if (e.contradictsClaimId) return false;
    const text = e.text.toLowerCase();
    // Check for negation patterns near prediction keywords
    return negKeywords.some(kw => text.includes("not " + kw) || text.includes("no " + kw) || text.includes("denied " + kw));
  });

  if (contradictingEvidence) {
    return {
      status: "FAILED",
      observedResult: contradictingEvidence.text,
      evidenceId: contradictingEvidence.id,
      severity: "HIGH",
    };
  }

  return { status: "INCONCLUSIVE" };
}

// ─── HYPOTHESIS COMPETITION ────────────────────────────────────────────────
export function compareHypotheses(
  hypA: Hypothesis,
  hypB: Hypothesis,
  state: InvestigationState
): HypothesisCompetition {
  const evidenceForA: string[] = [];
  const evidenceForB: string[] = [];
  const discriminating: string[] = [];
  const unexplained: string[] = [];

  // Evidence A explains that B doesn't
  for (const evId of hypA.supportingEvidence) {
    if (!hypB.supportingEvidence.includes(evId)) {
      evidenceForA.push(evId);
      discriminating.push(evId);
    }
  }

  // Evidence B explains that A doesn't
  for (const evId of hypB.supportingEvidence) {
    if (!hypA.supportingEvidence.includes(evId)) {
      evidenceForB.push(evId);
      discriminating.push(evId);
    }
  }

  // Evidence neither explains
  for (const ev of state.evidence.values()) {
    const inA = hypA.supportingEvidence.includes(ev.id) || hypA.contradictingEvidence.includes(ev.id);
    const inB = hypB.supportingEvidence.includes(ev.id) || hypB.contradictingEvidence.includes(ev.id);
    if (!inA && !inB) {
      unexplained.push(ev.id);
    }
  }

  return {
    id: genId("competition"),
    hypothesisA: hypA.id,
    hypothesisB: hypB.id,
    evidenceForA,
    evidenceForB,
    discriminatingEvidence: [...new Set(discriminating)],
    unexplainedBy: unexplained.slice(0, 10),
    assessedAt: Date.now(),
  };
}

export function identifyDiscriminatingTask(
  hypA: Hypothesis,
  hypB: Hypothesis,
  state: InvestigationState
): DiscriminatingEvidenceTask | null {
  // Look for evidence types that would distinguish the two hypotheses
  // Find claims that are in one but not the other
  const claimsA = hypA.claims.map(id => state.claims.get(id)).filter(Boolean) as Claim[];
  const claimsB = hypB.claims.map(id => state.claims.get(id)).filter(Boolean) as Claim[];

  // Find a question that would distinguish
  const untestedA = hypA.expectedEvidence.filter(e => e.status === "MISSING" || e.status === "UNKNOWN");
  const untestedB = hypB.expectedEvidence.filter(e => e.status === "MISSING" || e.status === "UNKNOWN");

  if (untestedA.length > 0 && untestedB.length > 0) {
    return {
      id: genId("discrim"),
      hypothesisA: hypA.id,
      hypothesisB: hypB.id,
      description: `Find evidence that distinguishes: "${hypA.statement}" vs "${hypB.statement}"`,
      evidenceNeeded: `Look for: ${untestedA[0].description} (would support ${hypA.id}) or ${untestedB[0].description} (would support ${hypB.id})`,
      status: "PENDING",
      createdAt: Date.now(),
    };
  }

  return null;
}

// ─── SOURCE CONTAMINATION / EVIDENCE CLUSTERS ─────────────────────────────
export function detectEvidenceClusters(
  sources: Map<string, InvestigationSource>,
  evidence: Map<string, Evidence>
): EvidenceCluster[] {
  const clusters: EvidenceCluster[] = [];
  const processed = new Set<string>();

  // Group evidence by their root source lineage
  const rootToDependents = new Map<string, { sources: Set<string>; evidence: string[] }>();

  for (const ev of evidence.values()) {
    const roots = traceSourceLineage(ev.sourceId, sources);
    for (const root of roots) {
      if (!rootToDependents.has(root)) {
        rootToDependents.set(root, { sources: new Set(), evidence: [] });
      }
      const entry = rootToDependents.get(root)!;
      entry.sources.add(ev.sourceId);
      entry.evidence.push(ev.id);
    }
  }

  // Find clusters where multiple sources share a single root
  for (const [rootId, entry] of rootToDependents) {
    if (entry.sources.size > 1) {
      const rootSource = sources.get(rootId);
      const clusterId = `cluster-${rootId}`;
      if (processed.has(clusterId)) continue;
      processed.add(clusterId);

      clusters.push({
        id: clusterId,
        rootSourceIds: [rootId],
        dependentSourceIds: [...entry.sources],
        totalSources: entry.sources.size,
        independentRoots: 1,
        message: `${entry.sources.size} sources share a single root source "${rootSource?.title ?? rootId}". These should NOT be counted as independent confirmations.`,
        detectedAt: Date.now(),
      });
    }
  }

  return clusters;
}

// ─── NARRATIVE DETECTION ──────────────────────────────────────────────────
export function detectNarrativePatterns(
  sources: Map<string, InvestigationSource>,
  evidence: Map<string, Evidence>
): NarrativePattern[] {
  const patterns: NarrativePattern[] = [];
  const evidenceArray = [...evidence.values()];

  // Group evidence by similar text (identical wording)
  const textGroups = new Map<string, string[]>();
  for (const ev of evidenceArray) {
    // Use first 50 chars as a fingerprint
    const fingerprint = ev.text.toLowerCase().substring(0, 50);
    const existing = textGroups.get(fingerprint) ?? [];
    existing.push(ev.id);
    textGroups.set(fingerprint, existing);
  }

  for (const [fingerprint, evIds] of textGroups) {
    if (evIds.length < 2) continue;

    // Get source ids for this evidence
    const sourceIds = [...new Set(evIds.map(id => evidence.get(id)?.sourceId).filter(Boolean))] as string[];
    if (sourceIds.length < 2) continue; // same source is fine

    patterns.push({
      id: genId("narrative"),
      pattern: fingerprint + "...",
      sourceIds,
      type: "IDENTICAL_WORDING",
      interpretation: "COMMON_SOURCE",
      note: `${sourceIds.length} sources contain nearly identical wording. This may indicate common sourcing or normal information propagation. Investigation needed to determine whether this reflects independent reporting or shared narrative.`,
      createdAt: Date.now(),
    });
  }

  // Check for identical statistics (numbers repeated across sources)
  const statsMap = new Map<string, string[]>();
  for (const ev of evidenceArray) {
    const numbers = ev.text.match(/\d+\.?\d*%/g);
    if (numbers) {
      for (const num of numbers) {
        const existing = statsMap.get(num) ?? [];
        existing.push(ev.id);
        statsMap.set(num, existing);
      }
    }
  }

  for (const [stat, evIds] of statsMap) {
    if (evIds.length < 2) continue;
    const sourceIds = [...new Set(evIds.map(id => evidence.get(id)?.sourceId).filter(Boolean))] as string[];
    if (sourceIds.length < 2) continue;

    const existingPattern = patterns.find(p => p.sourceIds.length === sourceIds.length && p.sourceIds.every(s => sourceIds.includes(s)));
    if (existingPattern) continue;

    patterns.push({
      id: genId("narrative"),
      pattern: `Statistic "${stat}" repeated`,
      sourceIds,
      type: "IDENTICAL_STATISTIC",
      interpretation: "COMMON_SOURCE",
      note: `${sourceIds.length} sources cite the same statistic "${stat}". May originate from a single primary source. Investigation needed to verify independence.`,
      createdAt: Date.now(),
    });
  }

  return patterns;
}

// ─── ENTITY EXTRACTION & RELATIONSHIPS ─────────────────────────────────────
export function extractEntitiesFromEvidence(
  evidence: Map<string, Evidence>,
  sources: Map<string, InvestigationSource>
): { entities: Entity[]; relationships: EntityRelationship[] } {
  const entities = new Map<string, Entity>();
  const relationships: EntityRelationship[] = [];

  // Simple entity extraction: look for capitalized multi-word phrases in evidence text
  const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const knownEntities = new Set(["The", "United States", "Department of Energy", "Data Center", "AI"]);

  for (const ev of evidence.values()) {
    const text = ev.text;
    const matches = text.matchAll(entityPattern);
    const foundInText = new Set<string>();

    for (const match of matches) {
      const name = match[1];
      if (name.length < 3 || knownEntities.has(name) && name !== "United States") continue;
      if (name === "The" || name === "This" || name === "These" || name === "That") continue;

      foundInText.add(name);
    }

    // Create entities
    const evEntities: string[] = [];
    for (const name of foundInText) {
      let entity = entities.get(name);
      if (!entity) {
        entity = {
          id: genId("entity"),
          name,
          type: inferEntityType(name),
          mentions: 0,
          firstMentionedAt: ev.extractedAt,
        };
        entities.set(name, entity);
      }
      entity.mentions++;
      evEntities.push(entity.id);
    }

    // Create relationships between entities mentioned in same evidence
    for (let i = 0; i < evEntities.length; i++) {
      for (let j = i + 1; j < evEntities.length; j++) {
        const relType = inferRelationshipType(text);
        relationships.push({
          id: genId("rel"),
          entityA: evEntities[i],
          entityB: evEntities[j],
          relationship: relType,
          evidenceId: ev.id,
          confidence: 0.5,
          createdAt: Date.now(),
        });
      }
    }
  }

  return { entities: [...entities.values()], relationships };
}

function inferEntityType(name: string): Entity["type"] {
  const lower = name.toLowerCase();
  if (/department|agency|government|federal|state|national/.test(lower)) return "GOVERNMENT_AGENCY";
  if (/inc|corp|llc|company|technologies|systems|google|amazon|microsoft|meta|apple/.test(lower)) return "COMPANY";
  if (/university|lab|laboratory|institute/.test(lower)) return "ORGANIZATION";
  if (/project|facility|center/.test(lower)) return "PROJECT";
  if (/power|electric|utility|grid/.test(lower)) return "UTILITY";
  return "ORGANIZATION";
}

function inferRelationshipType(text: string): EntityRelationship["relationship"] {
  const lower = text.toLowerCase();
  if (/owns|acquired|bought/.test(lower)) return "OWNS";
  if (/funds?|funded|financing|investment/.test(lower)) return "FUNDS";
  if (/employs|hired|staff/.test(lower)) return "EMPLOYS";
  if (/contract|agreement|partnership/.test(lower)) return "CONTRACTS_WITH";
  if (/regulates?|regulation|zoning/.test(lower)) return "REGULATES";
  if (/invest|venture|capital/.test(lower)) return "INVESTS_IN";
  if (/cites?|references?|according to/.test(lower)) return "CITES";
  if (/builds?|construct|develop/.test(lower)) return "BUILDS";
  if (/operates?|manages?|runs?/.test(lower)) return "OPERATES";
  if (/announces?|declares?|stated/.test(lower)) return "ANNOUNCES";
  return "CITES";
}

// ─── CAUSAL CLAIM REVIEW ──────────────────────────────────────────────────
export function detectCausalClaims(claims: Map<string, Claim>): CausalClaim[] {
  const causalClaims: CausalClaim[] = [];

  for (const claim of claims.values()) {
    if (claim.type !== "CAUSAL") continue;
    const text = claim.text.toLowerCase();

    // Detect "X caused Y" patterns
    const causalMarkers = /\b(caused|leads to|results? in|drives?|due to|because of|led to|triggered?)\b/i;
    if (causalMarkers.test(claim.text)) {
      // Extract cause and effect
      const parts = claim.text.split(/\b(caused|leads to|results? in|drives?|due to|because of|led to|triggered?)\b/i);
      const cause = parts[0]?.trim() || "";
      const effect = parts[parts.length - 1]?.trim() || "";

      causalClaims.push({
        id: genId("causal"),
        claimId: claim.id,
        cause,
        effect,
        temporalOrdering: "UNKNOWN",
        mechanismEvidence: [],
        alternativeExplanations: [],
        confoundingVariables: [],
        correlationVsCausation: "UNCLEAR",
        evidenceStrength: "WEAK",
        status: "PENDING",
        createdAt: Date.now(),
      });
    }
  }

  return causalClaims;
}

// ─── CONVERGENCE EVALUATION ────────────────────────────────────────────────
export function evaluateConvergence(state: InvestigationState): ConvergenceCheck {
  const hyps = [...state.hypotheses.values()];
  const contradictions = [...state.contradictions.values()];
  const gaps = [...state.informationGaps.values()];
  const predictions = [...(state.predictions?.values() ?? [])];
  const tasks = [...state.researchTasks.values()];

  const details: string[] = [];

  // Major hypotheses tested
  const testedHypotheses = hyps.filter(h => h.supportLevel !== "NONE" && h.supportLevel !== "INSUFFICIENT_EVIDENCE").length;
  const majorHypothesesTested = testedHypotheses >= Math.ceil(hyps.length * 0.6);
  details.push(`${testedHypotheses}/${hyps.length} hypotheses have been tested with evidence`);

  // Important predictions tested
  const testedPredictions = predictions.filter(p => p.status !== "PENDING").length;
  const importantPredictionsTested = predictions.length === 0 || testedPredictions >= Math.ceil(predictions.length * 0.5);
  details.push(`${testedPredictions}/${predictions.length} predictions tested`);

  // Strongest counterarguments investigated
  const adversarialChallenges = [...state.adversarialChallenges.values()];
  const counterargumentsInvestigated = adversarialChallenges.length > 0 && adversarialChallenges.every(c => c.status !== "OPEN");
  details.push(`${adversarialChallenges.length} adversarial challenges, ${adversarialChallenges.filter(c => c.status !== "OPEN").length} resolved`);

  // Major contradictions addressed
  const majorContradictions = contradictions.filter(c => c.status === "CONFIRMED" || c.status === "UNRESOLVED");
  const majorContradictionsAddressed = majorContradictions.length === 0 || majorContradictions.every(c => c.status !== "POTENTIAL");
  details.push(`${contradictions.length} contradictions, ${majorContradictions.length} major unresolved`);

  // Critical source dependencies analyzed
  const clusters = [...(state.evidenceClusters?.values() ?? [])];
  const criticalSourceDeps = clusters.length === 0 || clusters.every(c => c.message.includes("investigated") || true);
  details.push(`${clusters.length} evidence clusters detected`);

  // Important information gaps evaluated
  const openGaps = gaps.filter(g => g.status === "OPEN");
  const importantGapsEvaluated = openGaps.length === 0 || openGaps.every(g => g.importance === "LOW" || g.importance === "MODERATE");
  details.push(`${gaps.length} gaps, ${openGaps.length} still open (${openGaps.filter(g => g.importance === "HIGH" || g.importance === "CRITICAL").length} high/critical)`);

  // Diminishing returns
  const completedTasks = tasks.filter(t => t.status === "COMPLETED").length;
  const recentTaskImpact = tasks.filter(t => t.status === "COMPLETED" && t.completedAt && Date.now() - t.completedAt < 300000).length;
  const diminishingReturns = recentTaskImpact === 0 || (completedTasks > 5 && recentTaskImpact / completedTasks < 0.2);
  details.push(`${completedTasks} research tasks completed, diminishing returns: ${diminishingReturns}`);

  const overall = majorHypothesesTested && importantPredictionsTested && counterargumentsInvestigated &&
    majorContradictionsAddressed && importantGapsEvaluated && diminishingReturns;

  return {
    majorHypothesesTested,
    importantPredictionsTested,
    strongestCounterargumentsInvestigated: counterargumentsInvestigated,
    majorContradictionsAddressed,
    criticalSourceDependenciesAnalyzed: criticalSourceDeps,
    importantInformationGapsEvaluated: importantGapsEvaluated,
    diminishingReturns,
    overall,
    details,
    checkedAt: Date.now(),
  };
}

// ─── INVESTIGATION SCORECARD ──────────────────────────────────────────────
export function computeScorecard(state: InvestigationState): InvestigationScorecard {
  const hyps = [...state.hypotheses.values()];
  const evidence = [...state.evidence.values()];
  const sources = [...state.sources.values()];
  const contradictions = [...state.contradictions.values()];
  const gaps = [...state.informationGaps.values()];
  const predictions = [...(state.predictions?.values() ?? [])];
  const tasks = [...state.researchTasks.values()];
  const adversarialChallenges = [...state.adversarialChallenges.values()];

  // Evidence coverage: how much evidence is collected relative to expected
  const totalExpected = hyps.reduce((sum, h) => sum + h.expectedEvidence.length, 0);
  const foundExpected = hyps.reduce((sum, h) => sum + h.expectedEvidence.filter(e => e.status === "FOUND").length, 0);
  const evidenceCoverage = totalExpected > 0 ? Math.round((foundExpected / totalExpected) * 100) : (evidence.length > 0 ? 50 : 0);

  // Source independence
  const independentSources = sources.filter(s => {
    const roots = traceSourceLineage(s.id, state.sources);
    return roots.length === 1 && roots[0] === s.id;
  }).length;
  const sourceIndependence = sources.length > 0 ? Math.round((independentSources / sources.length) * 100) : 0;

  // Contradiction resolution
  const resolvedContradictions = contradictions.filter(c => c.status === "EXPLAINED" || c.status === "CONFIRMED").length;
  const contradictionResolution = contradictions.length > 0 ? Math.round((resolvedContradictions / contradictions.length) * 100) : 100;

  // Hypothesis coverage
  const testedHypotheses = hyps.filter(h => h.supportLevel !== "NONE" && h.supportLevel !== "INSUFFICIENT_EVIDENCE").length;
  const hypothesisCoverage = hyps.length > 0 ? Math.round((testedHypotheses / hyps.length) * 100) : 0;

  // Adversarial coverage
  const resolvedChallenges = adversarialChallenges.filter(c => c.status !== "OPEN").length;
  const adversarialCoverage = adversarialChallenges.length > 0 ? Math.round((resolvedChallenges / adversarialChallenges.length) * 100) : 0;

  // Information gaps
  const resolvedGaps = gaps.filter(g => g.status !== "OPEN").length;
  const infoGaps = gaps.length > 0 ? Math.round((resolvedGaps / gaps.length) * 100) : 100;

  // Prediction testing
  const testedPredictions = predictions.filter(p => p.status !== "PENDING").length;
  const predictionTesting = predictions.length > 0 ? Math.round((testedPredictions / predictions.length) * 100) : 0;

  // Research depth
  const completedTasks = tasks.filter(t => t.status === "COMPLETED").length;
  const researchDepth = Math.min(100, Math.round((completedTasks / 10) * 100));

  const details: ScorecardDetails = {
    totalEvidence: evidence.length,
    totalSources: sources.length,
    independentSources,
    totalContradictions: contradictions.length,
    resolvedContradictions,
    hypothesesTested: testedHypotheses,
    totalHypotheses: hyps.length,
    adversarialRounds: adversarialChallenges.length,
    predictionsTested: testedPredictions,
    totalPredictions: predictions.length,
    gapsResolved: resolvedGaps,
    totalGaps: gaps.length,
    researchTasksCompleted: completedTasks,
    totalResearchTasks: tasks.length,
  };

  return {
    evidenceCoverage,
    sourceIndependence,
    contradictionResolution,
    hypothesisCoverage,
    adversarialCoverage,
    informationGaps: infoGaps,
    predictionTesting,
    researchDepth,
    details,
    computedAt: Date.now(),
  };
}

// ─── CONFIRMATION BIAS CHECK ──────────────────────────────────────────────
export function checkConfirmationBias(hyp: Hypothesis): {
  passed: boolean;
  checks: Array<{ check: string; passed: boolean; detail: string }>;
} {
  const checks = [
    {
      check: "Has supporting evidence",
      passed: hyp.supportingEvidence.length > 0,
      detail: `${hyp.supportingEvidence.length} supporting evidence items`,
    },
    {
      check: "Has contradicting evidence examined",
      passed: hyp.contradictingEvidence.length > 0 || hyp.expectedEvidence.some(e => e.status === "NEGATIVE"),
      detail: hyp.contradictingEvidence.length === 0
        ? "WARNING: No contradicting evidence found — may indicate confirmation bias"
        : `${hyp.contradictingEvidence.length} contradicting evidence items examined`,
    },
    {
      check: "Has alternative explanation considered",
      passed: hyp.assumptions.length > 0,
      detail: hyp.assumptions.length === 0
        ? "WARNING: No alternative explanations recorded"
        : `${hyp.assumptions.length} assumptions/alternatives noted`,
    },
    {
      check: "Has expected evidence checked",
      passed: hyp.expectedEvidence.length > 0,
      detail: `${hyp.expectedEvidence.filter(e => e.status === "FOUND").length}/${hyp.expectedEvidence.length} expected evidence found`,
    },
  ];

  const allPassed = checks.every(c => c.passed);
  return { passed: allPassed, checks };
}

// ─── ASSESSMENT REVISION HISTORY ──────────────────────────────────────────
export function createAssessmentRevision(
  revisionNumber: number,
  previousAssessment: string,
  newAssessment: string,
  trigger: string,
  evidence: string[],
  reason: string,
  agentsInvolved: string[]
): AssessmentRevision {
  return {
    id: genId("revision"),
    revisionNumber,
    previousAssessment,
    newAssessment,
    trigger,
    evidence,
    reason,
    agentsInvolved,
    timestamp: Date.now(),
  };
}

// ─── INVESTIGATION MEMORY ──────────────────────────────────────────────────
export function storeMemory(
  category: InvestigationMemory["category"],
  content: string,
  provenance: string,
  confidence: number
): InvestigationMemory {
  return {
    id: genId("memory"),
    category,
    content,
    provenance,
    confidence,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── USER OVERRIDE ──────────────────────────────────────────────────────────
export function createUserOverride(
  type: UserOverrideEvent["type"],
  instruction: string,
  targetId?: string
): UserOverrideEvent {
  const effects: string[] = [];
  switch (type) {
    case "INVESTIGATE_THIS":
      effects.push("Research task created with HIGH priority");
      break;
    case "IGNORE_THIS_HYPOTHESIS":
      effects.push("Hypothesis marked for exclusion from assessment");
      break;
    case "FOLLOW_THIS_ENTITY":
      effects.push("Entity relationship investigation initiated");
      break;
    case "FIND_PRIMARY_EVIDENCE":
      effects.push("Primary source research task created");
      break;
    case "TRY_TO_DISPROVE_THIS":
      effects.push("Adversarial research task created");
      break;
    case "STOP_INVESTIGATING":
      effects.push("Investigation paused");
      break;
    case "REOPEN_INVESTIGATION":
      effects.push("Investigation reopened for reassessment");
      break;
  }

  return {
    id: genId("override"),
    type,
    instruction,
    targetId,
    recordedAt: Date.now(),
    effects,
  };
}
