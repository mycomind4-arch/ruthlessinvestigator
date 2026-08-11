// ─── INVESTIGATION STATE MACHINE ─────────────────────────────────────────
// Controls the lifecycle of an investigation through its phases.

import type { InvestigationPhase } from "./types.js";

const TRANSITIONS: Record<InvestigationPhase, InvestigationPhase[]> = {
  DISCOVERY: ["PREMISE_AUDIT"],
  PREMISE_AUDIT: ["DECOMPOSITION"],
  DECOMPOSITION: ["HYPOTHESIS_GENERATION"],
  HYPOTHESIS_GENERATION: ["INDEPENDENT_RESEARCH"],
  INDEPENDENT_RESEARCH: ["EVIDENCE_ANALYSIS"],
  EVIDENCE_ANALYSIS: ["COUNCIL_COMPARISON"],
  COUNCIL_COMPARISON: ["ADVERSARIAL_REVIEW"],
  ADVERSARIAL_REVIEW: ["GAP_ANALYSIS"],
  GAP_ANALYSIS: ["TARGETED_RESEARCH", "REASSESSMENT"],
  TARGETED_RESEARCH: ["REASSESSMENT"],
  REASSESSMENT: ["CONVERGENCE", "TARGETED_RESEARCH", "GAP_ANALYSIS"],
  CONVERGENCE: [],
};

export function canTransition(from: InvestigationPhase, to: InvestigationPhase): boolean {
  const allowed = TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export function nextPhases(from: InvestigationPhase): InvestigationPhase[] {
  return [...(TRANSITIONS[from] ?? [])];
}

export function isValidPhase(phase: string): phase is InvestigationPhase {
  return phase in TRANSITIONS;
}

export const ALL_PHASES: InvestigationPhase[] = [
  "DISCOVERY",
  "PREMISE_AUDIT",
  "DECOMPOSITION",
  "HYPOTHESIS_GENERATION",
  "INDEPENDENT_RESEARCH",
  "EVIDENCE_ANALYSIS",
  "COUNCIL_COMPARISON",
  "ADVERSARIAL_REVIEW",
  "GAP_ANALYSIS",
  "TARGETED_RESEARCH",
  "REASSESSMENT",
  "CONVERGENCE",
];

export const PHASE_DESCRIPTIONS: Record<InvestigationPhase, string> = {
  DISCOVERY: "Receiving and understanding the investigation question",
  PREMISE_AUDIT: "Checking whether the question's assumptions should be verified first",
  DECOMPOSITION: "Breaking the question into researchable sub-questions",
  HYPOTHESIS_GENERATION: "Generating competing hypotheses",
  INDEPENDENT_RESEARCH: "Agents independently research without seeing each other's conclusions",
  EVIDENCE_ANALYSIS: "Extracting atomic evidence from research findings",
  COUNCIL_COMPARISON: "Cross-agent comparison — why do agents disagree?",
  ADVERSARIAL_REVIEW: "Actively attacking the leading hypothesis",
  GAP_ANALYSIS: "Identifying which unresolved questions could most change the assessment",
  TARGETED_RESEARCH: "Researching the highest-impact information gaps",
  REASSESSMENT: "Updating hypotheses based on new evidence",
  CONVERGENCE: "Further available research is unlikely to materially change the assessment",
};
