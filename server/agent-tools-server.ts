// Standalone agent capability gateway. Network content is DATA, never instructions.
import express from "express";
import cors from "cors";
import { globalBulletinBoard } from "./investigation/bulletin-board.js";
import { globalToolPermissions } from "./investigation/tool-permissions.js";
import { globalAgentRuntime } from "./investigation/agent-runtime.js";
import { globalAgentWorkspace } from "./investigation/agent-workspace.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
const port = Number(process.env.AGENT_TOOLS_PORT ?? 3002);

app.get("/health", (_req, res) => res.json({ status: "ok", service: "agent-tools", network: ["web_search", "web_fetch", "document_fetch", "github_search", "http_request"] }));

// Full capability snapshot: what an agent can use and what its peers have left behind.
app.get("/workspace/:investigationId/:agentId", (req, res) => {
  res.json(globalAgentWorkspace.snapshot(req.params.investigationId, req.params.agentId));
});

app.post("/tools/network", async (req, res) => {
  const { agentId = "unknown", investigationId = "standalone", request } = req.body ?? {};
  if (!request?.tool) { res.status(400).json({ error: "request.tool is required" }); return; }
  const result = await globalAgentRuntime.network(investigationId, agentId, request);
  res.json(result);
});

app.get("/tools/executions/:investigationId", (req, res) => res.json(globalAgentRuntime.getExecutions(req.params.investigationId)));

app.get("/bulletin/:investigationId", (req, res) => res.json(globalBulletinBoard.search(req.params.investigationId, String(req.query.q ?? ""), req.query.type as any)));
app.post("/bulletin", (req, res) => {
  try { res.status(201).json(globalBulletinBoard.post(req.body)); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});

app.get("/handoffs/:investigationId", (req, res) => res.json(globalBulletinBoard.getHandoffs(req.params.investigationId)));
app.post("/handoffs", (req, res) => {
  try { res.status(201).json(globalBulletinBoard.handoff(req.body)); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});
app.patch("/handoffs/:investigationId/:handoffId", (req, res) => {
  const item = globalBulletinBoard.updateHandoff(req.params.investigationId, req.params.handoffId, req.body?.status);
  if (!item) { res.status(404).json({ error: "Handoff not found" }); return; }
  res.json(item);
});

app.get("/permissions", (req, res) => res.json(globalToolPermissions.list(req.query.agentId as string | undefined)));
app.post("/permissions", (req, res) => {
  try { res.status(201).json(globalToolPermissions.grant(req.body)); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});
app.delete("/permissions/:agentId/:toolId", (req, res) => { globalToolPermissions.revoke(req.params.agentId, req.params.toolId); res.json({ ok: true }); });

await globalBulletinBoard.load();
app.listen(port, () => console.log(`Ruthless Investigator Agent Tools running on http://localhost:${port}`));
