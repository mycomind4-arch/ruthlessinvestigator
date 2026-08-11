import { describe, expect, it } from "vitest";
import {
  canAdvanceRank,
  createAgentIdentity,
  rankForCertifiedSkills,
  redesignAvatar,
  renderAvatarSvg,
  updateRank,
} from "../server/institution/agent-avatar.js";

describe("Agent Identity & Avatar Forge", () => {
  const proposal = {
    agentId: "agent-skeptic-07",
    callsign: "Skeptic-07",
    philosophy: "Treat every apparent confirmation as a question about independence.",
    avatar: {
      style: "SYMBOLIC" as const,
      symbol: "◈",
      visualDescription: "A faceted investigator beneath a branching evidence graph.",
      motto: "Correlation is not confirmation.",
      palette: ["#263238", "#90A4AE", "#ECEFF1"],
    },
  };

  it("creates a persistent identity from an agent proposal", () => {
    const identity = createAgentIdentity(proposal, 1000);
    expect(identity.agentId).toBe("agent-skeptic-07");
    expect(identity.callsign).toBe("SKEPTIC-07");
    expect(identity.rank).toBe("APPRENTICE");
    expect(identity.avatar.version).toBe(1);
    expect(identity.avatar.designedBy).toBe(identity.agentId);
  });

  it("derives rank from certified skills", () => {
    expect(rankForCertifiedSkills(0)).toBe("APPRENTICE");
    expect(rankForCertifiedSkills(2)).toBe("RESEARCHER");
    expect(rankForCertifiedSkills(6)).toBe("SPECIALIST");
    expect(rankForCertifiedSkills(12)).toBe("SENIOR");
    expect(rankForCertifiedSkills(25)).toBe("MASTER");
  });

  it("updates rank without changing identity provenance", () => {
    const identity = createAgentIdentity(proposal, 1000);
    const promoted = updateRank({ ...identity, certifiedSkills: ["a", "b", "c", "d", "e", "f"] }, 6, 2000);
    expect(promoted.rank).toBe("SPECIALIST");
    expect(promoted.agentId).toBe(identity.agentId);
    expect(promoted.provenance.at(-1)).toContain("rank-updated:SPECIALIST");
  });

  it("versions an agent-initiated redesign", () => {
    const identity = createAgentIdentity(proposal, 1000);
    const redesigned = redesignAvatar(identity, {
      ...proposal,
      avatar: { ...proposal.avatar, symbol: "△", visualDescription: "A triangular lens over a broken chain." },
    }, 2000);
    expect(redesigned.avatar.version).toBe(2);
    expect(redesigned.avatar.symbol).toBe("△");
    expect(redesigned.provenance.at(-1)).toContain("avatar-redesigned:v2");
  });

  it("renders a deterministic fallback SVG", () => {
    const identity = createAgentIdentity(proposal, 1000);
    const svgA = renderAvatarSvg(identity);
    const svgB = renderAvatarSvg(identity);
    expect(svgA).toBe(svgB);
    expect(svgA).toContain("<svg");
    expect(svgA).toContain("SKEPTIC-07");
  });

  it("prevents rank regression through the rank transition helper", () => {
    expect(canAdvanceRank("APPRENTICE", "RESEARCHER")).toBe(true);
    expect(canAdvanceRank("SENIOR", "SPECIALIST")).toBe(false);
    expect(canAdvanceRank("MASTER", "MASTER")).toBe(true);
  });
});
