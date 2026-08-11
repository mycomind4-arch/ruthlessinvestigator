import { globalBulletinBoard, type BulletinPost, type AgentHandoff } from "./bulletin-board.js";
import { globalToolPermissions, type ToolPermission, type ToolGrant } from "./tool-permissions.js";
import { executeNetworkTool, type NetworkRequest, type NetworkResult, type NetworkToolId } from "./network-tools.js";

export interface AgentWorkspaceSnapshot {
  investigationId: string;
  agentId: string;
  permissions: ToolGrant[];
  availableTools: Array<{ id: NetworkToolId; description: string; write: boolean }>;
  recentNotes: BulletinPost[];
  handoffs: AgentHandoff[];
}

const TOOL_CATALOG: AgentWorkspaceSnapshot["availableTools"] = [
  { id: "web_search", description: "Search the public web for discovery leads", write: false },
  { id: "web_fetch", description: "Fetch a public web document for evidence review", write: false },
  { id: "document_fetch", description: "Fetch a document URL for extraction", write: false },
  { id: "github_search", description: "Search public GitHub repositories", write: false },
  { id: "http_request", description: "Make an explicitly permissioned HTTP request; writes are never implicit", write: true },
];

export class AgentWorkspace {
  snapshot(investigationId: string, agentId: string): AgentWorkspaceSnapshot {
    return {
      investigationId,
      agentId,
      permissions: globalToolPermissions.list(agentId),
      availableTools: TOOL_CATALOG,
      recentNotes: globalBulletinBoard.recent(investigationId, 30),
      handoffs: globalBulletinBoard.getHandoffs(investigationId),
    };
  }

  postNote(input: Parameters<typeof globalBulletinBoard.post>[0]): BulletinPost {
    return globalBulletinBoard.post(input);
  }

  handoff(input: Parameters<typeof globalBulletinBoard.handoff>[0]): AgentHandoff {
    return globalBulletinBoard.handoff(input);
  }

  async execute(investigationId: string, agentId: string, request: NetworkRequest): Promise<NetworkResult> {
    const scope = request.repository ? "SPECIFIC_REPOSITORY" : request.domain ? "SPECIFIC_DOMAIN" : "PUBLIC_WEB";
    const permission = globalToolPermissions.check(agentId, request.tool, scope, request.repository ?? request.domain);
    if (permission !== "ALLOWED") {
      return {
        ok: false,
        tool: request.tool,
        query: request.query,
        sources: [],
        durationMs: 0,
        error: permission === "ASK" ? "Tool permission required" : "Tool access denied",
      };
    }
    return executeNetworkTool(request);
  }

  grant(input: Omit<ToolGrant, "grantedAt">): ToolGrant {
    return globalToolPermissions.grant(input);
  }

  permission(agentId: string, toolId: string, scope: ToolGrant["scope"], scopeValue?: string): ToolPermission {
    return globalToolPermissions.check(agentId, toolId, scope, scopeValue);
  }
}

export const globalAgentWorkspace = new AgentWorkspace();
