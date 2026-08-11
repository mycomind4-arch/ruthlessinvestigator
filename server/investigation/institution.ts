import { promises as fs } from "fs";
import * as path from "path";
import { RUTHLESS_CONSTITUTION } from "./constitution.js";
import type { ConstitutionVersion, InstitutionalAgent, InstitutionalCapability, PermissionGrant, InstitutionalMemoryItem, InstitutionalAudit, InstitutionSnapshot, CapabilityStatus, PermissionRisk } from "./institution-types.js";

const DATA_DIR = process.env.INSTITUTION_DATA_DIR ?? path.join(process.cwd(), "institution-data");
const FILE = path.join(DATA_DIR, "institution.json");
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class InstitutionalFramework {
  private snapshot: InstitutionSnapshot = { constitution: RUTHLESS_CONSTITUTION, agents: [], capabilities: [], grants: [], memory: [], audits: [], updatedAt: Date.now() };

  async load(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try { this.snapshot = JSON.parse(await fs.readFile(FILE, "utf8")) as InstitutionSnapshot; }
    catch { await this.persist(); }
  }
  async persist(): Promise<void> { await fs.mkdir(DATA_DIR, { recursive: true }); this.snapshot.updatedAt = Date.now(); const tmp = `${FILE}.tmp`; await fs.writeFile(tmp, JSON.stringify(this.snapshot, null, 2)); await fs.rename(tmp, FILE); }
  getSnapshot(): InstitutionSnapshot { return structuredClone(this.snapshot); }
  getConstitution(): ConstitutionVersion { return structuredClone(this.snapshot.constitution); }
  listAgents(): InstitutionalAgent[] { return structuredClone(this.snapshot.agents); }
  listCapabilities(status?: CapabilityStatus): InstitutionalCapability[] { return structuredClone(status ? this.snapshot.capabilities.filter(c => c.status === status) : this.snapshot.capabilities); }
  listGrants(agentId?: string): PermissionGrant[] { return structuredClone(agentId ? this.snapshot.grants.filter(g => g.agentId === agentId && !g.revokedAt) : this.snapshot.grants.filter(g => !g.revokedAt)); }
  listMemory(): InstitutionalMemoryItem[] { return structuredClone(this.snapshot.memory); }

  async registerAgent(input: Omit<InstitutionalAgent, "id" | "createdAt" | "updatedAt">): Promise<InstitutionalAgent> { const now = Date.now(); const agent = { ...input, id: makeId("agent"), createdAt: now, updatedAt: now }; this.snapshot.agents.push(agent); await this.persist(); return structuredClone(agent); }
  async registerCapability(input: Omit<InstitutionalCapability, "id" | "createdAt" | "updatedAt" | "performance"> & { performance?: InstitutionalCapability["performance"] }): Promise<InstitutionalCapability> {
    const now = Date.now(); const capability: InstitutionalCapability = { ...input, id: makeId("cap"), performance: input.performance ?? { uses: 0, successes: 0, failures: 0, averageCost: 0 }, createdAt: now, updatedAt: now }; this.snapshot.capabilities.push(capability); await this.persist(); return structuredClone(capability);
  }
  async composeCapability(name: string, description: string, componentIds: string[], risk: PermissionRisk = "LOW"): Promise<InstitutionalCapability> {
    const components = componentIds.map(cid => this.snapshot.capabilities.find(c => c.id === cid)).filter(Boolean) as InstitutionalCapability[];
    if (components.length !== componentIds.length) throw new Error("One or more component capabilities do not exist");
    return this.registerCapability({ name, version: 1, description, status: "PROPOSED", prerequisites: [], composedFrom: componentIds, permissions: [...new Set(components.flatMap(c => c.permissions))], risk, provenance: components.map(c => c.id) });
  }
  async certifyCapability(capabilityId: string, agentId: string, testsPassed: number, testsFailed: number, evidence: string[], evaluator: string): Promise<void> {
    const capability = this.snapshot.capabilities.find(c => c.id === capabilityId); const agent = this.snapshot.agents.find(a => a.id === agentId);
    if (!capability || !agent) throw new Error("Capability or agent not found"); if (evaluator === agentId) throw new Error("Self-certification is prohibited"); if (testsPassed <= testsFailed || testsPassed < 1) throw new Error("Certification requires more passed than failed tests");
    capability.status = "CERTIFIED"; capability.certification = { id: makeId("cert"), capabilityId, agentId, testsPassed, testsFailed, evidence, evaluator, grantedAt: Date.now() }; capability.updatedAt = Date.now(); if (!agent.capabilities.includes(capabilityId)) agent.capabilities.push(capabilityId); await this.persist();
  }
  async grantPermission(agentId: string, capabilityId: string, permission: string, reason: string): Promise<PermissionGrant> {
    const agent = this.snapshot.agents.find(a => a.id === agentId); const capability = this.snapshot.capabilities.find(c => c.id === capabilityId);
    if (!agent || !capability) throw new Error("Agent or capability not found"); if (capability.status !== "CERTIFIED") throw new Error("Only certified capabilities can grant permissions"); if (!capability.permissions.includes(permission)) throw new Error("Permission is not declared by the capability");
    const grant: PermissionGrant = { id: makeId("grant"), agentId, capabilityId, permission, risk: capability.risk, reason, constitutionVersion: this.snapshot.constitution.version, grantedAt: Date.now() }; this.snapshot.grants.push(grant); if (!agent.permissions.includes(permission)) agent.permissions.push(permission); agent.updatedAt = Date.now(); await this.persist(); return structuredClone(grant);
  }
  async revokePermission(grantId: string): Promise<void> { const grant = this.snapshot.grants.find(g => g.id === grantId && !g.revokedAt); if (!grant) throw new Error("Active permission grant not found"); grant.revokedAt = Date.now(); const agent = this.snapshot.agents.find(a => a.id === grant.agentId); if (agent && !this.snapshot.grants.some(g => g.agentId === agent.id && g.permission === grant.permission && !g.revokedAt)) agent.permissions = agent.permissions.filter(p => p !== grant.permission); await this.persist(); }
  async remember(item: Omit<InstitutionalMemoryItem, "id" | "createdAt" | "updatedAt">): Promise<InstitutionalMemoryItem> { const now = Date.now(); const memory = { ...item, id: makeId("mem"), createdAt: now, updatedAt: now }; this.snapshot.memory.push(memory); await this.persist(); return structuredClone(memory); }
  async audit(): Promise<InstitutionalAudit> {
    const agents = this.snapshot.agents, caps = this.snapshot.capabilities, permissionIssues: string[] = [];
    for (const grant of this.snapshot.grants.filter(g => !g.revokedAt)) { const cap = caps.find(c => c.id === grant.capabilityId); const agent = agents.find(a => a.id === grant.agentId); if (!cap || cap.status !== "CERTIFIED") permissionIssues.push(`Grant ${grant.id} points to a non-certified capability`); if (!agent || agent.status !== "ACTIVE") permissionIssues.push(`Grant ${grant.id} belongs to an inactive agent`); }
    const recommendations: string[] = []; if (permissionIssues.length) recommendations.push("Review and revoke invalid permission grants."); if (caps.some(c => c.status === "PROPOSED")) recommendations.push("Certify or reject proposed capabilities before use."); if (agents.some(a => a.performance.provenanceViolations > 0)) recommendations.push("Retrain agents with provenance violations.");
    const audit: InstitutionalAudit = { id: makeId("audit"), constitutionVersion: this.snapshot.constitution.version, agents: { active: agents.filter(a => a.status === "ACTIVE").length, suspended: agents.filter(a => a.status === "SUSPENDED").length, revoked: agents.filter(a => a.status === "REVOKED").length }, capabilities: { certified: caps.filter(c => c.status === "CERTIFIED").length, testing: caps.filter(c => c.status === "TESTING").length, suspended: caps.filter(c => c.status === "SUSPENDED").length, revoked: caps.filter(c => c.status === "REVOKED").length }, permissionIssues, staleMemoryItems: this.snapshot.memory.filter(m => m.status !== "CURRENT").length, recommendations, createdAt: Date.now() }; this.snapshot.audits.push(audit); await this.persist(); return structuredClone(audit);
  }
}
