// ─── CAPABILITY DISCOVERY ENGINE (Directive 06, Steps 5-9) ──────────────
// Searches for capabilities: internal first, then external (GitHub, datasets, APIs).
// NEVER executes external repository code during discovery.
// Treats all external content as untrusted DATA.

import type {
  Capability,
  CapabilityGap,
  CapabilityType,
  CapabilityDomain,
  CapabilityMatchResult,
  RepositoryCapabilityAssessment,
  DatasetMetadata,
  ResearchApiMetadata,
  CapabilitySecurityAssessment,
  CapabilityValueAssessment,
} from "./capability-types.js";
import type { CapabilityRegistry } from "./capability-registry.js";

// ─── Discovery Search Stage ──────────────────────────────────────────────

export type DiscoveryStage = "INTERNAL" | "KNOWN_EXTERNAL" | "TARGETED";

export interface DiscoverySearchResult {
  stage: DiscoveryStage;
  query: string;
  internalMatches: Array<{ capabilityId: string; name: string; matchScore: number; matchReason: string }>;
  repositoryCandidates: RepositoryCandidate[];
  datasetCandidates: DatasetCandidate[];
  apiCandidates: ApiCandidate[];
  searchComplete: boolean;
  searchDurationMs: number;
}

export interface RepositoryCandidate {
  repository: string;
  description: string;
  language: string;
  license: string;
  stars: number;
  forks: number;
  lastUpdate: string;
  recentActivity: boolean;
  hasDocumentation: boolean;
  hasTests: boolean;
  testCount: number;
  dependencies: string[];
  sourceStructure: string[];
  securityIndicators: string[];
  requiredPermissions: string[];
  networkRequirements: string[];
  relevance: "NONE" | "LOW" | "MODERATE" | "HIGH";
  assessedAt: number;
}

export interface DatasetCandidate {
  name: string;
  provider: string;
  domain: CapabilityDomain;
  coverage: string;
  geography: string;
  timeRange: string;
  updateFrequency: string;
  license: string;
  format: string;
  accessMethod: string;
  apiAvailable: boolean;
  sourceAuthority: string;
  methodology: string;
  knownLimitations: string[];
  cost: number;
  relevance: "NONE" | "LOW" | "MODERATE" | "HIGH";
  assessedAt: number;
}

export interface ApiCandidate {
  name: string;
  provider: string;
  description: string;
  baseUrl: string;
  authenticationType: string;
  rateLimit: string;
  coverage: string;
  reliability: "LOW" | "MEDIUM" | "HIGH";
  freshness: string;
  terms: string;
  cost: number;
  relevance: "NONE" | "LOW" | "MODERATE" | "HIGH";
  assessedAt: number;
}

// ─── Capability Discovery Engine ──────────────────────────────────────────

export class CapabilityDiscoveryEngine {
  constructor(private registry: CapabilityRegistry) {}

  /**
   * Full capability search pipeline: internal → external → targeted.
   * Returns candidates WITHOUT executing any external code.
   */
  async discoverCapabilities(
    gap: CapabilityGap,
    options?: { skipExternal?: boolean; githubToken?: string },
  ): Promise<DiscoverySearchResult> {
    const startTime = Date.now();

    // Stage 1: Internal search
    const internalMatches = this.searchInternal(gap);

    // If internal matches are sufficient, skip external search
    if (internalMatches.length > 0 && internalMatches.some(m => m.matchScore >= 0.7)) {
      return {
        stage: "INTERNAL",
        query: gap.missingCapability,
        internalMatches,
        repositoryCandidates: [],
        datasetCandidates: [],
        apiCandidates: [],
        searchComplete: true,
        searchDurationMs: Date.now() - startTime,
      };
    }

    // Stage 2: Known external sources
    let repositoryCandidates: RepositoryCandidate[] = [];
    let datasetCandidates: DatasetCandidate[] = [];
    let apiCandidates: ApiCandidate[] = [];

    if (!options?.skipExternal) {
      const external = await this.searchExternal(gap, options?.githubToken);
      repositoryCandidates = external.repositories;
      datasetCandidates = external.datasets;
      apiCandidates = external.apis;
    }

    // Stage 3: Targeted discovery
    let stage: DiscoveryStage = internalMatches.length > 0 ? "KNOWN_EXTERNAL" : "TARGETED";
    if (options?.skipExternal && internalMatches.length > 0) {
      stage = "INTERNAL";
    }

    return {
      stage,
      query: gap.missingCapability,
      internalMatches,
      repositoryCandidates,
      datasetCandidates,
      apiCandidates,
      searchComplete: true,
      searchDurationMs: Date.now() - startTime,
    };
  }

