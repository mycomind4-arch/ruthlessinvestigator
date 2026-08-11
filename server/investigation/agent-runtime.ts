import { globalAgentWorkspace } from "./agent-workspace.js";
import type { NetworkRequest, NetworkResult, NetworkToolId } from "./network-tools.js";
import { globalToolPermissions } from "./tool-permissions.js";
import { globalBulletinBoard } from "./bulletin-board.js";
import { localComputerProvider } from "./computer-fabric.js";
import type { ComputerExecRequest, ComputerExecResult, ComputerFileResult, ComputerListResult, ComputerProvider, ComputerWorkspace } from "./computer-types.js";

export interface ToolExecutionRecord {
  id: string;
  investigationId: string;
  agentId: string;
  request: NetworkRequest;
  result: NetworkResult;
  createdAt: number;
  costUSD: number;
}

export interface ComputerExecutionRecord {
  id: string;
  investigationId: string;
  agentId: string;
  workspaceId: string;
  operation: "EXEC" | "READ" | "WRITE" | "LIST";
  target: string;
  ok: boolean;
  durationMs: number;
  createdAt: number;
}

export interface ResearchPlan { tool: NetworkToolId; reason: string; query: string; maxResults: number; }

const COMPUTER_TOOL_IDS = {
  workspace: "computer_workspace",
  exec: "computer_exec",
  read: "computer_read",
  write: "computer_write",
  list: "computer_list",
} as const;

/** Runtime gateway for agent capabilities. All network/computer activity is explicit, permission checked and logged. */
export class AgentRuntime {
  private executions: ToolExecutionRecord[] = [];
  private computerExecutions: ComputerExecutionRecord[] = [];
  private computerProvider: ComputerProvider = localComputerProvider;

  constructor() {
    // The Director is the only role with built-in computer authority. Other
    // agents must earn/grant these capabilities through the existing permission system.
    for (const toolId of Object.values(COMPUTER_TOOL_IDS)) {
      globalToolPermissions.grant({
        agentId: "DIRECTOR",
        toolId,
        permission: "ALLOWED",
        scope: "INVESTIGATION_ONLY",
        reason: "Director system capability: coordinate bounded investigation execution",
      });
    }
  }

  setComputerProvider(provider: ComputerProvider): void {
    this.computerProvider = provider;
  }

  private computerPermission(agentId: string, toolId: string): boolean {
    return globalToolPermissions.check(agentId, toolId, "INVESTIGATION_ONLY") === "ALLOWED";
  }

  async network(investigationId: string, agentId: string, request: NetworkRequest): Promise<NetworkResult> {
    const scope = request.repository ? "SPECIFIC_REPOSITORY" : request.domain ? "SPECIFIC_DOMAIN" : "PUBLIC_WEB";
    const scopeValue = request.repository ?? request.domain;
    const permission = globalToolPermissions.check(agentId, request.tool, scope, scopeValue);
    if (permission !== "ALLOWED") {
      const result: NetworkResult = { ok: false, tool: request.tool, query: request.query, sources: [], error: permission === "ASK" ? "Tool permission required" : "Tool access denied", durationMs: 0 };
      this.executions.push({ id: `toolrun_${Date.now()}`, investigationId, agentId, request, result, createdAt: Date.now(), costUSD: 0 });
      this.postNote(investigationId, agentId, "Network tool blocked", `${request.tool} was not executed: ${result.error}`, "WARNING");
      return result;
    }
    const result = await globalAgentWorkspace.execute(investigationId, agentId, request);
    this.executions.push({ id: `toolrun_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, investigationId, agentId, request, result, createdAt: Date.now(), costUSD: 0 });
    if (!result.ok) this.postNote(investigationId, agentId, "Network tool failed", `${request.tool}: ${result.error ?? "unknown error"}`, "WARNING");
    return result;
  }

  async computerWorkspace(investigationId: string, agentId: string): Promise<ComputerWorkspace> {
    if (!this.computerPermission(agentId, COMPUTER_TOOL_IDS.workspace)) {
      throw new Error("Computer workspace permission denied");
    }
    const workspace = await this.computerProvider.workspace({ investigationId, agentId });
    this.postNote(investigationId, agentId, "Computer workspace ready", `${workspace.backend} workspace ${workspace.workspaceId} is available with ${workspace.permissions.join(", ")}.`, "STATUS");
    return workspace;
  }

  async computerExec(investigationId: string, agentId: string, request: ComputerExecRequest): Promise<ComputerExecResult> {
    if (!this.computerPermission(agentId, COMPUTER_TOOL_IDS.exec)) return { ok: false, stdout: "", stderr: "Computer execution permission denied", exitCode: 126, durationMs: 0 };
    const workspace = await this.computerWorkspace(investigationId, agentId);
    const started = Date.now();
    const result = await this.computerProvider.exec(workspace, request);
    this.recordComputerExecution(investigationId, agentId, workspace.workspaceId, "EXEC", request.command, result.ok, Date.now() - started);
    this.postNote(investigationId, agentId, result.ok ? "Computer command completed" : "Computer command blocked/failed", `${request.command}\n${result.stderr || result.stdout}`.slice(0, 4000), result.ok ? "STATUS" : "WARNING");
    return result;
  }

  async computerRead(investigationId: string, agentId: string, path: string): Promise<ComputerFileResult> {
    if (!this.computerPermission(agentId, COMPUTER_TOOL_IDS.read)) return { ok: false, path, error: "Computer read permission denied" };
    const workspace = await this.computerWorkspace(investigationId, agentId);
    const started = Date.now();
    const result = await this.computerProvider.readFile(workspace, path);
    this.recordComputerExecution(investigationId, agentId, workspace.workspaceId, "READ", path, result.ok, Date.now() - started);
    return result;
  }

  async computerWrite(investigationId: string, agentId: string, path: string, content: string): Promise<ComputerFileResult> {
    if (!this.computerPermission(agentId, COMPUTER_TOOL_IDS.write)) return { ok: false, path, error: "Computer write permission denied" };
    const workspace = await this.computerWorkspace(investigationId, agentId);
    const started = Date.now();
    const result = await this.computerProvider.writeFile(workspace, path, content);
    this.recordComputerExecution(investigationId, agentId, workspace.workspaceId, "WRITE", path, result.ok, Date.now() - started);
    return result;
  }

  async computerList(investigationId: string, agentId: string, path = "/workspace"): Promise<ComputerListResult> {
    if (!this.computerPermission(agentId, COMPUTER_TOOL_IDS.list)) return { ok: false, path, entries: [], error: "Computer list permission denied" };
    const workspace = await this.computerWorkspace(investigationId, agentId);
    const started = Date.now();
    const result = await this.computerProvider.list(workspace, path);
    this.recordComputerExecution(investigationId, agentId, workspace.workspaceId, "LIST", path, result.ok, Date.now() - started);
    return result;
  }

  private recordComputerExecution(investigationId: string, agentId: string, workspaceId: string, operation: ComputerExecutionRecord["operation"], target: string, ok: boolean, durationMs: number) {
    this.computerExecutions.push({ id: `computer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, investigationId, agentId, workspaceId, operation, target, ok, durationMs, createdAt: Date.now() });
  }

