import { describe, expect, it } from "vitest";
import { BulletinBoard } from "./bulletin-board.js";

describe("Agent bulletin board", () => {
  it("keeps posts separate from verified evidence", () => {
    const board = new BulletinBoard();
    const post = board.post({ investigationId: "inv-1", authorAgent: "OSINT", type: "LEAD", subject: "Possible lead", message: "Follow this source", relatedClaims: [], relatedEvidence: [], relatedSources: [], relatedHypotheses: [], relatedTasks: [], importance: "MODERATE" });
    expect(post.verified).toBe(false);
    expect(board.recent("inv-1")).toHaveLength(1);
  });

  it("supports explicit agent handoffs and status updates", () => {
    const board = new BulletinBoard();
    const handoff = board.handoff({ investigationId: "inv-2", fromAgent: "DIRECTOR", toAgent: "SKEPTIC", task: "Try to disprove H1", reason: "H1 is currently leading", evidence: [], sourceReferences: [], constraints: ["Use primary sources where possible"], expectedResult: "Counterevidence or unresolved gap" });
    expect(board.getHandoffs("inv-2")[0]?.status).toBe("QUEUED");
    const updated = board.updateHandoff("inv-2", handoff.id, "ACCEPTED");
    expect(updated?.status).toBe("ACCEPTED");
  });
});
