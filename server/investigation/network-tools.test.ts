import { describe, expect, it } from "vitest";
import { executeNetworkTool } from "./network-tools.js";
import { globalAgentWorkspace } from "./agent-workspace.js";

describe("Network research tools", () => {
  it("rejects local network targets", async () => {
    const result = await executeNetworkTool({ tool: "web_fetch", url: "http://127.0.0.1:3000/" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Local|metadata/);
  });

  it("fails safely when search query is empty", async () => {
    const result = await executeNetworkTool({ tool: "web_search", query: "" });
    expect(result.ok).toBe(false);
    expect(result.sources).toHaveLength(0);
  });

  it("does not permit HTTP writes without explicit opt-in", async () => {
    const result = await executeNetworkTool({ tool: "http_request", url: "https://example.com", method: "POST", body: "test" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/allowWrite/);
  });

  it("keeps write access behind a tool permission", async () => {
    const agentId = "TEST_WRITE_AGENT";
    globalAgentWorkspace.grant({ agentId, toolId: "http_request", permission: "ALLOWED", scope: "SPECIFIC_DOMAIN", scopeValue: "example.com", reason: "test" });
    const denied = await globalAgentWorkspace.execute("test-investigation", agentId, { tool: "http_request", url: "https://example.com", method: "POST", body: "test", allowWrite: false });
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/allowWrite/);
  });
});
