// ─── ENHANCED STATE MACHINE ─────────────────────────────────────────────
// Director-controlled adaptive investigation lifecycle.

import type { InvestigationPhase } from "./types.js";

const TRANSITIONS: Record<InvestigationPhase, InvestigationPhase[]> = {
  CREATED: ["PREMISE_AUDIT"],
  PREMISE_AUDIT: ["QUESTION_DECOMPOSITION"],
  QUESTION_DECOMPOSITION: ["HYPOTHESIS_GENERATION"],
  HYPOTHESIS_GENERATION: ["RESEARCH_PLANNING"],
  RESEARCH_PLANNING: ["INDEPENDENT_RESEARCH"],
  INDEPENDENT_RESEARCH: ["EVIDENCE_ANALYSIS"],
  EVIDENCE_ANALYSIS: ["SOURCE_ANALYSIS"],
  SOURCE_ANALYSIS: ["HYPOTHESIS_TESTING"],
  HYPOTHESIS_TESTING: ["ADVERSARIAL_REVIEW"],
  ADVERSARIAL_REVIEW: ["DISAGREEMENT_REVIEW"],
  DISAGREEMENT_REVIEW: ["INFORMATION_GAP_ANALYSIS"],
  INFORMATION_GAP_ANALYSIS: ["TARGETED_RESEARCH", "REASSESSMENT", "CONVERGENCE_REVIEW"],
  TARGETED_RESEARCH: ["REASSESSMENT"],
  REASSESSMENT: ["CONVERGENCE_REVIEW", "TARGETED_RESEARCH", "INFORMATION_GAP_ANALYSIS", "HYPOTHESIS_TESTING"],
  CONVERGENCE_REVIEW: ["CONVERGED", "REASSESSMENT", "TARGETED_RESEARCH"],
  CONVERGED: ["REASSESSMENT"],  // reversible — can reopen
  PAUSED: ["REASSESSMENT", "TARGETED_RESEARCH", "INDEPENDENT_RESEARCH"],
  FAILED: [],
  // Legacy phase aliases
  DISCOVERY: ["PREMISE_AUDIT"],
  DECOMPOSITION: ["HYPOTHESIS_GENERATION"],
  COUNCIL_COMPARISON: ["ADVERSARIAL_REVIEW"],
  GAP_ANALYSIS: ["TARGETED_RESEARCH", "REASSESSMENT", "CONVERGENCE_REVIEW"],
  CONVERGENCE: [],
};

// Legacy phase aliases for backward compat
const PHASE_ALIASES: Record<string, InvestigationPhase> = {
  DISCOVERY: "CREATED",
  DECOMPOSITION: "QUESTION_DECOMPOSITION",
  COUNCIL_COMPARISON: "SOURCE_ANALYSIS",
  GAP_ANALYSIS: "INFORMATION_GAP_ANALYSIS",
  CONVERGENCE: "CONVERGENCE_REVIEW",
};

export function canTransition(from: InvestigationPhase, to: InvestigationPhase): boolean {
  const normalizedFrom = PHASE_ALIASES[from] ?? from;
  const normalizedTo = PHASE_ALIASES[to] ?? to;
  const allowed = TRANSITIONS[normalizedFrom] ?? TRANSITIONS[from] ?? [];
  return allowed.includes(normalizedTo) || allowed.includes(to);
}

export function nextPhases(from: InvestigationPhase): InvestigationPhase[] {
  const normalized = PHASE_ALIASES[from] ?? from;
  return [...(TRANSITIONS[normalized] ?? TRANSITIONS[from] ?? [])];
}

export function isValidPhase(phase: string): phase is InvestigationPhase {
  const allPhases = new Set<string>(Object.keys(TRANSITIONS));
  allPhases.add("DISCOVERY");
  allPhases.add("DECOMPOSITION");
  allPhases.add("COUNCIL_COMPARISON");
  allPhases.add("GAP_ANALYSIS");
  allPhases.add("CONVERGENCE");
  return allPhases.has(phase);
}

export function normalizePhase(phase: string): InvestigationPhase {
  return PHASE_ALIASES[phase] ?? (phase as InvestigationPhase);
}

export const ALL_PHASES: InvestigationPhase[] = [
  "CREATED",
  "PREMISE_AUDIT",
  "QUESTION_DECOMPOSITION",
  "HYPOTHESIS_GENERATION",
  "RESEARCH_PLANNING",
  "INDEPENDENT_RESEARCH",
  "EVIDENCE_ANALYSIS",
  "SOURCE_ANALYSIS",
  "HYPOTHESIS_TESTING",
  "ADVERSARIAL_REVIEW",
  "DISAGREEMENT_REVIEW",
  "INFORMATION_GAP_ANALYSIS",
  "TARGETED_RESEARCH",
  "REASSESSMENT",
  "CONVERGENCE_REVIEW",
  "CONVERGED",
  "PAUSED",
  "FAILED",
];

export const PHASE_DESCRIPTIONS: Record<InvestigationPhase, string> = {
  CREATED: "Receiving and understanding the investigation question",
  PREMISE_AUDIT: "Checking whether the question's assumptions should be verified first",
  QUESTION_DECOMPOSITION: "Breaking the question into researchable sub-questions",
  HYPOTHESIS_GENERATION: "Generating competing hypotheses with predictions",
  RESEARCH_PLANNING: "Planning research priorities — what matters most to investigate first",
  INDEPENDENT_RESEARCH: "Agents independently research without seeing each other's conclusions",
  EVIDENCE_ANALYSIS: "Extracting atomic evidence from research findings",
  SOURCE_ANALYSIS: "Analyzing source independence, contamination, and lineage",
  HYPOTHESIS_TESTING: "Testing hypotheses against evidence — predictions, expected evidence, competition",
  ADVERSARIAL_REVIEW: "Actively attacking the leading hypothesis",
  DISAGREEMENT_REVIEW: "Reviewing model disagreements and preserving genuine uncertainty",
  INFORMATION_GAP_ANALYSIS: "Identifying which unresolved questions could most change the assessment",
  TARGETED_RESEARCH: "Researching the highest-impact information gaps",
  REASSESSMENT: "Updating hypotheses based on new evidence — with revision history",
  CONVERGENCE_REVIEW: "Checking if investigation has reached provisional convergence",
  CONVERGED: "Further research unlikely to materially change the assessment — reopenable",
  PAUSED: "Investigation paused — awaiting user direction or new evidence",
  FAILED: "Investigation failed due to error or budget exhaustion",
  DISCOVERY: "Receiving and understanding the investigation question",
  DECOMPOSITION: "Breaking the question into researchable sub-questions",
  COUNCIL_COMPARISON: "Cross-agent comparison — why do agents disagree?",
  GAP_ANALYSIS: "Identifying which unresolved questions could most change the assessment",
  CONVERGENCE: "Further available research is unlikely to materially change the assessment",
};
