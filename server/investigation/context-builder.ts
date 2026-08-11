// ─── CONTEXT BUILDER ───────────────────────────────────────────────────────
// Directive 05: Build task-specific context for agents.
// Each task receives the smallest sufficient context — not the entire investigation.

import type { InvestigationState, Hypothesis, Claim, Evidence, InvestigationSource, Contradiction } from "./types.js";
import type { MissionContext, ResearchMission } from "./persistence-types.js";

export class ContextBuilder {
  /**
   * Build context for a specific mission/task.
   * Assembles only the relevant slices from the investigation state.
   */
  buildContext(
    state: InvestigationState,
    mission: Partial<ResearchMission>,
  ): MissionContext {
    const global = state.question;

    // ─── Hypothesis context ──────────────────────────────────────────
    let hypothesis: string | null = null;
    if (mission.hypothesisIds?.length) {
      const hyps = mission.hypothesisIds
        .map((id) => state.hypotheses.get(id))
        .filter(Boolean) as Hypothesis[];
      hypothesis = hyps.map((h) =>
        `[${h.id}] ${h.statement} (Support: ${h.supportLevel})\n` +
        `  Supporting evidence: ${h.supportingEvidence.length}\n` +
        `  Contradicting evidence: ${h.contradictingEvidence.length}\n` +
        `  Unknowns: ${h.unknowns.join("; ")}`
      ).join("\n\n");
    }

    // ─── Claim context ────────────────────────────────────────────────
    let claim: string | null = null;
    if (mission.claimIds?.length) {
      const claims = mission.claimIds
        .map((id) => state.claims.get(id))
        .filter(Boolean) as Claim[];
      claim = claims.map((c) =>
        `[${c.id}] ${c.text} (Type: ${c.type}, Status: ${c.status})\n` +
        `  Supporting: ${c.supportingEvidence.length}, Contradicting: ${c.contradictingEvidence.length}`
      ).join("\n\n");
    }

    // ─── Evidence context (only relevant) ────────────────────────────
    const evidenceIds: string[] = [];

    // From hypotheses
    if (mission.hypothesisIds?.length) {
      for (const hid of mission.hypothesisIds) {
        const hyp = state.hypotheses.get(hid);
        if (hyp) {
          evidenceIds.push(...hyp.supportingEvidence, ...hyp.contradictingEvidence);
        }
      }
    }

    // From claims
    if (mission.claimIds?.length) {
      for (const cid of mission.claimIds) {
        const claimObj = state.claims.get(cid);
        if (claimObj) {
          evidenceIds.push(...claimObj.supportingEvidence, ...claimObj.contradictingEvidence);
        }
      }
    }

    // From information gaps
    if (mission.informationGapIds?.length) {
      for (const gid of mission.informationGapIds) {
        const gap = state.informationGaps.get(gid);
        if (gap) {
          // Add evidence related to the gap's question
          const relevant = [...state.evidence.values()].filter((e) =>
            e.text.toLowerCase().includes(gap.question.substring(0, 20).toLowerCase())
          );
          evidenceIds.push(...relevant.map((e) => e.id));
        }
      }
    }

    // Deduplicate
    const uniqueEvidenceIds = [...new Set(evidenceIds)];
    const relevantEvidence = uniqueEvidenceIds
      .map((id) => state.evidence.get(id))
      .filter(Boolean) as Evidence[];

    const evidence = uniqueEvidenceIds;

    // ─── Source context ──────────────────────────────────────────────
    const sourceIds = [...new Set(relevantEvidence.map((e) => e.sourceId))];
    const relevantSources = sourceIds
      .map((id) => state.sources.get(id))
      .filter(Boolean) as InvestigationSource[];

    // ─── History (previous research tasks) ───────────────────────────
    const history = mission.dependencies ?? [];

    // ─── Contradictions ──────────────────────────────────────────────
    const relevantContradictions = [...state.contradictions.values()].filter((c) =>
      c.claimA && mission.claimIds?.includes(c.claimA) ||
      c.claimB && mission.claimIds?.includes(c.claimB)
    );

    // ─── Assemble context ─────────────────────────────────────────────
    const currentMission = mission.question ?? mission.objective ?? "Investigate the research question.";

    return {
      global,
      hypothesis,
      claim,
      evidence,
      sources: sourceIds,
      history,
      currentMission,
    };
  }