  // ─── Stage 1: Internal Search ──────────────────────────────────────────

  private searchInternal(gap: CapabilityGap): Array<{ capabilityId: string; name: string; matchScore: number; matchReason: string }> {
    // Check cache first (Step 28)
    const cached = this.registry.getCachedCapability(gap.missingCapability);
    if (cached) {
      return cached.map(id => {
        const cap = this.registry.getCapability(id);
        return cap
          ? { capabilityId: id, name: cap.name, matchScore: 1.0, matchReason: "Cached match" }
          : { capabilityId: id, name: "Unknown", matchScore: 0, matchReason: "Cache miss" };
      });
    }

    // Search by capability description
    const results: Array<{ capabilityId: string; name: string; matchScore: number; matchReason: string }> = [];
    const allCaps = this.registry.listCapabilities();

    for (const cap of allCaps) {
      const score = this.scoreMatch(cap, gap);
      if (score > 0.2) {
        results.push({
          capabilityId: cap.id,
          name: cap.name,
          matchScore: score,
          matchReason: this.matchReason(cap, gap),
        });
      }
    }

    results.sort((a, b) => b.matchScore - a.matchScore);

    // Cache the result
    if (results.length > 0) {
      this.registry.setCachedCapability(gap.missingCapability, results.map(r => r.capabilityId));
    }

    return results;
  }

  // ─── Stage 2: External Search ────────────────────────────────────────────

  private async searchExternal(
    gap: CapabilityGap,
    githubToken?: string,
  ): Promise<{ repositories: RepositoryCandidate[]; datasets: DatasetCandidate[]; apis: ApiCandidate[] }> {
    // Search GitHub — SAFE, non-executing
    const repositories = await this.searchGitHub(gap, githubToken);

    // Search known datasets
    const datasets = this.searchDatasets(gap);

    // Search known APIs
    const apis = this.searchApis(gap);

    return { repositories, datasets, apis };
  }

