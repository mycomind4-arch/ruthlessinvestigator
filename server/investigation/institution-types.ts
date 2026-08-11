export type InstitutionEntityStatus = "ACTIVE" | "SUSPENDED" | "REVOKED" | "RETIRED";
export type CapabilityStatus = "DISCOVERED" | "PROPOSED" | "TESTING" | "CERTIFIED" | "SUSPENDED" | "REVOKED" | "DEPRECATED";
export type PermissionRisk = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface ConstitutionVersion { id: string; version: string; title: string; principles: string[]; immutableRules: string[]; createdAt: number; supersedes?: string; }
export interface InstitutionalAgent {
  id: string; name: string; role: string; status: InstitutionEntityStatus; capabilities: string[]; permissions: string[]; constitutionVersion: string;
  performance: { tasks: number; successes: number; failures: number; evidenceProduced: number; provenanceViolations: number }; createdAt: number; updatedAt: number;
}
export interface CertificationRecord { id: string; capabilityId: string; agentId: string; testsPassed: number; testsFailed: number; evidence: string[]; evaluator: string; grantedAt: number; expiresAt?: number; revokedAt?: number; }
export interface InstitutionalCapability {
  id: string; name: string; version: number; description: string; status: CapabilityStatus; prerequisites: string[]; composedFrom: string[]; permissions: string[]; risk: PermissionRisk;
  certification?: CertificationRecord; provenance: string[]; performance: { uses: number; successes: number; failures: number; averageCost: number }; createdAt: number; updatedAt: number;
}
export interface PermissionGrant { id: string; agentId: string; capabilityId: string; permission: string; risk: PermissionRisk; reason: string; constitutionVersion: string; grantedAt: number; revokedAt?: number; }
export interface InstitutionalMemoryItem { id: string; category: "FACT" | "METHOD" | "FAILURE" | "UNKNOWN" | "ENTITY" | "DECISION" | "LESSON"; content: string; provenance: string[]; confidence: number; status: "CURRENT" | "AGING" | "SUPERSEDED" | "RETRACTED"; createdAt: number; updatedAt: number; }
export interface InstitutionalAudit { id: string; constitutionVersion: string; agents: { active: number; suspended: number; revoked: number }; capabilities: { certified: number; testing: number; suspended: number; revoked: number }; permissionIssues: string[]; staleMemoryItems: number; recommendations: string[]; createdAt: number; }
export interface InstitutionSnapshot { constitution: ConstitutionVersion; agents: InstitutionalAgent[]; capabilities: InstitutionalCapability[]; grants: PermissionGrant[]; memory: InstitutionalMemoryItem[]; audits: InstitutionalAudit[]; updatedAt: number; }
