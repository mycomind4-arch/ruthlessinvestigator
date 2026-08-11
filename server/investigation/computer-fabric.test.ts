import { describe, expect, it } from "vitest";
import { CloudflareSandboxComputerProvider, LocalComputerProvider } from "./computer-fabric.js";
import type { CloudflareSandboxLike } from "./computer-types.js";

describe("computer fabric", () => {
  it("keeps local execution disabled while allowing deterministic files", async () => {
    const provider = new LocalComputerProvider();
    const workspace = await provider.workspace({ investigationId: "inv-1", agentId: "DIRECTOR" });

    const write = await provider.writeFile(workspace, "/workspace/notes.txt", "hello");
    const read = await provider.readFile(workspace, "/workspace/notes.txt");
    const exec = await provider.exec(workspace, { command: "echo hello" });

    expect(write.ok).toBe(true);
    expect(read.content).toBe("hello");
    expect(exec.ok).toBe(false);
    expect(exec.exitCode).toBe(126);
  });

  it("adapts a Cloudflare Sandbox-like runtime without importing Cloudflare SDK code", async () => {
    const calls: string[] = [];
    const sandbox: CloudflareSandboxLike = {
      async exec(command) {
        calls.push(`exec:${command}`);
        return { success: true, stdout: "ok", stderr: "", exitCode: 0 };
      },
      async readFile(path) {
        calls.push(`read:${path}`);
        return { content: "document" };
      },
      async writeFile(path) {
        calls.push(`write:${path}`);
      },
      async listFiles(path) {
        calls.push(`list:${path}`);
        return ["a.txt", "b.txt"];
      },
    };

    const provider = new CloudflareSandboxComputerProvider(() => sandbox);
    const workspace = await provider.workspace({ investigationId: "inv-2", agentId: "DIRECTOR" });
    const exec = await provider.exec(workspace, { command: "python3 -c 'print(2+2)'" });
    const read = await provider.readFile(workspace, "/workspace/a.txt");
    const list = await provider.list(workspace);

    expect(exec.ok).toBe(true);
    expect(exec.stdout).toBe("ok");
    expect(read.content).toBe("document");
    expect(list.entries).toEqual(["a.txt", "b.txt"]);
    expect(calls).toEqual([
      "exec:python3 -c 'print(2+2)'",
      "read:/workspace/a.txt",
      "list:/workspace",
    ]);
  });
});