  /**
   * GitHub search — uses GitHub API to find relevant repositories.
   * NEVER executes any repository code. Treats all content as DATA.
   */
  private async searchGitHub(gap: CapabilityGap, token?: string): Promise<RepositoryCandidate[]> {
    const query = this.buildGitHubQuery(gap);
    const candidates: RepositoryCandidate[] = [];

    try {
      // Use GitHub Search API (REST) — read-only, no execution
      const headers: Record<string, string> = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=10`;
      const response = await fetch(url, { headers });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as { items: any[] };

      for (const repo of data.items ?? []) {
        // Assess each repository — NO CODE EXECUTION
        const candidate = this.assessRepository(repo, gap);
        if (candidate.relevance !== "NONE") {
          candidates.push(candidate);
        }
      }
    } catch {
      // Network may not be available — return empty results
    }

    return candidates;
  }

  private buildGitHubQuery(gap: CapabilityGap): string {
    // Build a targeted search query from the gap
    const keywords = gap.missingCapability
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 5);
    return keywords.join(" ");
  }

  /**
   * Assess a GitHub repository — multi-dimensional, never executes.
   */
  private assessRepository(repo: any, gap: CapabilityGap): RepositoryCandidate {
    const relevance = this.assessRelevance(repo, gap);
    const securityIndicators = this.detectSecurityIndicators(repo);

    return {
      repository: repo.full_name ?? repo.name,
      description: repo.description ?? "",
      language: repo.language ?? "Unknown",
      license: repo.license?.spdx_id ?? "Unknown",
      stars: repo.stargazers_count ?? 0,
      forks: repo.forks_count ?? 0,
      lastUpdate: repo.updated_at ?? "",
      recentActivity: this.isRecentlyActive(repo.updated_at),
      hasDocumentation: (repo.description?.length ?? 0) > 50,
      hasTests: false,  // would need to check contents API
      testCount: 0,
      dependencies: [],  // would need to check package files
      sourceStructure: [],
      securityIndicators,
      requiredPermissions: [],
      networkRequirements: [],
      relevance,
      assessedAt: Date.now(),
    };
  }

  private assessRelevance(repo: any, gap: CapabilityGap): "NONE" | "LOW" | "MODERATE" | "HIGH" {
    const desc = (repo.description ?? "").toLowerCase();
    const name = (repo.full_name ?? repo.name ?? "").toLowerCase();
    const text = `${name} ${desc}`;
    const gapWords = gap.missingCapability.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const matches = gapWords.filter(w => text.includes(w));

    if (matches.length >= 3) return "HIGH";
    if (matches.length >= 2) return "MODERATE";
    if (matches.length >= 1) return "LOW";
    return "NONE";
  }

  private detectSecurityIndicators(repo: any): string[] {
    const indicators: string[] = [];
    const desc = (repo.description ?? "").toLowerCase();
    const name = (repo.full_name ?? repo.name ?? "").toLowerCase();
    const text = `${name} ${desc}`;

    if (text.includes("execute") || text.includes("shell") || text.includes("command")) {
      indicators.push("MAY_REQUIRE_EXECUTION");
    }
    if (text.includes("network") || text.includes("socket") || text.includes("http")) {
      indicators.push("NETWORK_ACCESS");
    }
    if (text.includes("token") || text.includes("credential") || text.includes("api key")) {
      indicators.push("CREDENTIAL_ACCESS");
    }
    if (text.includes("file") || text.includes("filesystem") || text.includes("write")) {
      indicators.push("FILESYSTEM_ACCESS");
    }
    if (!repo.license) {
      indicators.push("NO_LICENSE");
    }

    return indicators;
  }

  private isRecentlyActive(updatedAt: string): boolean {
    if (!updatedAt) return false;
    const days = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    return days < 90;
  }

  /**
   * Dataset discovery — searches known dataset registries.
   */
  private searchDatasets(gap: CapabilityGap): DatasetCandidate[] {
    // Known dataset sources relevant to the gap
    const knownSources: DatasetCandidate[] = [];

    // Government datasets
    const govDatasets = this.matchKnownGovDatasets(gap);
    knownSources.push(...govDatasets);

    // Energy datasets
    if (gap.domain === "ENERGY_RESEARCH" || gap.domain === "INFRASTRUCTURE_RESEARCH") {
      knownSources.push({
        name: "EIA Electricity Data",
        provider: "U.S. Energy Information Administration",
        domain: "ENERGY_RESEARCH",
        coverage: "US electricity generation, transmission, consumption",
        geography: "United States",
        timeRange: "2001-present",
        updateFrequency: "Monthly",
        license: "Public Domain",
        format: "API, CSV, JSON",
        accessMethod: "API at api.eia.gov",
        apiAvailable: true,
        sourceAuthority: "GOVERNMENT",
        methodology: "Direct measurement and reporting from utilities",
        knownLimitations: ["Reporting lag of 1-2 months", "Self-reported by utilities"],
        cost: 0,
        relevance: this.scoreDatasetRelevance("EIA electricity data consumption generation", gap),
        assessedAt: Date.now(),
      });
    }

    // Corporate/financial datasets
    if (gap.domain === "CORPORATE_RESEARCH" || gap.domain === "FINANCIAL_RESEARCH") {
      knownSources.push({
        name: "SEC EDGAR Filings",
        provider: "U.S. Securities and Exchange Commission",
        domain: "FINANCIAL_RESEARCH",
        coverage: "Corporate filings, ownership, financial statements",
        geography: "United States",
        timeRange: "1994-present",
        updateFrequency: "Real-time",
        license: "Public Domain",
        format: "API, XBRL, HTML",
        accessMethod: "API at www.sec.gov/edgar",
        apiAvailable: true,
        sourceAuthority: "REGULATORY",
        methodology: "Mandatory corporate disclosures",
        knownLimitations: ["Filing delays", "Complex data formats"],
        cost: 0,
        relevance: this.scoreDatasetRelevance("SEC corporate filing ownership financial", gap),
        assessedAt: Date.now(),
      });
    }

    return knownSources.filter(d => d.relevance !== "NONE");
  }

  private matchKnownGovDatasets(gap: CapabilityGap): DatasetCandidate[] {
    const results: DatasetCandidate[] = [];
    const gapText = gap.missingCapability.toLowerCase();

    if (gapText.includes("permit") || gapText.includes("construction") || gapText.includes("infrastructure")) {
      results.push({
        name: "Census Bureau Building Permits Survey",
        provider: "U.S. Census Bureau",
        domain: "INFRASTRUCTURE_RESEARCH",
        coverage: "Building permits issued by jurisdiction",
        geography: "United States",
        timeRange: "1980-present",
        updateFrequency: "Monthly",
        license: "Public Domain",
        format: "API, CSV",
        accessMethod: "API at api.census.gov",
        apiAvailable: true,
        sourceAuthority: "GOVERNMENT",
        methodology: "Survey of permit-issuing places",
        knownLimitations: ["Does not cover all jurisdictions", "Self-reported"],
        cost: 0,
        relevance: this.scoreDatasetRelevance("building permit construction infrastructure", gap),
        assessedAt: Date.now(),
      });
    }

    if (gapText.includes("energy") || gapText.includes("electricity") || gapText.includes("power")) {
      results.push({
        name: "EIA Form 861",
        provider: "U.S. Energy Information Administration",
        domain: "ENERGY_RESEARCH",
        coverage: "Utility-level electricity sales, revenue, customer count",
        geography: "United States",
        timeRange: "1990-present",
        updateFrequency: "Annual",
        license: "Public Domain",
        format: "CSV, Excel",
        accessMethod: "Direct download",
        apiAvailable: false,
        sourceAuthority: "GOVERNMENT",
        methodology: "Mandatory reporting from electric utilities",
        knownLimitations: ["Annual granularity only", "Some utilities fail to report"],
        cost: 0,
        relevance: this.scoreDatasetRelevance("electricity utility power energy", gap),
        assessedAt: Date.now(),
      });
    }

    return results;
  }

  private scoreDatasetRelevance(datasetDescription: string, gap: CapabilityGap): "NONE" | "LOW" | "MODERATE" | "HIGH" {
    const desc = datasetDescription.toLowerCase();
    const gapWords = gap.missingCapability.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const matches = gapWords.filter(w => desc.includes(w));
    if (matches.length >= 3) return "HIGH";
    if (matches.length >= 2) return "MODERATE";
    if (matches.length >= 1) return "LOW";
    return "NONE";
  }

  /**
   * Research API discovery — searches known API registries.
   */
  private searchApis(gap: CapabilityGap): ApiCandidate[] {
    const results: ApiCandidate[] = [];
    const gapText = gap.missingCapability.toLowerCase();

    if (gapText.includes("search") || gapText.includes("web") || gapText.includes("news")) {
      results.push({
        name: "News/Search API",
        provider: "Various",
        description: "Search news articles and web content",
        baseUrl: "Various",
        authenticationType: "API_KEY",
        rateLimit: "Varies by provider",
        coverage: "Global news and web content",
        reliability: "MEDIUM",
        freshness: "REAL_TIME",
        terms: "Varies by provider",
        cost: 0.001,
        relevance: this.scoreApiRelevance("search news web content articles", gap),
        assessedAt: Date.now(),
      });
    }

    if (gapText.includes("corporate") || gapText.includes("company") || gapText.includes("ownership")) {
      results.push({
        name: "Open Corporates API",
        provider: "Open Corporates",
        description: "Corporate registry data, company filings, ownership",
        baseUrl: "api.opencorporates.com",
        authenticationType: "API_KEY",
        rateLimit: "500 requests/day (free tier)",
        coverage: "140+ jurisdictions",
        reliability: "HIGH",
        freshness: "DAILY",
        terms: "Free tier available, attribution required",
        cost: 0,
        relevance: this.scoreApiRelevance("corporate company ownership registry filing", gap),
        assessedAt: Date.now(),
      });
    }

    return results.filter(a => a.relevance !== "NONE");
  }

  private scoreApiRelevance(apiDescription: string, gap: CapabilityGap): "NONE" | "LOW" | "MODERATE" | "HIGH" {
    const desc = apiDescription.toLowerCase();
    const gapWords = gap.missingCapability.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const matches = gapWords.filter(w => desc.includes(w));
    if (matches.length >= 3) return "HIGH";
    if (matches.length >= 2) return "MODERATE";
    if (matches.length >= 1) return "LOW";
    return "NONE";
  }

  // ─── Matching & Scoring ──────────────────────────────────────────────────

  private scoreMatch(cap: Capability, gap: CapabilityGap): number {
    let score = 0;
    const gapText = gap.missingCapability.toLowerCase();

    // Domain match
    if (cap.domain === gap.domain) score += 0.3;

    // Capability text match
    for (const c of cap.capabilities) {
      const cWords = c.toLowerCase().split(/\s+/);
      const matches = cWords.filter(w => w.length > 2 && gapText.includes(w));
      score += matches.length * 0.1;
    }

    // Input/output match
    for (const input of gap.requiredInputs) {
      const iMatch = cap.inputs.some(i => i.name.toLowerCase().includes(input.toLowerCase()));
      if (iMatch) score += 0.05;
    }
    for (const output of gap.expectedOutputs) {
      const oMatch = cap.outputs.some(o => o.name.toLowerCase().includes(output.toLowerCase()));
      if (oMatch) score += 0.05;
    }

    // Trust bonus
    if (cap.trustLevel === "TRUSTED") score += 0.1;
    else if (cap.trustLevel === "PROVISIONAL") score += 0.05;

    return Math.min(score, 1.0);
  }

  private matchReason(cap: Capability, gap: CapabilityGap): string {
    const reasons: string[] = [];
    if (cap.domain === gap.domain) reasons.push(`Domain match: ${gap.domain}`);
    if (cap.capabilities.some(c =>
      gap.missingCapability.toLowerCase().split(/\s+/).some(w => w.length > 2 && c.toLowerCase().includes(w))
    )) reasons.push("Capability text match");
    if (cap.trustLevel === "TRUSTED") reasons.push("Trusted capability");
    return reasons.join("; ") || "Weak match";
  }

  // ─── Full Capability Match (Step 11) ─────────────────────────────────────

  matchCapabilities(need: string, domain: CapabilityDomain, investigationId: string): CapabilityMatchResult {
    const gap: CapabilityGap = {
      id: `gap-match-${Date.now()}`,
      investigationId,
      description: need,
      domain,
      type: "DOMAIN_GAP",
      importance: "MODERATE",
      currentFailure: "No existing capability identified",
      missingCapability: need,
      requiredInputs: [],
      expectedOutputs: [],
      urgency: "MODERATE",
      estimatedValue: "MODERATE",
      evidence: [],
      existingCapabilitiesChecked: [],
      externalSearchTriggered: false,
      createdAt: Date.now(),
    };

    // Find existing capabilities
    const existing = this.registry.findByCapability(need, domain);

    const existingMatches = existing.map(cap => ({
      capabilityId: cap.id,
      name: cap.name,
      matchScore: this.scoreMatch(cap, gap),
      matchReason: this.matchReason(cap, gap),
    })).sort((a, b) => b.matchScore - a.matchScore);

    // Record gap if no good match
    const gaps: CapabilityGap[] = [];
    if (existingMatches.length === 0 || existingMatches[0].matchScore < 0.3) {
      this.registry.recordGap(gap);
      gaps.push(gap);
    }

    return {
      need,
      existingCapabilities: existingMatches,
      gaps,
      externalCandidates: [],
      recommendation: existingMatches.length > 0 && existingMatches[0].matchScore >= 0.5
        ? `Use "${existingMatches[0].name}" (score: ${existingMatches[0].matchScore.toFixed(2)})`
        : "No sufficient existing capability found — consider external discovery",
    };
  }

  // ─── Security Assessment (Step 8) ────────────────────────────────────────

  assessSecurity(candidate: RepositoryCandidate | DatasetCandidate | ApiCandidate): CapabilitySecurityAssessment {
    const isRepo = "repository" in candidate;

    if (isRepo) {
      const repo = candidate as RepositoryCandidate;
      return {
        riskLevel: repo.securityIndicators.length > 3 ? "HIGH" :
                   repo.securityIndicators.length > 1 ? "MODERATE" :
                   repo.securityIndicators.length > 0 ? "LOW" : "NONE",
        permissionsRequired: repo.requiredPermissions,
        networkAccess: repo.securityIndicators.includes("NETWORK_ACCESS"),
        filesystemAccess: repo.securityIndicators.includes("FILESYSTEM_ACCESS"),
        credentialAccess: repo.securityIndicators.includes("CREDENTIAL_ACCESS"),
        executionRequired: repo.securityIndicators.includes("MAY_REQUIRE_EXECUTION"),
        dependencyRisk: repo.dependencies.length > 10 ? "HIGH" :
                       repo.dependencies.length > 3 ? "MODERATE" : "LOW",
        promptInjectionRisk: "LOW",
        licenseRisk: repo.securityIndicators.includes("NO_LICENSE") ? "MODERATE" : "LOW",
        reviewRequired: true,
        notes: `Repository ${repo.repository} has ${repo.securityIndicators.length} security indicators`,
        assessedAt: Date.now(),
      };
    } else {
      // Dataset or API — lower risk
      return {
        riskLevel: "LOW",
        permissionsRequired: [],
        networkAccess: true,
        filesystemAccess: false,
        credentialAccess: false,
        executionRequired: false,
        dependencyRisk: "NONE",
        promptInjectionRisk: "NONE",
        licenseRisk: "NONE",
        reviewRequired: false,
        notes: "Data source — no code execution required",
        assessedAt: Date.now(),
      };
    }
  }

  // ─── Value Assessment (Step 16) ──────────────────────────────────────────

  assessValue(capability: Capability, gap?: CapabilityGap): CapabilityValueAssessment {
    const reusability = capability.type === "SKILL" ? "HIGH" : "MODERATE";
    const domainSpecificity = capability.domain === "GENERAL_INVESTIGATION" ? "LOW" : "HIGH";

    const expectedInfoGain: "LOW" | "MODERATE" | "HIGH" =
      capability.performanceMetrics.evidenceProduced > 10 ? "HIGH" :
      capability.performanceMetrics.evidenceProduced > 0 ? "MODERATE" : "LOW";

    const expectedBenefitAcrossInvestigations =
      capability.performanceMetrics.timesUsed > 5 ? 10 :
      capability.performanceMetrics.timesUsed > 0 ? 5 : 1;

    let recommendation: "ACCEPT" | "REJECT" | "EXPERIMENT" | "DEFER" = "EXPERIMENT";
    if (capability.trustLevel === "TRUSTED") recommendation = "ACCEPT";
    else if (capability.trustLevel === "UNTRUSTED") recommendation = "EXPERIMENT";
    else if (capability.performanceMetrics.failedRuns > 3) recommendation = "REJECT";

    return {
      capabilityId: capability.id,
      expectedInformationGain: expectedInfoGain,
      expectedQualityGain: capability.performanceMetrics.usefulEvidenceProduced > 0 ? "HIGH" : "MODERATE",
      expectedCost: capability.costProfile.financialCost,
      expectedTime: capability.costProfile.latencyMs,
      reusability,
      domainSpecificity,
      estimatedBenefitAcrossInvestigations: expectedBenefitAcrossInvestigations,
      recommendation,
      reasoning: `Capability "${capability.name}" has been used ${capability.performanceMetrics.timesUsed} times with ${(capability.performanceMetrics.successfulRuns / Math.max(capability.performanceMetrics.timesUsed, 1) * 100).toFixed(0)}% success rate.`,
      assessedAt: Date.now(),
    };
  }
}
