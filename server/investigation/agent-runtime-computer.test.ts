import { describe, expect, it } from "vitest";
import { AgentRuntime } from "./agent-runtime.js";
import { CloudflareSandboxComputerProvider } from "./computer-fabric.js";
import type { CloudflareSandboxLike } from "./computer-types.js";

describe("agent computer permissions", () => {
  it("grants the Director computer authority but denies other agents by default", async () => {
    const runtime = new AgentRuntime();
    const sandbox: CloudflareSandboxLike = {
      async exec() { return { success: true, stdout: "4", stderr: "", exitCode: 0 }; },
      async readFile() { return { content: "ok" }; },
      async writeFile() {},
      async listFiles() { return []; },
    };
    runtime.setComputerProvider(new CloudflareSandboxComputerProvider(() => sandbox));

    const director = await runtime.computerExec("inv-1", "DIRECTOR", { command: "echo 2+2" });
    const researcher = await runtime.computerExec("inv-1", "PRIMARY_SOURCE_RESEARCHER", { command: "echo 2+2" });

    expect(director.ok).toBe(true);
    expect(researcher.ok).toBe(false);
    expect(researcher.exitCode).toBe(126);
  });
});
