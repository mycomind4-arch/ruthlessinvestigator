// ─── UNIFIED CAPABILITY MODEL (Directive 06, Step 2) ───────────────────────
// A Capability is a broader concept than a Skill.
// Skills are one type of capability. Datasets, APIs, methodologies, tools,
// and repositories are also capabilities. This module defines the unified model.

import type { Skill, SkillPerformance, SkillProvenance } from "./skill-types.js";
import type { SkillTrustLevel } from "./skill-types-extended.js";

// ─── Capability Types ─────────────────────────────────────────────────────

export type CapabilityType =
  | "SKILL"                // a structured investigative procedure
  | "SKILL_COMPOSITION"    // a composition of multiple skills
  | "DATASET"              // a structured data collection
  | "DATA_SOURCE"          // a source of investigable data
  | "RESEARCH_API"         // an API providing research capabilities
  | "TOOL"                 // a software tool or utility
  | "METHODOLOGY"          // a documented analytical method
  | "REPOSITORY"           // an external code repository
  | "CONNECTOR"            // a connector to an external service
  | "ANALYTICAL_METHOD";   // a mathematical/analytical technique

// ─── Capability Domain Taxonomy (Step 3) ──────────────────────────────────

export type CapabilityDomain =
  | "GENERAL_INVESTIGATION"
  | "PRIMARY_SOURCE_RESEARCH"
  | "OSINT"
  | "CORPORATE_RESEARCH"
  | "FINANCIAL_RESEARCH"
  | "GOVERNMENT_RESEARCH"
  | "LEGAL_RESEARCH"
  | "ACADEMIC_RESEARCH"
  | "INFRASTRUCTURE_RESEARCH"
  | "GEOSPATIAL_RESEARCH"
  | "SATELLITE_ANALYSIS"
  | "ENERGY_RESEARCH"
  | "PROCUREMENT_RESEARCH"
  | "REAL_ESTATE_RESEARCH"
  | "NETWORK_ANALYSIS"
  | "ENTITY_RESOLUTION"
  | "TIMELINE_ANALYSIS"
  | "STATISTICAL_ANALYSIS"
  | "DATA_ANALYSIS"
  | "CAUSAL_ANALYSIS"
  | "SOURCE_FORENSICS"
  | "DOCUMENT_ANALYSIS"
  | "MEDIA_ANALYSIS"
  | "ARCHIVAL_RESEARCH"
  | "WEB_RESEARCH"
  | "TECHNOLOGY_RESEARCH"
  | "REGULATORY_RESEARCH"
  | "POLITICAL_RESEARCH";

export const ALL_CAPABILITY_DOMAINS: CapabilityDomain[] = [
  "GENERAL_INVESTIGATION", "PRIMARY_SOURCE_RESEARCH", "OSINT",
  "CORPORATE_RESEARCH", "FINANCIAL_RESEARCH", "GOVERNMENT_RESEARCH",
  "LEGAL_RESEARCH", "ACADEMIC_RESEARCH", "INFRASTRUCTURE_RESEARCH",
  "GEOSPATIAL_RESEARCH", "SATELLITE_ANALYSIS", "ENERGY_RESEARCH",
  "PROCUREMENT_RESEARCH", "REAL_ESTATE_RESEARCH", "NETWORK_ANALYSIS",
  "ENTITY_RESOLUTION", "TIMELINE_ANALYSIS", "STATISTICAL_ANALYSIS",
  "DATA_ANALYSIS", "CAUSAL_ANALYSIS", "SOURCE_FORENSICS",
  "DOCUMENT_ANALYSIS", "MEDIA_ANALYSIS", "ARCHIVAL_RESEARCH",
  "WEB_RESEARCH", "TECHNOLOGY_RESEARCH", "REGULATORY_RESEARCH",
  "POLITICAL_RESEARCH",
];

// ─── Capability Status / Trust ────────────────────────────────────────────

export type CapabilityStatus =
  | "DISCOVERED"       // found but not yet evaluated
  | "EVALUATING"       // under assessment
  | "SECURITY_REVIEW"  // undergoing security analysis
  | "BENCHMARKING"    // being benchmarked
  | "EXPERIMENTAL"     // passed initial evaluation, in testing
  | "PROVISIONAL"     // passed benchmarks, not fully trusted
  | "TRUSTED"         // validated through real-world use
  | "REJECTED"        // evaluated and rejected
  | "SUSPENDED"       // temporarily disabled
  | "DEPRECATED";     // retired but preserved

export type CapabilityTrustLevel =
  | "UNTRUSTED"
  | "EXPERIMENTAL"
  | "PROVISIONAL"
  | "TRUSTED"
  | "DEPRECATED"
  | "SUSPENDED";

// ─── Security Profile (Step 8) ─────────────────────────────────────────────

