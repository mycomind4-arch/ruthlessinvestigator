import type {
  CloudflareSandboxLike,
  ComputerExecRequest,
  ComputerExecResult,
  ComputerFileResult,
  ComputerListResult,
  ComputerPermission,
  ComputerProvider,
  ComputerWorkspace,
} from "./computer-types.js";

const DEFAULT_PERMISSIONS: ComputerPermission[] = ["FILES_READ", "FILES_WRITE", "SHELL_EXECUTE"];

function safeWorkspaceId(investigationId: string, agentId: string): string {
  return `${investigationId.slice(0, 48)}-${agentId.slice(0, 48)}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Local deterministic computer for development/tests. It intentionally does
 * not execute arbitrary shell commands; commands are recorded as unavailable.
 * Real execution belongs behind the Cloudflare adapter.
 */
export class LocalComputerProvider implements ComputerProvider {
  readonly backend = "LOCAL" as const;
  private readonly files = new Map<string, Map<string, string>>();

  async workspace(input: { investigationId: string; agentId: string }): Promise<ComputerWorkspace> {
    const workspaceId = safeWorkspaceId(input.investigationId, input.agentId);
    if (!this.files.has(workspaceId)) this.files.set(workspaceId, new Map());
    return {
      investigationId: input.investigationId,
      agentId: input.agentId,
      workspaceId,
      backend: this.backend,
      root: "/workspace",
      permissions: [...DEFAULT_PERMISSIONS],
    };
  }

  async exec(_workspace: ComputerWorkspace, request: ComputerExecRequest): Promise<ComputerExecResult> {
    return {
      ok: false,
      stdout: "",
      stderr: `Local computer execution is disabled in the investigation server. Command was not executed: ${request.command}`,
      exitCode: 126,
      durationMs: 0,
    };
  }

  async readFile(workspace: ComputerWorkspace, path: string): Promise<ComputerFileResult> {
    const content = this.files.get(workspace.workspaceId)?.get(normalizePath(path));
    return content === undefined
      ? { ok: false, path, error: "File not found" }
      : { ok: true, path, content };
  }

  async writeFile(workspace: ComputerWorkspace, path: string, content: string): Promise<ComputerFileResult> {
    this.files.get(workspace.workspaceId)?.set(normalizePath(path), content);
    return { ok: true, path };
  }

  async list(workspace: ComputerWorkspace, path = "/workspace"): Promise<ComputerListResult> {
    const prefix = normalizePath(path).replace(/\/$/, "") + "/";
    const entries = [...(this.files.get(workspace.workspaceId)?.keys() ?? [])]
      .filter((file) => file.startsWith(prefix))
      .map((file) => file.slice(prefix.length).split("/")[0])
      .filter((value, index, all) => all.indexOf(value) === index);
    return { ok: true, path, entries };
  }
}

/**
 * Production adapter for Cloudflare Sandbox. The Worker supplies the sandbox
 * RPC object (typically getSandbox(env.Sandbox, workspaceId)).
 */
export class CloudflareSandboxComputerProvider implements ComputerProvider {
  readonly backend = "CLOUDFLARE_SANDBOX" as const;

  constructor(private readonly resolveSandbox: (workspaceId: string) => Promise<CloudflareSandboxLike> | CloudflareSandboxLike) {}

  async workspace(input: { investigationId: string; agentId: string }): Promise<ComputerWorkspace> {
    return {
      investigationId: input.investigationId,
      agentId: input.agentId,
      workspaceId: safeWorkspaceId(input.investigationId, input.agentId),
      backend: this.backend,
      root: "/workspace",
      permissions: ["FILES_READ", "FILES_WRITE", "SHELL_EXECUTE", "NETWORK", "PROCESS_START"],
    };
  }

  private async sandbox(workspace: ComputerWorkspace): Promise<CloudflareSandboxLike> {
    return this.resolveSandbox(workspace.workspaceId);
  }

  async exec(workspace: ComputerWorkspace, request: ComputerExecRequest): Promise<ComputerExecResult> {
    if (!workspace.permissions.includes("SHELL_EXECUTE")) {
      return { ok: false, stdout: "", stderr: "SHELL_EXECUTE permission denied", exitCode: 126, durationMs: 0 };
    }
    const started = Date.now();
    try {
      const result = await (await this.sandbox(workspace)).exec(request.command, {
        cwd: request.cwd,
        timeout: request.timeoutMs,
      });
      return {
        ok: result.success,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.exitCode ?? (result.success ? 0 : 1),
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return {
        ok: false,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1,
        durationMs: Date.now() - started,
      };
    }
  }

  async readFile(workspace: ComputerWorkspace, path: string): Promise<ComputerFileResult> {
    if (!workspace.permissions.includes("FILES_READ")) return { ok: false, path, error: "FILES_READ permission denied" };
    try {
      const result = await (await this.sandbox(workspace)).readFile(path);
      return { ok: true, path, content: result.content };
    } catch (error) {
      return { ok: false, path, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async writeFile(workspace: ComputerWorkspace, path: string, content: string): Promise<ComputerFileResult> {
    if (!workspace.permissions.includes("FILES_WRITE")) return { ok: false, path, error: "FILES_WRITE permission denied" };
    try {
      await (await this.sandbox(workspace)).writeFile(path, content);
      return { ok: true, path };
    } catch (error) {
      return { ok: false, path, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async list(workspace: ComputerWorkspace, path = "/workspace"): Promise<ComputerListResult> {
    if (!workspace.permissions.includes("FILES_READ")) return { ok: false, path, entries: [], error: "FILES_READ permission denied" };
    try {
      const result = await (await this.sandbox(workspace)).listFiles(path);
      return { ok: true, path, entries: Array.isArray(result) ? result : result.files ?? [] };
    } catch (error) {
      return { ok: false, path, entries: [], error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function normalizePath(path: string): string {
  const normalized = `/${path.replace(/^\/+/, "")}`.replace(/\/+/g, "/");
  return normalized === "/" ? "/workspace" : normalized;
}

export const localComputerProvider = new LocalComputerProvider();
