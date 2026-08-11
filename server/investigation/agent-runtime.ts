import { executeNetworkTool, type NetworkRequest, type NetworkResult } from "./network-tools.js";
import { globalToolPermissions } from "./tool-permissions.js";
import { globalBulletinBoard } from "./bulletin-board.js";

export interface ToolExecutionRecord {
  id: string;
  investigationId: string;
  agentId: string;
  request: NetworkRequest;
  result: NetworkResult;
  createdAt: number;
  costUSD: number;
}

export class AgentRuntime {
  private executions: ToolExecutionRecord[] = [];

  async network(investigationId: string, agentId: string, request: NetworkRequest): Promise<NetworkResult> {
    const scope = request.repository ? "SPECIFIC_REPOSITORY" : request.domain ? "SPECIFIC_DOMAIN" : "PUBLIC_WEB";
    const scopeValue = request.repository ?? request.domain;
    const permission = globalToolPermissions.check(agentId, request.tool, scope, scopeValue);
    if (permission !== "ALLOWED") {
      const result: NetworkResult = { ok: false, tool: request.tool, query: request.query, sources: [], error: permission === "ASK" ? "Tool permission required" : "Tool access denied", durationMs: 0 };
      this.executions.push({ id: `toolrun_${Date.now()}`, investigationId, agentId, request, result, createdAt: Date.now(), costUSD: 0 });
      return result;
    }
    const result = await executeNetworkTool(request);
    this.executions.push({ id: `toolrun_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, investigationId, agentId, request, result, createdAt: Date.now(), costUSD: 0 });
    return result;
  }

  postNote(investigationId: string, agentId: string, subject: string, message: string, type: "DISCOVERY" | "WARNING" | "QUESTION" | "LEAD" | "CONTRADICTION" | "SOURCE" | "EVIDENCE" | "TASK_REQUEST" | "TASK_RESULT" | "ENTITY" | "RELATIONSHIP" | "METHODOLOGY" | "SKILL_DISCOVERY" | "SKILL_FAILURE" | "STATUS" = "STATUS") {
    return globalBulletinBoard.post({ investigationId, authorAgent: agentId, type, subject, message, relatedClaims: [], relatedEvidence: [], relatedSources: [], relatedHypotheses: [], relatedTasks: [], importance: type === "WARNING" || type === "CONTRADICTION" ? "HIGH" : "MODERATE" });
  }

  getExecutions(investigationId?: string): ToolExecutionRecord[] { return this.executions.filter(e => !investigationId || e.investigationId === investigationId); }
}

export const globalAgentRuntime = new AgentRuntime();
