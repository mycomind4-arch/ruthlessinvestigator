import { describe, expect, it } from "vitest";
import { executeNetworkTool } from "./network-tools.js";

describe("Network research tools", () => {
  it("rejects local network targets", async () => {
    const result = await executeNetworkTool({ tool: "web_fetch", url: "http://127.0.0.1:3000/" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Local network targets/);
  });

  it("fails safely when search query is empty", async () => {
    const result = await executeNetworkTool({ tool: "web_search", query: "" });
    expect(result.ok).toBe(false);
    expect(result.sources).toHaveLength(0);
  });
});
