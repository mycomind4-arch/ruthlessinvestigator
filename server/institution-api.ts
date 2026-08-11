import { Router } from "express";
import { InstitutionalFramework } from "./investigation/institution.js";

export const institutionalFramework = new InstitutionalFramework();
export const institutionalRouter = Router();

institutionalRouter.get("/constitution", (_req, res) => res.json(institutionalFramework.getConstitution()));
institutionalRouter.get("/snapshot", (_req, res) => res.json(institutionalFramework.getSnapshot()));
institutionalRouter.get("/agents", (_req, res) => res.json(institutionalFramework.listAgents()));
institutionalRouter.get("/capabilities", (req, res) => res.json(institutionalFramework.listCapabilities(req.query.status as any)));
institutionalRouter.get("/permissions", (req, res) => res.json(institutionalFramework.listGrants(req.query.agentId as string | undefined)));
institutionalRouter.get("/memory", (_req, res) => res.json(institutionalFramework.listMemory()));

institutionalRouter.post("/agents", async (req, res) => { try { res.status(201).json(await institutionalFramework.registerAgent(req.body)); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); } });
institutionalRouter.post("/capabilities", async (req, res) => { try { res.status(201).json(await institutionalFramework.registerCapability(req.body)); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); } });
institutionalRouter.post("/capabilities/compose", async (req, res) => { try { const { name, description, componentIds, risk } = req.body; res.status(201).json(await institutionalFramework.composeCapability(name, description, componentIds, risk)); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); } });
institutionalRouter.post("/capabilities/:id/certify", async (req, res) => { try { const { agentId, testsPassed, testsFailed, evidence, evaluator } = req.body; await institutionalFramework.certifyCapability(req.params.id, agentId, testsPassed, testsFailed, evidence ?? [], evaluator); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); } });
institutionalRouter.post("/permissions", async (req, res) => { try { const { agentId, capabilityId, permission, reason } = req.body; res.status(201).json(await institutionalFramework.grantPermission(agentId, capabilityId, permission, reason)); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); } });
institutionalRouter.delete("/permissions/:id", async (req, res) => { try { await institutionalFramework.revokePermission(req.params.id); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); } });
institutionalRouter.post("/memory", async (req, res) => { try { res.status(201).json(await institutionalFramework.remember(req.body)); } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); } });
institutionalRouter.post("/audit", async (_req, res) => { try { res.json(await institutionalFramework.audit()); } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); } });

export async function initializeInstitution(): Promise<void> { await institutionalFramework.load(); }