  /**
   * Render context as a prompt string for an AI agent.
   * Explicitly layered: GLOBAL → HYPOTHESIS → CLAIM → EVIDENCE → SOURCE → HISTORY → MISSION
   */
  renderContext(ctx: MissionContext, state: InvestigationState): string {
    const parts: string[] = [];

    // GLOBAL
    parts.push(`=== GLOBAL CONTEXT ===\nInvestigation Question: ${ctx.global}`);

    // HYPOTHESIS
    if (ctx.hypothesis) {
      parts.push(`=== HYPOTHESIS ===\n${ctx.hypothesis}`);
    }

    // CLAIM
    if (ctx.claim) {
      parts.push(`=== CLAIM UNDER EXAMINATION ===\n${ctx.claim}`);
    }

    // EVIDENCE
    const evidenceItems = ctx.evidence
      .map((id) => state.evidence.get(id))
      .filter(Boolean) as Evidence[];
    if (evidenceItems.length > 0) {
      const evidenceText = evidenceItems.map((e) => {
        const src = state.sources.get(e.sourceId);
        return `- [${e.id}] ${e.text} (Type: ${e.type}, Source: ${src?.title ?? "unknown"}, Independent: ${e.independentConfirmation})`;
      }).join("\n");
      parts.push(`=== RELEVANT EVIDENCE ===\n${evidenceText}`);
    }

    // SOURCE
    const sourceItems = ctx.sources
      .map((id) => state.sources.get(id))
      .filter(Boolean) as InvestigationSource[];
    if (sourceItems.length > 0) {
      const sourceText = sourceItems.map((s) =>
        `- [${s.id}] ${s.title} (Type: ${s.sourceType}, Primary: ${s.isPrimary}, Independence: ${s.quality.independence})`
      ).join("\n");
      parts.push(`=== SOURCE METADATA ===\n${sourceText}`);
    }

    // HISTORY
    if (ctx.history.length > 0) {
      const historyText = ctx.history
        .map((id) => {
          const task = state.researchTasks.get(id);
          return task ? `- ${task.question} (${task.status})` : `- ${id}`;
        }).join("\n");
      parts.push(`=== PREVIOUS RESEARCH ===\n${historyText}`);
    }

    // CURRENT MISSION
    parts.push(`=== YOUR MISSION ===\n${ctx.currentMission}`);

    return parts.join("\n\n");
  }

  /**
   * Build context for a specific contradiction investigation.
   */
  buildContradictionContext(state: InvestigationState, contradictionId: string): MissionContext {
    const con = state.contradictions.get(contradictionId);
    if (!con) {
      return {
        global: state.question,
        hypothesis: null,
        claim: null,
        evidence: [],
        sources: [],
        history: [],
        currentMission: `Investigate contradiction: ${contradictionId}`,
      };
    }

    const claimIds = [con.claimA, con.claimB].filter((id) => state.claims.has(id));
    const evidenceIds: string[] = [];
    for (const cid of claimIds) {
      const c = state.claims.get(cid);
      if (c) evidenceIds.push(...c.supportingEvidence, ...c.contradictingEvidence);
    }

    return {
      global: state.question,
      hypothesis: null,
      claim: `Contradiction: ${con.description}\nStatus: ${con.status}${con.resolution ? `\nResolution: ${con.resolution}` : ""}`,
      evidence: [...new Set(evidenceIds)],
      sources: [...new Set(evidenceIds.map((id) => state.evidence.get(id)?.sourceId).filter(Boolean) as string[])],
      history: [],
      currentMission: `Resolve this contradiction: ${con.description}`,
    };
  }
}