export interface CapabilitySecurityAssessment {
  riskLevel: "NONE" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  permissionsRequired: string[];
  networkAccess: boolean;
  filesystemAccess: boolean;
  credentialAccess: boolean;
  executionRequired: boolean;
  dependencyRisk: "NONE" | "LOW" | "MODERATE" | "HIGH";
  promptInjectionRisk: "NONE" | "LOW" | "MODERATE" | "HIGH";
  licenseRisk: "NONE" | "LOW" | "MODERATE" | "HIGH";
  reviewRequired: boolean;
  notes: string;
  assessedAt: number;
}

// ─── Cost Profile (Step 15) ────────────────────────────────────────────────

export interface CapabilityCostProfile {
  financialCost: number;          // estimated USD per use
  tokenCost: number;             // estimated tokens per use
  latencyMs: number;             // estimated duration
  researchDepth: "SHALLOW" | "STANDARD" | "DEEP" | "FORENSIC";
  expectedEvidenceValue: "LOW" | "MODERATE" | "HIGH";
  failureProbability: number;    // 0-1
  estimatedAt: number;
}

// ─── Capability Provenance ────────────────────────────────────────────────

export interface CapabilityProvenance {
  source: "INTERNAL" | "GITHUB" | "DATASET_REGISTRY" | "API_REGISTRY" | "LEARNED" | "COMPOSED" | "USER";
  sourceUri?: string;            // repository URL, dataset URL, etc.
  sourceDescription?: string;
  discoveredAt?: number;
  discoveredByInvestigation?: string;
  sourceInvestigations?: string[];
  sourceEvidence?: string[];
  extractedFrom?: string;         // how this capability was created
}

// ─── Capability Performance Metrics ───────────────────────────────────────

export interface CapabilityPerformanceMetrics {
  timesUsed: number;
  successfulRuns: number;
  failedRuns: number;
  evidenceProduced: number;
  usefulEvidenceProduced: number;
  contradictionsDiscovered: number;
  informationGapsResolved: number;
  hypothesesAffected: number;
  adversarialFailures: number;
  falsePositiveRate: number;
  averageCost: number;
  averageDuration: number;
  lastUsedAt?: number;
}

export function defaultCapabilityPerformance(): CapabilityPerformanceMetrics {
  return {
    timesUsed: 0,
    successfulRuns: 0,
    failedRuns: 0,
    evidenceProduced: 0,
    usefulEvidenceProduced: 0,
    contradictionsDiscovered: 0,
    informationGapsResolved: 0,
    hypothesesAffected: 0,
    adversarialFailures: 0,
    falsePositiveRate: 0,
    averageCost: 0,
    averageDuration: 0,
  };
}

// ─── The Unified Capability ──────────────────────────────────────────────

export interface Capability {
  id: string;
  name: string;
  description: string;
  type: CapabilityType;
  domain: CapabilityDomain;
  capabilities: string[];          // what this capability can do
  inputs: Array<{ name: string; type: string; required: boolean; description: string }>;
  outputs: Array<{ name: string; type: string; description: string }>;
  requirements: string[];          // what this capability needs to function
  dependencies: string[];          // other capability IDs this depends on
  securityProfile: CapabilitySecurityAssessment;
  license: string;
  provenance: CapabilityProvenance;
  version: number;
  trustLevel: CapabilityTrustLevel;
  status: CapabilityStatus;
  costProfile: CapabilityCostProfile;
  performanceMetrics: CapabilityPerformanceMetrics;
  // For SKILL type, links to the skill registry
  linkedSkillId?: string;
  // For REPOSITORY type, links to repository assessment
  repositoryAssessment?: RepositoryCapabilityAssessment;
  // For DATASET type
  datasetMetadata?: DatasetMetadata;
  // For RESEARCH_API type
  apiMetadata?: ResearchApiMetadata;
  createdAt: number;
  updatedAt: number;
}

// ─── Repository Assessment (Step 7) ────────────────────────────────────────

export interface RepositoryCapabilityAssessment {
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
  dependencyCount: number;
  dependencies: string[];
  // Multi-dimensional evaluation — NOT collapsed to one score
  relevance: "NONE" | "LOW" | "MODERATE" | "HIGH";
  maturity: "NONE" | "LOW" | "MODERATE" | "HIGH";
  documentation: "NONE" | "LOW" | "MODERATE" | "HIGH";
  testing: "NONE" | "LOW" | "MODERATE" | "HIGH";
  security: "NONE" | "LOW" | "MODERATE" | "HIGH";
  dependencyRisk: "NONE" | "LOW" | "MODERATE" | "HIGH";
  permissionRisk: "NONE" | "LOW" | "MODERATE" | "HIGH";
  licenseCompatibility: "NONE" | "LOW" | "MODERATE" | "HIGH";
  reproducibility: "NONE" | "LOW" | "MODERATE" | "HIGH";
  evidenceValue: "NONE" | "LOW" | "MODERATE" | "HIGH";
  maintenanceRisk: "NONE" | "LOW" | "MODERATE" | "HIGH";
  securityIndicators: string[];
  requiredPermissions: string[];
  networkRequirements: string[];
  installationMethod: string;
  sourceStructure: string[];
  assessedAt: number;
}

// ─── Dataset Metadata (Step 9) ─────────────────────────────────────────────

