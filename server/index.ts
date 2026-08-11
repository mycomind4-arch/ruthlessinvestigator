// ─── EXPRESS SERVER ──────────────────────────────────────────────────────
// API server for the Ruthless Investigator.

import express from "express";
import cors from "cors";
import { ModelRegistry } from "./providers/registry.js";
import { MockProvider } from "./providers/mock.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import { GeminiProvider } from "./providers/gemini.js";
import { InvestigationEngine } from "./investigation/engine.js";
import { globalEventEmitter } from "./investigation/events.js";
import type { InvestigationEvent } from "./investigation/types.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// ─── Set up providers ────────────────────────────────────────────────────
const registry = new ModelRegistry();
registry.registerProvider(new MockProvider());

const openrouterKey = process.env.OPENROUTER_API_KEY;
if (openrouterKey) {
  registry.registerProvider(new OpenRouterProvider(openrouterKey));
}

const geminiKey = process.env.GEMINI_API_KEY;
if (geminiKey) {
  registry.registerProvider(new GeminiProvider(geminiKey));
}

// Determine if we should force mock mode
const forceMock = !openrouterKey && !geminiKey;

// ─── Active investigations ──────────────────────────────────────────────
const investigations = new Map<string, InvestigationEngine>();

// ─── Routes ──────────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    providers: {
      mock: true,
      openrouter: !!openrouterKey,
      gemini: !!geminiKey,
      forceMock,
    },
    models: registry.listModels().map((m) => ({ id: m.id, displayName: m.displayName, provider: m.provider, enabled: m.enabled })),
  });
});

// Start investigation
app.post("/api/investigations", async (req, res) => {
  try {
    const { question, budgetUSD } = req.body as { question?: string; budgetUSD?: number };

    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const engine = new InvestigationEngine(registry, {
      question,
      budgetUSD: budgetUSD ?? (process.env.INVESTIGATION_BUDGET_USD ? parseFloat(process.env.INVESTIGATION_BUDGET_USD) : 10),
      forceMock,
    });

    investigations.set(engine.id, engine);

    // Start investigation in background
    engine.run().catch((err) => {
      console.error(`Investigation ${engine.id} error:`, err);
    });

    res.json({
      id: engine.id,
      question: engine.question,
      phase: engine.getPhase(),
    });
  } catch (err) {
    console.error("Failed to start investigation:", err);
    res.status(500).json({ error: "Failed to start investigation" });
  }
});

// Get investigation state
app.get("/api/investigations/:id", (req, res) => {
  const engine = investigations.get(req.params.id);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }

  const state = engine.getState();
  // Convert Maps to arrays for JSON serialization
  res.json({
    id: state.id,
    question: state.question,
    phase: state.phase,
    phaseHistory: state.phaseHistory,
    hypotheses: [...state.hypotheses.values()],
    claims: [...state.claims.values()],
    evidence: [...state.evidence.values()],
    sources: [...state.sources.values()],
    contradictions: [...state.contradictions.values()],
    disagreements: [...state.disagreements.values()],
    devilsEvidence: [...state.devilsEvidence.values()],
    informationGaps: [...state.informationGaps.values()],
    researchTasks: [...state.researchTasks.values()],
    adversarialChallenges: [...state.adversarialChallenges.values()],
    assessment: state.assessment,
    budget: {
      budgetUSD: state.budgetUSD,
      spentUSD: state.spentUSD,
    },
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  });
});

// Get investigation events
app.get("/api/investigations/:id/events", (req, res) => {
  const engine = investigations.get(req.params.id);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }
  res.json(engine.getEvents());
});

// Get agent runs (observability)
app.get("/api/investigations/:id/runs", (req, res) => {
  const engine = investigations.get(req.params.id);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }
  res.json(engine.getAgentRuns());
});

// Get cost summary
app.get("/api/investigations/:id/cost", (req, res) => {
  const engine = investigations.get(req.params.id);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }
  res.json(engine.getCostSummary());
});

// User intervention
app.post("/api/investigations/:id/intervene", async (req, res) => {
  const engine = investigations.get(req.params.id);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }

  const { instruction } = req.body as { instruction?: string };
  if (!instruction) {
    res.status(400).json({ error: "instruction is required" });
    return;
  }

  await engine.addUserIntervention(instruction);
  res.json({ ok: true, message: "Intervention added" });
});

// List all investigations
app.get("/api/investigations", (_req, res) => {
  const list = [...investigations.values()].map((e) => ({
    id: e.id,
    question: e.question,
    phase: e.getPhase(),
  }));
  res.json(list);
});

// ─── SSE Event Stream ────────────────────────────────────────────────────
app.get("/events/:id", (req, res) => {
  const engine = investigations.get(req.params.id);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Send existing events first
  const existingEvents = engine.getEvents();
  for (const event of existingEvents) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Subscribe to new events
  const unsubscribe = globalEventEmitter.subscribe(engine.id, (event: InvestigationEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(`: keep-alive\n\n`);
  }, 15000);

  req.on("close", () => {
    unsubscribe();
    clearInterval(keepAlive);
  });
});

// ─── Start server ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Ruthless Investigator API running on http://localhost:${PORT}`);
  console.log(`Providers: mock=✓ openrouter=${openrouterKey ? "✓" : "✗"} gemini=${geminiKey ? "✓" : "✗"}`);
  if (forceMock) {
    console.log("⚠ Running in MOCK MODE — no API keys configured. All responses are simulated.");
  }
});
