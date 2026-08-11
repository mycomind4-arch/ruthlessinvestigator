export type ToolPermission = "DENIED" | "ASK" | "ALLOWED";

export interface ToolGrant {
  agentId: string;
  toolId: string;
  permission: ToolPermission;
  scope: "PUBLIC_WEB" | "SPECIFIC_DOMAIN" | "SPECIFIC_REPOSITORY" | "INVESTIGATION_ONLY";
  scopeValue?: string;
  reason: string;
  grantedAt: number;
  expiresAt?: number;
}

export class ToolPermissionManager {
  private grants: ToolGrant[] = [];

  grant(input: Omit<ToolGrant, "grantedAt">): ToolGrant {
    const grant = { ...input, grantedAt: Date.now() };
    this.grants = this.grants.filter(g => !(g.agentId === grant.agentId && g.toolId === grant.toolId && g.scope === grant.scope && g.scopeValue === grant.scopeValue));
    this.grants.push(grant);
    return grant;
  }

  revoke(agentId: string, toolId: string): void { this.grants = this.grants.filter(g => !(g.agentId === agentId && g.toolId === toolId)); }

  check(agentId: string, toolId: string, scope: ToolGrant["scope"], scopeValue?: string): ToolPermission {
    const now = Date.now();
    const candidates = this.grants.filter(g => g.agentId === agentId && g.toolId === toolId && (!g.expiresAt || g.expiresAt > now));
    const exact = candidates.find(g => g.scope === scope && (!g.scopeValue || g.scopeValue === scopeValue));
    if (exact) return exact.permission;
    const publicGrant = candidates.find(g => g.scope === "PUBLIC_WEB" && scope === "PUBLIC_WEB");
    return publicGrant?.permission ?? "ASK";
  }

  list(agentId?: string): ToolGrant[] { return this.grants.filter(g => !agentId || g.agentId === agentId).slice(); }
}

export const globalToolPermissions = new ToolPermissionManager();
