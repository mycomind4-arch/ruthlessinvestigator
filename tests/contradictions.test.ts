// ─── TESTS: Contradictions ────────────────────────────────────────────────
// Potential contradictions are created before confirmation.

import { describe, it, expect } from "vitest";
import { detectPotentialContradictions, investigateContradiction } from "../server/investigation/contradiction.js";
import type { Claim, Evidence, Contradiction } from "../server/investigation/types.js";

describe("Contradiction Engine", () => {
  it("Detects potential contradictions between claims", () => {
    const claims = new Map<string, Claim>();
    const evidence = new Map<string, Evidence>();

    claims.set("c1", { id: "c1", text: "AI demand is the primary driver", type: "CAUSAL", supportingEvidence: ["ev1"], contradictingEvidence: [], status: "UNVERIFIED", createdBy: "test", createdAt: 0 });
    claims.set("c2", { id: "c2", text: "Speculative investment is the primary driver", type: "CAUSAL", supportingEvidence: ["ev2"], contradictingEvidence: [], status: "UNVERIFIED", createdBy: "test", createdAt: 0 });

    // ev2 contradicts c1
    evidence.set("ev1", { id: "ev1", text: "Evidence for c1", type: "OBSERVATION", sourceId: "s1", extractedBy: "test", extractedAt: 0, independentConfirmation: true, rootSourceIds: ["s1"], supportsClaimId: "c1" });
    evidence.set("ev2", { id: "ev2", text: "Evidence for c2 contradicting c1", type: "OBSERVATION", sourceId: "s2", extractedBy: "test", extractedAt: 0, independentConfirmation: true, rootSourceIds: ["s2"], supportsClaimId: "c2", contradictsClaimId: "c1" });

    const contradictions = detectPotentialContradictions(claims, evidence);
    expect(contradictions.length).toBeGreaterThan(0);
    expect(contradictions[0].status).toBe("POTENTIAL");
  });

  it("Investigates and can explain projection vs measurement contradictions", () => {
    const claims = new Map<string, Claim>();
    const evidence = new Map<string, Evidence>();

    claims.set("c1", { id: "c1", text: "Data center demand is projected to reach 12% by 2028", type: "QUANTITATIVE", supportingEvidence: ["ev1"], contradictingEvidence: [], status: "UNVERIFIED", createdBy: "test", createdAt: 0 });
    claims.set("c2", { id: "c2", text: "Current observed demand is 4.4%", type: "QUANTITATIVE", supportingEvidence: ["ev2"], contradictingEvidence: [], status: "UNVERIFIED", createdBy: "test", createdAt: 0 });

    evidence.set("ev1", { id: "ev1", text: "Projected to reach 12% by 2028", type: "PROJECTION", sourceId: "s1", extractedBy: "test", extractedAt: 0, independentConfirmation: true, rootSourceIds: ["s1"], supportsClaimId: "c1" });
    evidence.set("ev2", { id: "ev2", text: "Measured at 4.4% in 2023", type: "MEASUREMENT", sourceId: "s2", extractedBy: "test", extractedAt: 0, independentConfirmation: true, rootSourceIds: ["s2"], supportsClaimId: "c2" });

    const contradiction: Contradiction = {
      id: "con1", claimA: "c1", claimB: "c2",
      description: "Projection vs measurement",
      status: "POTENTIAL", detectedBy: "test", detectedAt: 0,
    };

    const result = investigateContradiction(contradiction, claims, evidence);
    expect(result.status).toBe("EXPLAINED");
    expect(result.resolution).toContain("project");
  });
});
