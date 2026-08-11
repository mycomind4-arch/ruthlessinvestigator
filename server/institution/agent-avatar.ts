// Agent Identity & Avatar Forge
// Persistent identity is institution-owned; agents may propose their own visual identity,
// but the canonical record is validated and versioned by the institution.

import crypto from "node:crypto";

export type AgentRank = "APPRENTICE" | "RESEARCHER" | "SPECIALIST" | "SENIOR" | "MASTER";
export type AvatarStyle = "GEOMETRIC" | "SYMBOLIC" | "PORTRAIT" | "ABSTRACT";

export interface AvatarDesign {
  style: AvatarStyle;
  symbol: string;
  visualDescription: string;
  motto: string;
  palette: string[];
  version: number;
  createdAt: number;
  designedBy: string;
}

export interface AgentIdentity {
  agentId: string;
  callsign: string;
  displayName: string;
  role: string;
  rank: AgentRank;
  philosophy: string;
  motto: string;
  avatar: AvatarDesign;
  certifiedSkills: string[];
  achievements: string[];
  failures: string[];
  joinedAt: number;
  updatedAt: number;
  provenance: string[];
}

export interface AvatarProposal {
  agentId: string;
  callsign: string;
  philosophy: string;
  avatar: Omit<AvatarDesign, "version" | "createdAt" | "designedBy">;
}

const RANK_ORDER: AgentRank[] = ["APPRENTICE", "RESEARCHER", "SPECIALIST", "SENIOR", "MASTER"];

function normalizePalette(palette: string[]): string[] {
  return [...new Set(palette.map((p) => p.trim()).filter(Boolean))].slice(0, 6);
}

function slug(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "AGENT";
}

export function rankForCertifiedSkills(count: number): AgentRank {
  if (count >= 25) return "MASTER";
  if (count >= 12) return "SENIOR";
  if (count >= 6) return "SPECIALIST";
  if (count >= 2) return "RESEARCHER";
  return "APPRENTICE";
}

export function createAgentIdentity(proposal: AvatarProposal, now = Date.now()): AgentIdentity {
  const callsign = slug(proposal.callsign);
  const avatar: AvatarDesign = {
    ...proposal.avatar,
    symbol: proposal.avatar.symbol.trim() || "◈",
    visualDescription: proposal.avatar.visualDescription.trim(),
    motto: proposal.avatar.motto.trim(),
    palette: normalizePalette(proposal.avatar.palette),
    version: 1,
    createdAt: now,
    designedBy: proposal.agentId,
  };

  return {
    agentId: proposal.agentId,
    callsign,
    displayName: proposal.callsign.trim() || callsign,
    role: "UNASSIGNED",
    rank: "APPRENTICE",
    philosophy: proposal.philosophy.trim(),
    motto: avatar.motto,
    avatar,
    certifiedSkills: [],
    achievements: [],
    failures: [],
    joinedAt: now,
    updatedAt: now,
    provenance: [`identity-created:${proposal.agentId}:${now}`],
  };
}

export function updateRank(identity: AgentIdentity, certifiedSkillCount: number, now = Date.now()): AgentIdentity {
  const rank = rankForCertifiedSkills(certifiedSkillCount);
  return { ...identity, rank, updatedAt: now, provenance: [...identity.provenance, `rank-updated:${rank}:${now}`] };
}

export function redesignAvatar(identity: AgentIdentity, proposal: AvatarProposal, now = Date.now()): AgentIdentity {
  if (proposal.agentId !== identity.agentId) throw new Error("Avatar proposal belongs to a different agent");
  const avatar: AvatarDesign = {
    ...proposal.avatar,
    symbol: proposal.avatar.symbol.trim() || identity.avatar.symbol,
    visualDescription: proposal.avatar.visualDescription.trim(),
    motto: proposal.avatar.motto.trim() || identity.motto,
    palette: normalizePalette(proposal.avatar.palette.length ? proposal.avatar.palette : identity.avatar.palette),
    version: identity.avatar.version + 1,
    createdAt: now,
    designedBy: proposal.agentId,
  };
  return {
    ...identity,
    philosophy: proposal.philosophy.trim() || identity.philosophy,
    motto: avatar.motto,
    avatar,
    updatedAt: now,
    provenance: [...identity.provenance, `avatar-redesigned:v${avatar.version}:${now}`],
  };
}

// A deterministic SVG lets the UI display an identity even before an image model is configured.
// It is intentionally not presented as a generated portrait.
export function renderAvatarSvg(identity: AgentIdentity, size = 160): string {
  const safe = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  const [c1 = "#263238", c2 = "#90A4AE", c3 = "#ECEFF1"] = identity.avatar.palette;
  const symbol = safe(identity.avatar.symbol.slice(0, 4));
  const label = safe(identity.callsign);
  const hash = crypto.createHash("sha256").update(identity.agentId).digest("hex");
  const accent = `#${hash.slice(0, 6)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 160 160" role="img" aria-label="${label} avatar"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="${safe(c1)}"/><stop offset="1" stop-color="${safe(c2)}"/></linearGradient></defs><circle cx="80" cy="80" r="76" fill="url(#g)"/><circle cx="80" cy="80" r="58" fill="${safe(c3)}" opacity=".12" stroke="${accent}" stroke-width="3"/><text x="80" y="88" text-anchor="middle" font-size="42" font-family="system-ui,sans-serif">${symbol}</text><text x="80" y="139" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" fill="white">${label}</text></svg>`;
}

export function canAdvanceRank(from: AgentRank, to: AgentRank): boolean {
  return RANK_ORDER.indexOf(to) >= RANK_ORDER.indexOf(from);
}
