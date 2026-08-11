// ─── BUILT-IN SKILLS LIBRARY ────────────────────────────────────────────────
// Initial library of structured investigative skills.
// These are real structured procedures, not decorative records.
// Directive 05 / Skill Foundry.

import type { Skill, SkillTest, BenchmarkCase } from "./skill-types.js";
import { defaultPerformance, genSkillId } from "./skill-registry.js";

// ─── Procedural Skills ──────────────────────────────────────────────────────

export function createPrimarySourceVerificationSkill(): Skill {
  return {
    id: genSkillId(),
    name: "Primary Source Verification",
    description: "Verify whether a claim can be traced to a primary source",
    purpose: "Determine if evidence originates from a primary source or is derived from secondary reporting",
    category: "PROCEDURAL",
    inputs: [{ name: "claim", type: "claim", required: true, description: "The claim to verify" }],
    outputs: [{ name: "verification", type: "classification", description: "Classification: PRIMARY, SECONDARY, or UNKNOWN" }],
    prerequisites: [],
    procedure: [
      { id: "ps-1", type: "SEARCH_SOURCES", description: "Search for sources making this claim", agentRole: "PRIMARY_SOURCE_RESEARCHER", inputs: ["claim"], outputs: ["sources"] },
      { id: "ps-2", type: "EXTRACT_EVIDENCE", description: "Extract the evidence trail from each source", agentRole: "EVIDENCE_ANALYST", inputs: ["sources"], outputs: ["evidence_trail"], dependsOn: ["ps-1"] },
      { id: "ps-3", type: "VERIFY_INDEPENDENCE", description: "Check whether sources cite the same underlying source", agentRole: "EVIDENCE_ANALYST", inputs: ["evidence_trail"], outputs: ["independence_assessment"], dependsOn: ["ps-2"] },
      { id: "ps-4", type: "CLASSIFY_STATUS", description: "Classify as PRIMARY, SECONDARY, or UNKNOWN", agentRole: "EVIDENCE_ANALYST", inputs: ["independence_assessment"], outputs: ["verification"], dependsOn: ["ps-3"] },
    ],
    subskills: [],
    compatibleAgents: ["PRIMARY_SOURCE_RESEARCHER", "EVIDENCE_ANALYST"],
    compatibleSources: ["GOVERNMENT_RECORD", "FINANCIAL_RECORD", "DOCUMENTED_EVENT", "STATEMENT", "SECONDARY_REPORT"],
    validationTests: [
      {
        id: "psv-test-1",
        name: "Reuters cites DOE report",
        description: "Reuters article cites DOE report. CNN article cites Reuters. DOE report is the underlying source.",
        input: { claim: "Data center capacity will double by 2027" },
        expectedBehavior: "Should identify one primary source (DOE report) with secondary reports citing it",
        expectedEvidence: ["DOE report"],
        knownPitfalls: ["Treating Reuters as primary when it cites DOE"],
      },
    ],
    knownFailureModes: ["Source may not explicitly cite its origin", "Aggregated reports may obscure primary sources"],
    provenance: { type: "BUILT_IN", createdAt: Date.now() },
    version: 1,
    status: "ACTIVE",
    performance: defaultPerformance(),
    versions: [],
    failures: [],
    maxCompositionDepth: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createSourceIndependenceAnalysisSkill(): Skill {
  return {
    id: genSkillId(),
    name: "Source Independence Analysis",
    description: "Analyze whether multiple sources are genuinely independent or share a common origin",
    purpose: "Detect source contamination and false independence in evidence clusters",
    category: "ANALYTICAL",
    inputs: [{ name: "evidence_cluster", type: "evidence", required: true, description: "A cluster of evidence items to analyze" }],
    outputs: [{ name: "independence_assessment", type: "classification", description: "Number of independent roots and contamination assessment" }],
    prerequisites: [],
    procedure: [
      { id: "si-1", type: "COMPARE_SOURCES", description: "Compare source citations and origins", agentRole: "EVIDENCE_ANALYST", inputs: ["evidence_cluster"], outputs: ["citation_graph"] },
      { id: "si-2", type: "VERIFY_INDEPENDENCE", description: "Identify shared root sources", agentRole: "EVIDENCE_ANALYST", inputs: ["citation_graph"], outputs: ["root_sources"], dependsOn: ["si-1"] },
      { id: "si-3", type: "CLASSIFY_STATUS", description: "Classify independence level", agentRole: "EVIDENCE_ANALYST", inputs: ["root_sources"], outputs: ["independence_assessment"], dependsOn: ["si-2"] },
    ],
    subskills: [],
    compatibleAgents: ["EVIDENCE_ANALYST", "SKEPTIC"],
    compatibleSources: ["GOVERNMENT_RECORD", "FINANCIAL_RECORD", "SECONDARY_REPORT", "ACADEMIC_FINDING"],
    validationTests: [
      {
        id: "sia-test-1",
        name: "Three sources all cite the same press release",
        description: "Three news articles all cite the same company press release — should detect one independent root",
        input: { evidence_cluster: "Three articles about company announcement" },
        expectedBehavior: "Should identify one independent root (the press release)",
        expectedEvidence: ["press release"],
        knownPitfalls: ["Treating syndicated articles as independent"],
      },
    ],
    knownFailureModes: ["Sources may not disclose their origins", "Translation may obscure shared origins"],
    provenance: { type: "BUILT_IN", createdAt: Date.now() },
    version: 1,
    status: "ACTIVE",
    performance: defaultPerformance(),
    versions: [],
    failures: [],
    maxCompositionDepth: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createTimelineReconstructionSkill(): Skill {
  return {
    id: genSkillId(),
    name: "Timeline Reconstruction",
    description: "Reconstruct a chronological timeline of events from evidence",
    purpose: "Build accurate timelines that distinguish projected, observed, and reported events",
    category: "PROCEDURAL",
    inputs: [{ name: "question", type: "question", required: true, description: "The temporal question to investigate" }],
    outputs: [{ name: "timeline", type: "report", description: "Chronological timeline with event status classifications" }],
    prerequisites: [],
    procedure: [
      { id: "tr-1", type: "SEARCH_SOURCES", description: "Search for sources with temporal information", agentRole: "PRIMARY_SOURCE_RESEARCHER", inputs: ["question"], outputs: ["temporal_sources"] },
      { id: "tr-2", type: "EXTRACT_EVIDENCE", description: "Extract dated events from sources", agentRole: "EVIDENCE_ANALYST", inputs: ["temporal_sources"], outputs: ["dated_events"], dependsOn: ["tr-1"] },
      { id: "tr-3", type: "CLASSIFY_STATUS", description: "Classify each event as projected, observed, or reported", agentRole: "EVIDENCE_ANALYST", inputs: ["dated_events"], outputs: ["classified_events"], dependsOn: ["tr-2"] },
      { id: "tr-4", type: "SYNTHESIZE", description: "Build chronological timeline", agentRole: "SYNTHESIS", inputs: ["classified_events"], outputs: ["timeline"], dependsOn: ["tr-3"] },
    ],
    subskills: [],
    compatibleAgents: ["PRIMARY_SOURCE_RESEARCHER", "EVIDENCE_ANALYST", "SYNTHESIS"],
    compatibleSources: ["DOCUMENTED_EVENT", "GOVERNMENT_RECORD", "FINANCIAL_RECORD", "STATEMENT"],
    validationTests: [
      {
        id: "tr-test-1",
        name: "Projected vs observed dates",
        description: "Some dates are projections (announced), some are observed (completed). Skill must distinguish them.",
        input: { question: "When was the data center built?" },
        expectedBehavior: "Timeline should classify each event as PROJECTED, OBSERVED, or REPORTED",
        expectedEvidence: ["construction permit date", "completion date"],
        knownPitfalls: ["Treating announced completion dates as observed"],
      },
    ],
    knownFailureModes: ["Conflicting dates from different sources", "Projected dates treated as observed"],
    provenance: { type: "BUILT_IN", createdAt: Date.now() },
    version: 1,
    status: "ACTIVE",
    performance: defaultPerformance(),
    versions: [],
    failures: [],
    maxCompositionDepth: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createEntityResolutionSkill(): Skill {
  return {
    id: genSkillId(),
    name: "Entity Resolution",
    description: "Resolve whether multiple references point to the same entity",
    purpose: "Determine entity identity across sources with different naming or references",
    category: "PROCEDURAL",
    inputs: [{ name: "entity_name", type: "entity", required: true, description: "The entity name to resolve" }],
    outputs: [{ name: "resolution", type: "classification", description: "Resolved entity identity with confidence" }],
    prerequisites: [],
    procedure: [
      { id: "er-1", type: "SEARCH_SOURCES", description: "Search for references to this entity", agentRole: "OSINT_RESEARCHER", inputs: ["entity_name"], outputs: ["entity_references"] },
      { id: "er-2", type: "EXTRACT_EVIDENCE", description: "Extract identifying attributes (address, registration, officers)", agentRole: "EVIDENCE_ANALYST", inputs: ["entity_references"], outputs: ["attributes"], dependsOn: ["er-1"] },
      { id: "er-3", type: "COMPARE_SOURCES", description: "Compare attributes across references", agentRole: "EVIDENCE_ANALYST", inputs: ["attributes"], outputs: ["comparison"], dependsOn: ["er-2"] },
      { id: "er-4", type: "CLASSIFY_STATUS", description: "Classify as same entity or different", agentRole: "EVIDENCE_ANALYST", inputs: ["comparison"], outputs: ["resolution"], dependsOn: ["er-3"] },
    ],
    subskills: [],
    compatibleAgents: ["OSINT_RESEARCHER", "EVIDENCE_ANALYST"],
    compatibleSources: ["GOVERNMENT_RECORD", "FINANCIAL_RECORD", "STATEMENT"],
    validationTests: [
      {
        id: "er-test-1",
        name: "Subsidiary vs parent company",
        description: "Two references — one to a subsidiary, one to its parent. Should distinguish them.",
        input: { entity_name: "DataCenter Corp subsidiary" },
        expectedBehavior: "Should identify subsidiary and parent as distinct but related entities",
        expectedEvidence: ["registration documents"],
        knownPitfalls: ["Confusing subsidiary with parent"],
      },
    ],
    knownFailureModes: ["Common names may refer to different entities", "Corporate restructuring may change identities"],
    provenance: { type: "BUILT_IN", createdAt: Date.now() },
    version: 1,
    status: "ACTIVE",
    performance: defaultPerformance(),
    versions: [],
    failures: [],
    maxCompositionDepth: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createContradictionInvestigationSkill(): Skill {
  return {
    id: genSkillId(),
    name: "Contradiction Investigation",
    description: "Investigate and resolve contradictions between claims",
    purpose: "Determine whether a contradiction is real, apparent, or the result of source confusion",
    category: "ANALYTICAL",
    inputs: [{ name: "contradiction", type: "claim", required: true, description: "The contradictory claims to investigate" }],
    outputs: [{ name: "resolution", type: "classification", description: "Resolution: REAL, APPARENT, SOURCE_CONFUSION" }],
    prerequisites: [],
    procedure: [
      { id: "ci-1", type: "EXTRACT_EVIDENCE", description: "Extract supporting evidence for each side", agentRole: "EVIDENCE_ANALYST", inputs: ["contradiction"], outputs: ["evidence_a", "evidence_b"] },
      { id: "ci-2", type: "COMPARE_SOURCES", description: "Compare the evidence sources", agentRole: "EVIDENCE_ANALYST", inputs: ["evidence_a", "evidence_b"], outputs: ["source_comparison"], dependsOn: ["ci-1"] },
      { id: "ci-3", type: "VERIFY_INDEPENDENCE", description: "Check if sources are independent", agentRole: "EVIDENCE_ANALYST", inputs: ["source_comparison"], outputs: ["independence"], dependsOn: ["ci-2"] },
      { id: "ci-4", type: "SYNTHESIZE", description: "Determine resolution type", agentRole: "SYNTHESIS", inputs: ["independence"], outputs: ["resolution"], dependsOn: ["ci-3"] },
    ],
    subskills: [],
    compatibleAgents: ["EVIDENCE_ANALYST", "SYNTHESIS", "SKEPTIC"],
    compatibleSources: ["GOVERNMENT_RECORD", "FINANCIAL_RECORD", "STATEMENT", "SECONDARY_REPORT"],
    validationTests: [
      {
        id: "ci-test-1",
        name: "Apparent contradiction from different dates",
        description: "Two sources report different capacity numbers — one from 2023, one from 2025. Should resolve as APPARENT.",
        input: { contradiction: "Source A says 100MW, Source B says 200MW" },
        expectedBehavior: "Should identify temporal difference as cause of apparent contradiction",
        expectedEvidence: ["date of each report"],
        knownPitfalls: ["Treating different time periods as a real contradiction"],
      },
    ],
    knownFailureModes: ["May not have enough information to resolve", "Resolution may be ambiguous"],
    provenance: { type: "BUILT_IN", createdAt: Date.now() },
    version: 1,
    status: "ACTIVE",
    performance: defaultPerformance(),
    versions: [],
    failures: [],
    maxCompositionDepth: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createPredictionTestingSkill(): Skill {
  return {
    id: genSkillId(),
    name: "Prediction Testing",
    description: "Test predictions made by hypotheses against available evidence",
    purpose: "Determine whether a hypothesis's predictions are confirmed or falsified",
    category: "ANALYTICAL",
    inputs: [{ name: "prediction", type: "claim", required: true, description: "The prediction to test" }],
    outputs: [{ name: "result", type: "classification", description: "CONFIRMED, FAILED, or INCONCLUSIVE" }],
    prerequisites: [],
    procedure: [
      { id: "pt-1", type: "SEARCH_SOURCES", description: "Search for evidence that would confirm or deny the prediction", agentRole: "PRIMARY_SOURCE_RESEARCHER", inputs: ["prediction"], outputs: ["prediction_evidence"] },
      { id: "pt-2", type: "EXTRACT_EVIDENCE", description: "Extract relevant evidence", agentRole: "EVIDENCE_ANALYST", inputs: ["prediction_evidence"], outputs: ["evidence"], dependsOn: ["pt-1"] },
      { id: "pt-3", type: "CLASSIFY_STATUS", description: "Classify prediction as confirmed, failed, or inconclusive", agentRole: "EVIDENCE_ANALYST", inputs: ["evidence"], outputs: ["result"], dependsOn: ["pt-2"] },
    ],
    subskills: [],
    compatibleAgents: ["PRIMARY_SOURCE_RESEARCHER", "EVIDENCE_ANALYST"],
    compatibleSources: ["OBSERVATION", "MEASUREMENT", "GOVERNMENT_RECORD", "FINANCIAL_RECORD"],
    validationTests: [],
    knownFailureModes: ["Prediction may be ambiguous", "Evidence may be insufficient"],
    provenance: { type: "BUILT_IN", createdAt: Date.now() },
    version: 1,
    status: "ACTIVE",
    performance: defaultPerformance(),
    versions: [],
    failures: [],
    maxCompositionDepth: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createAlternativeExplanationAnalysisSkill(): Skill {
  return {
    id: genSkillId(),
    name: "Alternative Explanation Analysis",
    description: "Generate and evaluate alternative explanations for observed evidence",
    purpose: "Ensure the investigation considers explanations beyond the leading hypothesis",
    category: "ANALYTICAL",
    inputs: [{ name: "evidence", type: "evidence", required: true, description: "The evidence to explain" }],
    outputs: [{ name: "alternatives", type: "report", description: "Ranked alternative explanations" }],
    prerequisites: [],
    procedure: [
      { id: "ae-1", type: "GENERATE_HYPOTHESIS", description: "Generate alternative explanations", agentRole: "ALTERNATIVE_EXPLANATION", inputs: ["evidence"], outputs: ["hypotheses"] },
      { id: "ae-2", type: "ANALYZE_CLAIM", description: "Analyze each alternative's plausibility", agentRole: "EVIDENCE_ANALYST", inputs: ["hypotheses"], outputs: ["analysis"], dependsOn: ["ae-1"] },
      { id: "ae-3", type: "SYNTHESIZE", description: "Rank alternatives by plausibility", agentRole: "SYNTHESIS", inputs: ["analysis"], outputs: ["alternatives"], dependsOn: ["ae-2"] },
    ],
    subskills: [],
    compatibleAgents: ["ALTERNATIVE_EXPLANATION", "EVIDENCE_ANALYST", "SYNTHESIS"],
    compatibleSources: [],
    validationTests: [],
    knownFailureModes: ["May generate trivial alternatives", "May miss the correct alternative"],
    provenance: { type: "BUILT_IN", createdAt: Date.now() },
    version: 1,
    status: "ACTIVE",
    performance: defaultPerformance(),
    versions: [],
    failures: [],
    maxCompositionDepth: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createCausalReviewSkill(): Skill {
  return {
    id: genSkillId(),
    name: "Causal Review",
    description: "Review causal claims for correctness and alternative explanations",
    purpose: "Evaluate whether claimed causal relationships are supported, confounded, or speculative",
    category: "ANALYTICAL",
    inputs: [{ name: "causal_claim", type: "claim", required: true, description: "The causal claim to review" }],
    outputs: [{ name: "assessment", type: "assessment", description: "Causal assessment: SUPPORTED, CONFOUNDED, SPECULATIVE" }],
    prerequisites: [],
    procedure: [
      { id: "cr-1", type: "EXTRACT_EVIDENCE", description: "Extract evidence supporting the causal claim", agentRole: "EVIDENCE_ANALYST", inputs: ["causal_claim"], outputs: ["supporting_evidence"] },
      { id: "cr-2", type: "GENERATE_HYPOTHESIS", description: "Generate alternative causal explanations", agentRole: "ALTERNATIVE_EXPLANATION", inputs: ["causal_claim", "supporting_evidence"], outputs: ["alternatives"], dependsOn: ["cr-1"] },
      { id: "cr-3", type: "ANALYZE_CLAIM", description: "Analyze for confounders", agentRole: "SKEPTIC", inputs: ["alternatives"], outputs: ["confounder_analysis"], dependsOn: ["cr-2"] },
      { id: "cr-4", type: "SYNTHESIZE", description: "Assess causal claim", agentRole: "SYNTHESIS", inputs: ["confounder_analysis"], outputs: ["assessment"], dependsOn: ["cr-3"] },
    ],
    subskills: [],
    compatibleAgents: ["EVIDENCE_ANALYST", "ALTERNATIVE_EXPLANATION", "SKEPTIC", "SYNTHESIS"],
    compatibleSources: ["ACADEMIC_FINDING", "GOVERNMENT_RECORD", "DATASET"],
    validationTests: [],
    knownFailureModes: ["Correlation mistaken for causation", "Confounding variables missed"],
    provenance: { type: "BUILT_IN", createdAt: Date.now() },
    version: 1,
    status: "ACTIVE",
    performance: defaultPerformance(),
    versions: [],
    failures: [],
    maxCompositionDepth: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Strategic Skills ───────────────────────────────────────────────────────

export function createFollowTheMoneySkill(): Skill {
  return {
    id: genSkillId(),
    name: "Follow the Money",
    description: "Trace financial relationships and funding flows",
    purpose: "Understand who funds a project, how much, and what conditions are attached",
    category: "STRATEGIC",
    inputs: [{ name: "project", type: "entity", required: true, description: "The project or entity to investigate financially" }],
    outputs: [{ name: "financial_picture", type: "report", description: "Financial relationships, funding sources, and amounts" }],
    prerequisites: [],
    procedure: [
      { id: "ftm-1", type: "SEARCH_SOURCES", description: "Search for financial filings and funding announcements", agentRole: "PRIMARY_SOURCE_RESEARCHER", inputs: ["project"], outputs: ["financial_sources"] },
      { id: "ftm-2", type: "EXTRACT_EVIDENCE", description: "Extract financial figures and relationships", agentRole: "EVIDENCE_ANALYST", inputs: ["financial_sources"], outputs: ["financial_evidence"], dependsOn: ["ftm-1"] },
      { id: "ftm-3", type: "INVESTIGATE_RELATIONSHIP", description: "Investigate relationships between funders and project", agentRole: "OSINT_RESEARCHER", inputs: ["financial_evidence"], outputs: ["relationships"], dependsOn: ["ftm-2"] },
      { id: "ftm-4", type: "SYNTHESIZE", description: "Build complete financial picture", agentRole: "SYNTHESIS", inputs: ["relationships"], outputs: ["financial_picture"], dependsOn: ["ftm-3"] },
    ],
    subskills: [],
    compatibleAgents: ["PRIMARY_SOURCE_RESEARCHER", "EVIDENCE_ANALYST", "OSINT_RESEARCHER", "SYNTHESIS"],
    compatibleSources: ["FINANCIAL_RECORD", "GOVERNMENT_RECORD", "STATEMENT"],
    validationTests: [],
    knownFailureModes: ["Private companies may not disclose funding", "Funding may be routed through subsidiaries"],
    provenance: { type: "BUILT_IN", createdAt: Date.now() },
    version: 1,
    status: "ACTIVE",
    performance: defaultPerformance(),
    versions: [],
    failures: [],
    maxCompositionDepth: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createProjectRealityCheckSkill(timelineSkillId?: string, entitySkillId?: string): Skill {
  return {
    id: genSkillId(),
    name: "Project Reality Check",
    description: "Verify whether an announced project actually exists and is progressing as claimed",
    purpose: "Distinguish between announced, planned, under-construction, and operational projects",
    category: "STRATEGIC",
    inputs: [{ name: "project", type: "entity", required: true, description: "The project to verify" }],
    outputs: [{ name: "reality_check", type: "classification", description: "Project status: ANNOUNCED, PERMITTED, UNDER_CONSTRUCTION, OPERATIONAL, CANCELLED" }],
    prerequisites: [
      { skillId: timelineSkillId ?? "", skillName: "Timeline Reconstruction", required: true, description: "Need timeline to track project milestones" },
      { skillId: entitySkillId ?? "", skillName: "Entity Resolution", required: true, description: "Need entity resolution to confirm project identity" },
    ],
    procedure: [
      { id: "prc-1", type: "INVOKE_SUBSKILL", description: "Resolve project entity", subskillId: entitySkillId, agentRole: "OSINT_RESEARCHER", inputs: ["project"], outputs: ["resolved_entity"] },
      { id: "prc-2", type: "SEARCH_SOURCES", description: "Search for permits and regulatory filings", agentRole: "PRIMARY_SOURCE_RESEARCHER", inputs: ["resolved_entity"], outputs: ["regulatory_sources"], dependsOn: ["prc-1"] },
      { id: "prc-3", type: "SEARCH_SOURCES", description: "Search for construction evidence", agentRole: "OSINT_RESEARCHER", inputs: ["resolved_entity"], outputs: ["construction_sources"], dependsOn: ["prc-1"] },
      { id: "prc-4", type: "SEARCH_SOURCES", description: "Search for operational evidence", agentRole: "PRIMARY_SOURCE_RESEARCHER", inputs: ["resolved_entity"], outputs: ["operational_sources"], dependsOn: ["prc-1"] },
      { id: "prc-5", type: "INVOKE_SUBSKILL", description: "Reconstruct project timeline", subskillId: timelineSkillId, agentRole: "SYNTHESIS", inputs: ["regulatory_sources", "construction_sources", "operational_sources"], outputs: ["timeline"], dependsOn: ["prc-2", "prc-3", "prc-4"] },
      { id: "prc-6", type: "CLASSIFY_STATUS", description: "Classify project status", agentRole: "SYNTHESIS", inputs: ["timeline"], outputs: ["reality_check"], dependsOn: ["prc-5"] },
    ],
    subskills: [timelineSkillId ?? "", entitySkillId ?? ""].filter(s => s.length > 0),
    compatibleAgents: ["PRIMARY_SOURCE_RESEARCHER", "OSINT_RESEARCHER", "EVIDENCE_ANALYST", "SYNTHESIS"],
    compatibleSources: ["GOVERNMENT_RECORD", "DOCUMENTED_EVENT", "STATEMENT", "OBSERVATION", "FINANCIAL_RECORD"],
    validationTests: [
      {
        id: "prc-test-1",
        name: "Announced but not built",
        description: "A project is announced with fanfare but no permits or construction evidence exists",
        input: { project: "Hypothetical Data Center" },
        expectedBehavior: "Should classify as ANNOUNCED, not OPERATIONAL",
        expectedEvidence: ["press release"],
        knownPitfalls: ["Treating press releases as evidence of construction"],
      },
    ],
    knownFailureModes: ["May confuse permit issuance with construction", "May miss cancellation announcements"],
    provenance: { type: "BUILT_IN", createdAt: Date.now() },
    version: 1,
    status: "ACTIVE",
    performance: defaultPerformance(),
    versions: [],
    failures: [],
    maxCompositionDepth: 4,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createClaimRealityCheckSkill(): Skill {
  return {
    id: genSkillId(),
    name: "Claim Reality Check",
    description: "Verify whether a specific claim about reality is true",
    purpose: "Cross-reference a claim against primary sources, evidence, and alternative explanations",
    category: "STRATEGIC",
    inputs: [{ name: "claim", type: "claim", required: true, description: "The claim to check" }],
    outputs: [{ name: "verdict", type: "classification", description: "VERIFIED, REFUTED, PARTIALLY_VERIFIED, or UNVERIFIABLE" }],
    prerequisites: [],
    procedure: [
      { id: "crc-1", type: "SEARCH_SOURCES", description: "Search for primary sources", agentRole: "PRIMARY_SOURCE_RESEARCHER", inputs: ["claim"], outputs: ["sources"] },
      { id: "crc-2", type: "EXTRACT_EVIDENCE", description: "Extract evidence", agentRole: "EVIDENCE_ANALYST", inputs: ["sources"], outputs: ["evidence"], dependsOn: ["crc-1"] },
      { id: "crc-3", type: "VERIFY_INDEPENDENCE", description: "Verify source independence", agentRole: "EVIDENCE_ANALYST", inputs: ["evidence"], outputs: ["independence"], dependsOn: ["crc-2"] },
      { id: "crc-4", type: "GENERATE_HYPOTHESIS", description: "Generate alternative explanations", agentRole: "ALTERNATIVE_EXPLANATION", inputs: ["claim", "evidence"], outputs: ["alternatives"], dependsOn: ["crc-2"] },
      { id: "crc-5", type: "SYNTHESIZE", description: "Determine verdict", agentRole: "SYNTHESIS", inputs: ["independence", "alternatives"], outputs: ["verdict"], dependsOn: ["crc-3", "crc-4"] },
    ],
    subskills: [],
    compatibleAgents: ["PRIMARY_SOURCE_RESEARCHER", "EVIDENCE_ANALYST", "ALTERNATIVE_EXPLANATION", "SYNTHESIS"],
    compatibleSources: [],
    validationTests: [],
    knownFailureModes: ["Claim may be partially true", "Sources may be insufficient"],
    provenance: { type: "BUILT_IN", createdAt: Date.now() },
    version: 1,
    status: "ACTIVE",
    performance: defaultPerformance(),
    versions: [],
    failures: [],
    maxCompositionDepth: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Register all built-in skills ──────────────────────────────────────────
export function registerBuiltinSkills(registry: import("./skill-registry.js").SkillRegistry): void {
  const timelineSkill = createTimelineReconstructionSkill();
  const entitySkill = createEntityResolutionSkill();
  const sourceIndepSkill = createSourceIndependenceAnalysisSkill();
  const primarySourceSkill = createPrimarySourceVerificationSkill();
  const contradictionSkill = createContradictionInvestigationSkill();
  const predictionSkill = createPredictionTestingSkill();
  const altExplanationSkill = createAlternativeExplanationAnalysisSkill();
  const causalSkill = createCausalReviewSkill();
  const followMoneySkill = createFollowTheMoneySkill();
  const projectRealitySkill = createProjectRealityCheckSkill(timelineSkill.id, entitySkill.id);
  const claimRealitySkill = createClaimRealityCheckSkill();

  registry.registerSkill(timelineSkill);
  registry.registerSkill(entitySkill);
  registry.registerSkill(sourceIndepSkill);
  registry.registerSkill(primarySourceSkill);
  registry.registerSkill(contradictionSkill);
  registry.registerSkill(predictionSkill);
  registry.registerSkill(altExplanationSkill);
  registry.registerSkill(causalSkill);
  registry.registerSkill(followMoneySkill);
  registry.registerSkill(projectRealitySkill);
  registry.registerSkill(claimRealitySkill);
}