  planResearch(agentId: string, objective: string): ResearchPlan {
    const normalized = objective.toLowerCase();
    if (agentId === "PRIMARY_SOURCE_RESEARCHER" || /primary|government|filing|record|official|regulator|court|contract/.test(normalized)) {
      return { tool: "web_search", reason: "Prioritize primary/authoritative source discovery", query: `${objective} primary source official government filing record`, maxResults: 6 };
    }
    if (agentId === "ADVERSARIAL" || agentId === "SKEPTIC" || /disprove|counter|contradict|challenge|falsif/.test(normalized)) {
      return { tool: "web_search", reason: "Search specifically for contradictory or disconfirming evidence", query: `${objective} contradiction counterevidence criticism data`, maxResults: 6 };
    }
    if (/github|repository|open source|implementation|library|skill/.test(normalized)) {
      return { tool: "github_search", reason: "Search the software ecosystem for reusable implementations", query: objective, maxResults: 8 };
    }
    return { tool: "web_search", reason: "Broad discovery pass before deeper source verification", query: objective, maxResults: 5 };
  }

  async researchForAgent(investigationId: string, agentId: string, objective: string, timeoutMs = 12000): Promise<NetworkResult> {
    const plan = this.planResearch(agentId, objective);
    this.postNote(investigationId, agentId, "Research plan selected", `${plan.tool}: ${plan.reason}\nQuery: ${plan.query}`, "METHODOLOGY");
    return this.network(investigationId, agentId, { tool: plan.tool, query: plan.query, maxResults: plan.maxResults, timeoutMs });
  }

  postNote(investigationId: string, agentId: string, subject: string, message: string, type: "DISCOVERY" | "WARNING" | "QUESTION" | "LEAD" | "CONTRADICTION" | "SOURCE" | "EVIDENCE" | "TASK_REQUEST" | "TASK_RESULT" | "ENTITY" | "RELATIONSHIP" | "METHODOLOGY" | "SKILL_DISCOVERY" | "SKILL_FAILURE" | "STATUS" = "STATUS") {
    return globalBulletinBoard.post({ investigationId, authorAgent: agentId, type, subject, message, relatedClaims: [], relatedEvidence: [], relatedSources: [], relatedHypotheses: [], relatedTasks: [], importance: type === "WARNING" || type === "CONTRADICTION" ? "HIGH" : "MODERATE" });
  }

  workspace(investigationId: string, agentId: string) { return globalAgentWorkspace.snapshot(investigationId, agentId); }
  grantTool(input: Parameters<typeof globalAgentWorkspace.grant>[0]) { return globalAgentWorkspace.grant(input); }
  handoff(input: Parameters<typeof globalAgentWorkspace.handoff>[0]) { return globalAgentWorkspace.handoff(input); }
  getExecutions(investigationId?: string): ToolExecutionRecord[] { return this.executions.filter(e => !investigationId || e.investigationId === investigationId); }
  getComputerExecutions(investigationId?: string): ComputerExecutionRecord[] { return this.computerExecutions.filter(e => !investigationId || e.investigationId === investigationId); }
}

export const globalAgentRuntime = new AgentRuntime();
