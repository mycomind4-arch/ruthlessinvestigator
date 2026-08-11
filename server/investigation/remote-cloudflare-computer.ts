import type {
  ComputerExecRequest,
  ComputerExecResult,
  ComputerFileResult,
  ComputerListResult,
  ComputerProvider,
  ComputerWorkspace,
} from "./computer-types.js";

/** Server-side adapter for the optional Cloudflare computer control Worker. */
export class RemoteCloudflareComputerProvider implements ComputerProvider {
  readonly backend = "CLOUDFLARE_SANDBOX" as const;

  constructor(private readonly baseUrl: string, private readonly token: string) {}

  async workspace(input: { investigationId: string; agentId: string }): Promise<ComputerWorkspace> {
    return {
      investigationId: input.investigationId,
      agentId: input.agentId,
      workspaceId: `${input.investigationId}-${input.agentId}`.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120),
      backend: this.backend,
      root: "/workspace",
      permissions: ["FILES_READ", "FILES_WRITE", "SHELL_EXECUTE", "NETWORK", "PROCESS_START"],
    };
  }

  private url(workspace: ComputerWorkspace, operation: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}/computer/${encodeURIComponent(workspace.investigationId)}/${encodeURIComponent(workspace.agentId)}/${operation}`;
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.token}`, ...(init?.headers ?? {}) },
    });
    const body = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(body.error ?? `Cloudflare computer request failed (${response.status})`);
    return body;
  }

  async exec(workspace: ComputerWorkspace, request: ComputerExecRequest): Promise<ComputerExecResult> {
    const started = Date.now();
    try {
      const body = await this.request<{ ok: boolean; stdout: string; stderr: string; exitCode: number }>(this.url(workspace, "exec"), {
        method: "POST",
        body: JSON.stringify(request),
      });
      return { ...body, durationMs: Date.now() - started };
    } catch (error) {
      return { ok: false, stdout: "", stderr: error instanceof Error ? error.message : String(error), exitCode: 1, durationMs: Date.now() - started };
    }
  }

  async readFile(workspace: ComputerWorkspace, path: string): Promise<ComputerFileResult> {
    try {
      const body = await this.request<{ ok: boolean; path: string; content?: string }>(`${this.url(workspace, "file")}?path=${encodeURIComponent(path)}`);
      return body;
    } catch (error) {
      return { ok: false, path, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async writeFile(workspace: ComputerWorkspace, path: string, content: string): Promise<ComputerFileResult> {
    try {
      const body = await this.request<{ ok: boolean; path: string }>(this.url(workspace, "file"), { method: "POST", body: JSON.stringify({ path, content }) });
      return body;
    } catch (error) {
      return { ok: false, path, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async list(workspace: ComputerWorkspace, path = "/workspace"): Promise<ComputerListResult> {
    try {
      const body = await this.request<{ ok: boolean; path: string; entries: string[] }>(`${this.url(workspace, "list")}?path=${encodeURIComponent(path)}`);
      return body;
    } catch (error) {
      return { ok: false, path, entries: [], error: error instanceof Error ? error.message : String(error) };
    }
  }
}
