import { describe, expect, it } from "vitest";
import { BulletinBoard } from "./bulletin-board.js";
import { ToolPermissionManager } from "./tool-permissions.js";

describe("Agent operating system primitives", () => {
  it("requires explicit permission before a tool is allowed", () => {
    const permissions = new ToolPermissionManager();
    expect(permissions.check("agent-a", "web_search", "PUBLIC_WEB")).toBe("ASK");
    permissions.grant({ agentId: "agent-a", toolId: "web_search", permission: "ALLOWED", scope: "PUBLIC_WEB", reason: "Research task" });
    expect(permissions.check("agent-a", "web_search", "PUBLIC_WEB")).toBe("ALLOWED");
    permissions.revoke("agent-a", "web_search");
    expect(permissions.check("agent-a", "web_search", "PUBLIC_WEB")).toBe("ASK");
  });

  it("keeps bulletin notes separate from verified evidence", () => {
    const board = new BulletinBoard();
    const post = board.post({ investigationId: "inv-1", authorAgent: "osint", type: "LEAD", subject: "Potential relationship", message: "Needs primary-source verification", relatedClaims: [], relatedEvidence: [], relatedSources: [], relatedHypotheses: [], relatedTasks: [], importance: "HIGH" });
    expect(post.verified).toBe(false);
    expect(board.recent("inv-1")).toHaveLength(1);
    expect(board.search("inv-1", "relationship")[0].id).toBe(post.id);
  });

  it("creates explicit agent handoffs", () => {
    const board = new BulletinBoard();
    const handoff = board.handoff({ investigationId: "inv-1", fromAgent: "osint", toAgent: "skeptic", task: "Verify source", reason: "Potential contradiction", evidence: ["ev-1"], sourceReferences: ["src-1"], constraints: ["primary sources preferred"], expectedResult: "verified or unresolved" });
    expect(handoff.status).toBe("QUEUED");
    expect(board.getHandoffs("inv-1")[0].toAgent).toBe("skeptic");
  });
});
