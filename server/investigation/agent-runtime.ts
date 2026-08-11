import { globalAgentWorkspace } from "./agent-workspace.js";
import type { NetworkRequest, NetworkResult, NetworkToolId } from "./network-tools.js";
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

export interface ResearchPlan { tool: NetworkToolId; reason: string; query: string; maxResults: number; }

/** Runtime gateway for agent capabilities. All network activity is explicit, permission checked and logged. */
export class AgentRuntime {
  private executions: ToolExecutionRecord[] = [];

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
}

export const globalAgentRuntime = new AgentRuntime();
