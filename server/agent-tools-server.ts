// Standalone agent capability gateway. The main investigation API can consume these primitives
// directly in-process; this server also makes them available for local tooling and future workers.
import express from "express";
import cors from "cors";
import { executeNetworkTool } from "./investigation/network-tools.js";
import { globalBulletinBoard } from "./investigation/bulletin-board.js";
import { globalToolPermissions } from "./investigation/tool-permissions.js";
import { globalAgentRuntime } from "./investigation/agent-runtime.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
const port = Number(process.env.AGENT_TOOLS_PORT ?? 3002);

app.get("/health", (_req, res) => res.json({ status: "ok", service: "agent-tools", network: ["web_search", "web_fetch", "github_search"] }));

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

app.get("/permissions", (req, res) => res.json(globalToolPermissions.list(req.query.agentId as string | undefined)));
app.post("/permissions", (req, res) => {
  try { res.status(201).json(globalToolPermissions.grant(req.body)); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
});
app.delete("/permissions/:agentId/:toolId", (req, res) => { globalToolPermissions.revoke(req.params.agentId, req.params.toolId); res.json({ ok: true }); });

app.listen(port, () => console.log(`Ruthless Investigator Agent Tools running on http://localhost:${port}`));
