export type ComputerBackend = "LOCAL" | "CLOUDFLARE_SANDBOX";

export type ComputerPermission =
  | "FILES_READ"
  | "FILES_WRITE"
  | "SHELL_EXECUTE"
  | "NETWORK"
  | "PROCESS_START";

export interface ComputerWorkspace {
  investigationId: string;
  agentId: string;
  workspaceId: string;
  backend: ComputerBackend;
  root: string;
  permissions: ComputerPermission[];
}

export interface ComputerExecRequest {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface ComputerExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  truncated?: boolean;
}

export interface ComputerFileResult {
  ok: boolean;
  path: string;
  content?: string;
  error?: string;
}

export interface ComputerListResult {
  ok: boolean;
  path: string;
  entries: string[];
  error?: string;
}

export interface ComputerProvider {
  readonly backend: ComputerBackend;
  workspace(input: { investigationId: string; agentId: string }): Promise<ComputerWorkspace>;
  exec(workspace: ComputerWorkspace, request: ComputerExecRequest): Promise<ComputerExecResult>;
  readFile(workspace: ComputerWorkspace, path: string): Promise<ComputerFileResult>;
  writeFile(workspace: ComputerWorkspace, path: string, content: string): Promise<ComputerFileResult>;
  list(workspace: ComputerWorkspace, path?: string): Promise<ComputerListResult>;
}

/** Narrow interface implemented by Cloudflare Sandbox's RPC object.
 * Keeping this structural avoids coupling the investigation engine to the
 * Cloudflare SDK and makes the adapter testable without a Cloudflare runtime.
 */
export interface CloudflareSandboxLike {
  exec(command: string, options?: { cwd?: string; timeout?: number }): Promise<{
    success: boolean;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  }>;
  readFile(path: string): Promise<{ content: string }>;
  writeFile(path: string, content: string): Promise<unknown>;
  listFiles(path?: string): Promise<string[] | { files?: string[] }>;
}
