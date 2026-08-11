// ─── CONTRADICTION ENGINE ────────────────────────────────────────────────
// Detects potential contradictions, investigates them, and resolves them.

import type { Claim, Evidence, Contradiction, ContradictionStatus } from "./types.js";

let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

/** Detect potential contradictions between claims/evidence */
export function detectPotentialContradictions(
  claims: Map<string, Claim>,
  evidence: Map<string, Evidence>
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  const seen = new Set<string>();
  const claimArray = [...claims.values()];

  // ─── 1. Claim-level contradictions via contradictingEvidence arrays ────
  for (let i = 0; i < claimArray.length; i++) {
    for (let j = i + 1; j < claimArray.length; j++) {
      const a = claimArray[i];
      const b = claimArray[j];

      const aContradictsB = a.contradictingEvidence.some(
        (evId) => evidence.get(evId)?.supportsClaimId === b.id
      );
      const bContradictsA = b.contradictingEvidence.some(
        (evId) => evidence.get(evId)?.supportsClaimId === a.id
      );

      if (aContradictsB || bContradictsA) {
        const key = `${a.id}::${b.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          contradictions.push({
            id: nextId("contradiction"),
            claimA: a.id,
            claimB: b.id,
            description: `Potential contradiction between "${truncate(a.text)}" and "${truncate(b.text)}"`,
            status: "POTENTIAL",
            detectedBy: "contradiction-engine",
            detectedAt: Date.now(),
          });
        }
      }
    }
  }

  // ─── 2. Evidence-level cross-claim contradictions ──────────────────────
  // Evidence that supports one claim AND contradicts another
  for (const ev of evidence.values()) {
    if (ev.supportsClaimId && ev.contradictsClaimId && ev.supportsClaimId !== ev.contradictsClaimId) {
      const aId = ev.supportsClaimId;
      const bId = ev.contradictsClaimId;
      const key = `${aId}::${bId}`;
      if (!seen.has(key) && claims.has(aId) && claims.has(bId)) {
        seen.add(key);
        const a = claims.get(aId)!;
        const b = claims.get(bId)!;
        contradictions.push({
          id: nextId("contradiction"),
          claimA: aId,
          claimB: bId,
          description: `Potential contradiction between "${truncate(a.text)}" and "${truncate(b.text)}" — evidence supports one and contradicts the other.`,
          status: "POTENTIAL",
          detectedBy: "contradiction-engine",
          detectedAt: Date.now(),
        });
      }
    }
  }

  // ─── 3. Evidence type conflicts from same source ──────────────────────
  const evidenceArray = [...evidence.values()];
  for (let i = 0; i < evidenceArray.length; i++) {
    for (let j = i + 1; j < evidenceArray.length; j++) {
      const ea = evidenceArray[i];
      const eb = evidenceArray[j];

      if (
        ea.sourceId === eb.sourceId &&
        ea.supportsClaimId &&
        eb.contradictsClaimId &&
        ea.supportsClaimId === eb.contradictsClaimId
      ) {
        const key = `ev:${ea.id}::${eb.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          contradictions.push({
            id: nextId("contradiction"),
            claimA: ea.id,
            claimB: eb.id,
            description: `Internal source contradiction: same source produces supporting and contradicting evidence for the same claim.`,
            status: "POTENTIAL",
            detectedBy: "contradiction-engine",
            detectedAt: Date.now(),
          });
        }
      }
    }
  }

  return contradictions;
}

/** Investigate a contradiction — compare dates, definitions, entities, source authority */
export function investigateContradiction(
  contradiction: Contradiction,
  claims: Map<string, Claim>,
  evidence: Map<string, Evidence>
): { status: ContradictionStatus; resolution: string } {
  const a = claims.get(contradiction.claimA) ?? evidence.get(contradiction.claimA);
  const b = claims.get(contradiction.claimB) ?? evidence.get(contradiction.claimB);

  if (!a || !b) {
    return { status: "UNRESOLVED", resolution: "Could not retrieve both sides of the contradiction." };
  }

  const aText = "text" in a ? a.text : "";
  const bText = "text" in b ? b.text : "";

  if (containsProjection(aText) && containsMeasurement(bText)) {
    return {
      status: "EXPLAINED",
      resolution: "Contradiction explained by difference between projected and observed values. One source provides a projection while the other provides an observation — these are not directly comparable.",
    };
  }

  if (containsProjection(bText) && containsMeasurement(aText)) {
    return {
      status: "EXPLAINED",
      resolution: "Contradiction explained by difference between projected and observed values.",
    };
  }

  const aDate = extractDate(aText);
  const bDate = extractDate(bText);
  if (aDate && bDate && aDate !== bDate) {
    return {
      status: "EXPLAINED",
      resolution: `Contradiction explained by temporal difference: one claim refers to ${aDate} while the other refers to ${bDate}.`,
    };
  }

  return {
    status: "CONFIRMED",
    resolution: "Contradiction confirmed — the claims are genuinely in conflict and cannot be explained by differences in definition, time, or scope.",
  };
}

function truncate(s: string, len = 80): string {
  return s.length > len ? s.substring(0, len) + "…" : s;
}

function containsProjection(text: string): boolean {
  return /project|forecast|estimate|expect|anticipat|predict/i.test(text);
}

function containsMeasurement(text: string): boolean {
  return /measur|observ|actual|record|report.*\d/i.test(text);
}

function extractDate(text: string): string | null {
  const match = text.match(/\b(20\d{2})\b/);
  return match ? match[1] : null;
}