export interface DatasetMetadata {
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
  sourceAuthority: "GOVERNMENT" | "REGULATORY" | "CORPORATE" | "ACADEMIC" | "NGO" | "COMMERCIAL" | "UNKNOWN";
  methodology: string;
  knownLimitations: string[];
  cost: number;
  provenance: string;
}

// ─── Research API Metadata (Step 10) ───────────────────────────────────────

export interface ResearchApiMetadata {
  name: string;
  provider: string;
  description: string;
  baseUrl: string;
  authenticationType: "API_KEY" | "OAUTH" | "NONE" | "UNKNOWN";
  rateLimit: string;
  coverage: string;
  reliability: "LOW" | "MEDIUM" | "HIGH";
  freshness: "REAL_TIME" | "DAILY" | "WEEKLY" | "MONTHLY" | "UNKNOWN";
  terms: string;
  cost: number;
}

// ─── Research Source Registry Entry (Step 10) ─────────────────────────────

export interface ResearchSourceEntry {
  id: string;
  name: string;
  type: "GOVERNMENT_API" | "CORPORATE_API" | "PUBLIC_DATASET" | "ACADEMIC_DATABASE" | "ARCHIVE" | "REGULATORY_DATABASE" | "GEOSPATIAL_SERVICE" | "FINANCIAL_SOURCE" | "NEWS_PROVIDER" | "SEARCH_PROVIDER";
  authority: "OFFICIAL" | "REGULATORY" | "COMMERCIAL" | "ACADEMIC" | "UNKNOWN";
  accessMethod: string;
  cost: number;
  rateLimits: string;
  coverage: string;
  reliability: "LOW" | "MEDIUM" | "HIGH";
  freshness: string;
  authentication: string;
  terms: string;
  domains: CapabilityDomain[];
  registeredAt: number;
}

// ─── Capability Gap (Step 4) ──────────────────────────────────────────────

export type CapabilityGapType =
  | "INVESTIGATION_FAILURE"
  | "INFORMATION_GAP"
  | "RESEARCH_BOTTLENECK"
  | "DOMAIN_GAP"
  | "QUALITY_GAP"
  | "SOURCE_GAP"
  | "ANALYTICAL_GAP";

export interface CapabilityGap {
  id: string;
  investigationId: string;
  description: string;
  domain: CapabilityDomain;
  type: CapabilityGapType;
  importance: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  currentFailure: string;
  missingCapability: string;
  requiredInputs: string[];
  expectedOutputs: string[];
  urgency: "LOW" | "MODERATE" | "HIGH";
  estimatedValue: "LOW" | "MODERATE" | "HIGH";
  evidence: string[];
  existingCapabilitiesChecked: string[];
  externalSearchTriggered: boolean;
  createdAt: number;
}

// ─── Capability Bundle (Step 30) ──────────────────────────────────────────

export interface CapabilityBundle {
  id: string;
  name: string;
  domain: CapabilityDomain;
  description: string;
  capabilityIds: string[];
  recommendedOrder: string[];
  sharedInputs: string[];
  expectedOutputs: string[];
  costProfile: {
    minCost: number;
    maxCost: number;
    estimatedTypical: number;
  };
  performance: CapabilityPerformanceMetrics;
  provenance: {
    sourceInvestigations: string[];
    extractedFrom: string;
  };
  status: CapabilityStatus;
  createdAt: number;
  updatedAt: number;
}

// ─── Capability Value Assessment (Step 16) ─────────────────────────────────

export interface CapabilityValueAssessment {
  capabilityId: string;
  expectedInformationGain: "LOW" | "MODERATE" | "HIGH";
  expectedQualityGain: "LOW" | "MODERATE" | "HIGH";
  expectedCost: number;
  expectedTime: number;
  reusability: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
  domainSpecificity: "LOW" | "MODERATE" | "HIGH";
  estimatedBenefitAcrossInvestigations: number;
  recommendation: "ACCEPT" | "REJECT" | "EXPERIMENT" | "DEFER";
  reasoning: string;
  assessedAt: number;
}

// ─── Cross-Domain Transfer (Step 31) ──────────────────────────────────────

export interface CrossDomainTransfer {
  id: string;
  sourceCapabilityId: string;
  sourceCapabilityName: string;
  sourceDomain: CapabilityDomain;
  targetDomain: CapabilityDomain;
  transferReason: string;
  adaptationNeeded: string[];
  validationStatus: "PENDING" | "VALIDATED" | "REJECTED";
  transferredAt: number;
}

// ─── Capability Matching Result (Step 11) ────────────────────────────────

export interface CapabilityMatchResult {
  need: string;
  existingCapabilities: Array<{
    capabilityId: string;
    name: string;
    matchScore: number;
    matchReason: string;
  }>;
  gaps: CapabilityGap[];
  externalCandidates: Array<{
    capabilityId: string;
    name: string;
    source: string;
    matchScore: number;
  }>;
  compositeSolution?: {
    name: string;
    componentCapabilityIds: string[];
    estimatedCost: number;
    expectedBenefit: string;
  };
  recommendation: string;
}
