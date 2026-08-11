// ─── CAPABILITY REGISTRY (Directive 06) ───────────────────────────────────
// Central store for all registered capabilities: skills, datasets, APIs,
// repositories, methodologies, tools, and bundles.

import type {
  Capability,
  CapabilityType,
  CapabilityDomain,
  CapabilityStatus,
  CapabilityTrustLevel,
  CapabilityGap,
  CapabilityBundle,
  CapabilityValueAssessment,
  ResearchSourceEntry,
  CrossDomainTransfer,
  CapabilityMatchResult,
  CapabilityPerformanceMetrics,
} from "./capability-types.js";
import type { Skill } from "./skill-types.js";
import { SkillRegistry } from "./skill-registry.js";

// ─── Capability Registry ──────────────────────────────────────────────────

export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();
  private gaps: Map<string, CapabilityGap> = new Map();
  private bundles: Map<string, CapabilityBundle> = new Map();
  private sources: Map<string, ResearchSourceEntry> = new Map();
  private transfers: Map<string, CrossDomainTransfer> = new Map();
  private valueAssessments: Map<string, CapabilityValueAssessment> = new Map();
  private cachedLookups: Map<string, string[]> = new Map(); // cache: need-hash → capability IDs

  constructor(private skillRegistry?: SkillRegistry) {
    // Import existing skills as capabilities
    if (skillRegistry) {
      this.importSkillsAsCapabilities();
    }
  }

  // ─── Capability CRUD ────────────────────────────────────────────────────

  registerCapability(cap: Omit<Capability, "id" | "createdAt" | "updatedAt">): Capability {
    const id = `cap-${this.capabilities.size + 1}-${Date.now().toString(36)}`;
    const now = Date.now();
    const full: Capability = { ...cap, id, createdAt: now, updatedAt: now };
    this.capabilities.set(id, full);
    this.invalidateCache();
    return full;
  }

  getCapability(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  updateCapability(id: string, updates: Partial<Capability>): Capability | undefined {
    const existing = this.capabilities.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, id, updatedAt: Date.now() };
    this.capabilities.set(id, updated);
    this.invalidateCache();
    return updated;
  }

  listCapabilities(filter?: {
    type?: CapabilityType;
    domain?: CapabilityDomain;
    status?: CapabilityStatus;
    trustLevel?: CapabilityTrustLevel;
  }): Capability[] {
    let result = [...this.capabilities.values()];
    if (filter?.type) result = result.filter(c => c.type === filter.type);
    if (filter?.domain) result = result.filter(c => c.domain === filter.domain);
    if (filter?.status) result = result.filter(c => c.status === filter.status);
    if (filter?.trustLevel) result = result.filter(c => c.trustLevel === filter.trustLevel);
    return result;
  }

  // ─── Gap Management ──────────────────────────────────────────────────────

  recordGap(gap: Omit<CapabilityGap, "id" | "createdAt">): CapabilityGap {
    const id = `gap-${this.gaps.size + 1}-${Date.now().toString(36)}`;
    const full: CapabilityGap = { ...gap, id, createdAt: Date.now() };
    this.gaps.set(id, full);
    return full;
  }

  getGap(id: string): CapabilityGap | undefined {
    return this.gaps.get(id);
  }

  getGapsForInvestigation(investigationId: string): CapabilityGap[] {
    return [...this.gaps.values()].filter(g => g.investigationId === investigationId);
  }

  getOpenGaps(): CapabilityGap[] {
    return [...this.gaps.values()].filter(g =>
      !g.existingCapabilitiesChecked.length || g.externalSearchTriggered === false
    );
  }

  resolveGap(id: string, resolvedBy: string): void {
    const gap = this.gaps.get(id);
    if (gap) {
      gap.existingCapabilitiesChecked.push(resolvedBy);
    }
  }

  // ─── Bundle Management ──────────────────────────────────────────────────

  createBundle(bundle: Omit<CapabilityBundle, "id" | "createdAt" | "updatedAt">): CapabilityBundle {
    const id = `bundle-${this.bundles.size + 1}-${Date.now().toString(36)}`;
    const now = Date.now();
    const full: CapabilityBundle = { ...bundle, id, createdAt: now, updatedAt: now };
    this.bundles.set(id, full);
    return full;
  }

  getBundle(id: string): CapabilityBundle | undefined {
    return this.bundles.get(id);
  }

  listBundles(): CapabilityBundle[] {
    return [...this.bundles.values()];
  }

  findBundlesForDomain(domain: CapabilityDomain): CapabilityBundle[] {
    return [...this.bundles.values()].filter(b => b.domain === domain && b.status !== "DEPRECATED");
  }

  // ─── Source Registry ──────────────────────────────────────────────────────

  registerSource(source: Omit<ResearchSourceEntry, "id" | "registeredAt">): ResearchSourceEntry {
    const id = `source-${this.sources.size + 1}`;
    const full: ResearchSourceEntry = { ...source, id, registeredAt: Date.now() };
    this.sources.set(id, full);
    return full;
  }

  getSource(id: string): ResearchSourceEntry | undefined {
    return this.sources.get(id);
  }

  listSources(): ResearchSourceEntry[] {
    return [...this.sources.values()];
  }

  findSourcesForDomain(domain: CapabilityDomain): ResearchSourceEntry[] {
    return [...this.sources.values()].filter(s => s.domains.includes(domain));
  }

  // ─── Cross-Domain Transfer ──────────────────────────────────────────────

  recordTransfer(transfer: Omit<CrossDomainTransfer, "id" | "transferredAt">): CrossDomainTransfer {
    const id = `transfer-${this.transfers.size + 1}`;
    const full: CrossDomainTransfer = { ...transfer, id, transferredAt: Date.now() };
    this.transfers.set(id, full);
    return full;
  }

  listTransfers(): CrossDomainTransfer[] {
    return [...this.transfers.values()];
  }

  // ─── Value Assessment ────────────────────────────────────────────────────

  recordValueAssessment(assessment: CapabilityValueAssessment): void {
    this.valueAssessments.set(assessment.capabilityId, assessment);
  }

  getValueAssessment(capabilityId: string): CapabilityValueAssessment | undefined {
    return this.valueAssessments.get(capabilityId);
  }

  // ─── Capability Search ────────────────────────────────────────────────────

  search(query: string, filter?: { type?: CapabilityType; domain?: CapabilityDomain }): Capability[] {
    const q = query.toLowerCase();
    let results = [...this.capabilities.values()];

    if (filter?.type) results = results.filter(c => c.type === filter.type);
    if (filter?.domain) results = results.filter(c => c.domain === filter.domain);

    return results.filter(c => {
      const text = `${c.name} ${c.description} ${c.capabilities.join(" ")}`.toLowerCase();
      return q.split(/\s+/).some(word => word.length > 2 && text.includes(word));
    });
  }

  findByCapability(neededCapability: string, domain?: CapabilityDomain): Capability[] {
    const q = neededCapability.toLowerCase();
    let results = [...this.capabilities.values()];

    if (domain) {
      results = results.filter(c => c.domain === domain);
    }

    return results.filter(c =>
      c.capabilities.some(cap => cap.toLowerCase().includes(q)) ||
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  }

  // ─── Performance Update ──────────────────────────────────────────────────

  updatePerformance(id: string, metrics: Partial<CapabilityPerformanceMetrics>): void {
    const cap = this.capabilities.get(id);
    if (!cap) return;
    cap.performanceMetrics = { ...cap.performanceMetrics, ...metrics };
    cap.updatedAt = Date.now();
  }

  // ─── Cache Management (Step 28) ──────────────────────────────────────────

  private invalidateCache(): void {
    this.cachedLookups.clear();
  }

  getCachedCapability(need: string): string[] | undefined {
    return this.cachedLookups.get(this.hashNeed(need));
  }

  setCachedCapability(need: string, capabilityIds: string[]): void {
    this.cachedLookups.set(this.hashNeed(need), capabilityIds);
  }

  private hashNeed(need: string): string {
    return need.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
  }

  // ─── Import Skills as Capabilities ────────────────────────────────────────

  private importSkillsAsCapabilities(): void {
    if (!this.skillRegistry) return;
    const skills = this.skillRegistry.findActiveSkills();
    for (const skill of skills) {
      const cap: Omit<Capability, "id" | "createdAt" | "updatedAt"> = {
        name: skill.name,
        description: skill.description,
        type: "SKILL",
        domain: this.mapSkillDomain(skill),
        capabilities: this.extractSkillCapabilities(skill),
        inputs: skill.inputs.map(i => ({ name: i.name, type: i.type, required: i.required, description: i.description })),
        outputs: skill.outputs.map(o => ({ name: o.name, type: o.type, description: o.description })),
        requirements: skill.prerequisites.map(p => p.description),
        dependencies: skill.subskills,
        securityProfile: {
          riskLevel: "LOW",
          permissionsRequired: [],
          networkAccess: false,
          filesystemAccess: false,
          credentialAccess: false,
          executionRequired: false,
          dependencyRisk: "LOW",
          promptInjectionRisk: "LOW",
          licenseRisk: "NONE",
          reviewRequired: false,
          notes: "Internal skill — no external execution",
          assessedAt: Date.now(),
        },
        license: "INTERNAL",
        provenance: {
          source: "INTERNAL",
          sourceDescription: skill.provenance.type,
        },
        version: skill.version,
        trustLevel: this.mapSkillTrust(skill.status),
        status: this.mapSkillStatus(skill.status),
        costProfile: {
          financialCost: skill.performance.averageCost,
          tokenCost: 0,
          latencyMs: skill.performance.averageDuration,
          researchDepth: "STANDARD",
          expectedEvidenceValue: skill.performance.evidenceYield > 2 ? "HIGH" : "MODERATE",
          failureProbability: skill.performance.usageCount > 0 ? skill.performance.failureCount / skill.performance.usageCount : 0,
          estimatedAt: Date.now(),
        },
        performanceMetrics: {
          timesUsed: skill.performance.usageCount,
          successfulRuns: skill.performance.successCount,
          failedRuns: skill.performance.failureCount,
          evidenceProduced: skill.performance.evidenceYield * skill.performance.usageCount,
          usefulEvidenceProduced: 0,
          contradictionsDiscovered: 0,
          informationGapsResolved: 0,
          hypothesesAffected: 0,
          adversarialFailures: 0,
          falsePositiveRate: skill.performance.falsePositiveRate,
          averageCost: skill.performance.averageCost,
          averageDuration: skill.performance.averageDuration,
          lastUsedAt: skill.performance.lastUsedAt,
        },
        linkedSkillId: skill.id,
      };
      this.registerCapability(cap);
    }
  }

  private mapSkillDomain(skill: Skill): CapabilityDomain {
    const text = `${skill.name} ${skill.description} ${skill.purpose}`.toLowerCase();
    if (text.includes("source")) return "SOURCE_FORENSICS";
    if (text.includes("timeline")) return "TIMELINE_ANALYSIS";
    if (text.includes("claim") || text.includes("verif")) return "PRIMARY_SOURCE_RESEARCH";
    if (text.includes("evidence")) return "GENERAL_INVESTIGATION";
    return "GENERAL_INVESTIGATION";
  }

  private extractSkillCapabilities(skill: Skill): string[] {
    return skill.procedure.map(p => p.description).filter(d => d.length > 0);
  }

  private mapSkillTrust(status: string): CapabilityTrustLevel {
    switch (status) {
      case "ACTIVE": return "TRUSTED";
      case "VALIDATED": return "PROVISIONAL";
      case "TESTING": return "EXPERIMENTAL";
      case "PROPOSED": return "UNTRUSTED";
      case "DEPRECATED": return "DEPRECATED";
      case "FAILED":
      case "REJECTED": return "DEPRECATED";
      default: return "UNTRUSTED";
    }
  }

  private mapSkillStatus(status: string): CapabilityStatus {
    switch (status) {
      case "ACTIVE": return "TRUSTED";
      case "VALIDATED": return "PROVISIONAL";
      case "TESTING": return "BENCHMARKING";
      case "PROPOSED": return "DISCOVERED";
      case "DEPRECATED": return "DEPRECATED";
      case "FAILED":
      case "REJECTED": return "REJECTED";
      default: return "DISCOVERED";
    }
  }
}
