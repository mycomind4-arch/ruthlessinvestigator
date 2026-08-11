// ─── EXPRESS SERVER ──────────────────────────────────────────────────────
// API server for the Ruthless Investigator.
// Directive 05: Persistence, pause/resume, crash recovery.

import express from "express";
import cors from "cors";
import { ModelRegistry } from "./providers/registry.js";
import { MockProvider } from "./providers/mock.js";
import { OpenRouterProvider } from "./providers/openrouter.js";
import { GeminiProvider } from "./providers/gemini.js";
import { InvestigationEngine } from "./investigation/engine.js";
import { globalEventEmitter } from "./investigation/events.js";
import type { InvestigationEvent } from "./investigation/types.js";
import {
  listInvestigations,
  loadInvestigation,
  findIncompleteInvestigations,
} from "./investigation/persistence.js";
import type { InvestigationMode } from "./investigation/persistence-types.js";

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
    activeInvestigations: investigations.size,
    persistedInvestigations: listInvestigationsSync(),
  });
});

// Start investigation
app.post("/api/investigations", async (req, res) => {
  try {
    const { question, budgetUSD, mode } = req.body as { question?: string; budgetUSD?: number; mode?: InvestigationMode };

    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const engine = new InvestigationEngine(registry, {
      question,
      budgetUSD: budgetUSD ?? (process.env.INVESTIGATION_BUDGET_USD ? parseFloat(process.env.INVESTIGATION_BUDGET_USD) : 10),
      forceMock,
      mode: mode ?? "STANDARD",
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
      mode: engine.getMode(),
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
    // ─── Director data ───────────────────────────────────────────────
    predictions: [...(state.predictions?.values() ?? [])],
    failedPredictions: [...(state.failedPredictions?.values() ?? [])],
    mindChangingEvidence: [...(state.mindChangingEvidence?.values() ?? [])],
    hypothesisCompetitions: [...(state.hypothesisCompetitions?.values() ?? [])],
    discriminatingTasks: [...(state.discriminatingTasks?.values() ?? [])],
    evidenceClusters: [...(state.evidenceClusters?.values() ?? [])],
    narrativePatterns: [...(state.narrativePatterns?.values() ?? [])],
    entities: [...(state.entities?.values() ?? [])],
    relationships: [...(state.relationships?.values() ?? [])],
    causalClaims: [...(state.causalClaims?.values() ?? [])],
    investigationMemory: [...(state.investigationMemory?.values() ?? [])],
    assessmentRevisions: [...(state.assessmentRevisions?.values() ?? [])],
    scorecard: state.scorecard,
    userOverrides: [...(state.userOverrides?.values() ?? [])],
    convergenceCheck: state.convergenceCheck,
    investigationCycle: state.investigationCycle,
    maxCycles: state.maxCycles,
    converged: state.converged,
    paused: state.paused,
    // ─── Directive 05 data ──────────────────────────────────────────
    researchCycles: engine.getResearchCycles(),
    decisions: engine.getDecisions(),
    missions: engine.getMissions(),
    checkpoints: engine.getCheckpoints(),
    assessmentSnapshots: engine.getAssessmentSnapshots(),
    reasoningEscalations: engine.getReasoningEscalations(),
    reasoningArtifacts: engine.getReasoningArtifacts(),
    memoryItems: engine.getMemoryItems(),
    mode: engine.getMode(),
    isPaused: engine.isInvestigationPaused(),
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

// ─── Directive 05: Pause investigation ──────────────────────────────────
app.post("/api/investigations/:id/pause", (req, res) => {
  const engine = investigations.get(req.params.id);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }
  engine.pause();
  res.json({ ok: true, message: "Investigation paused" });
});

// ─── Directive 05: Resume investigation ─────────────────────────────────
app.post("/api/investigations/:id/resume", async (req, res) => {
  const engine = investigations.get(req.params.id);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }
  engine.resume();
  // Resume the investigation loop in background
  engine.run().catch((err) => {
    console.error(`Investigation ${engine.id} resume error:`, err);
  });
  res.json({ ok: true, message: "Investigation resumed" });
});

// ─── Directive 05: Reopen converged investigation ────────────────────────
app.post("/api/investigations/:id/reopen", async (req, res) => {
  const engine = investigations.get(req.params.id);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }
  const { trigger } = req.body as { trigger?: string };
  await engine.reopen(trigger ?? "User requested reopening");
  res.json({ ok: true, message: "Investigation reopened" });
});

// ─── Directive 05: Refresh research ─────────────────────────────────────
app.post("/api/investigations/:id/refresh", async (req, res) => {
  const engine = investigations.get(req.params.id);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }
  await engine.refreshResearch();
  res.json({ ok: true, message: "Research refreshed" });
});

// ─── Directive 05: Get assessment diff ──────────────────────────────────
app.get("/api/investigations/:id/assessment-diff", (req, res) => {
  const engine = investigations.get(req.params.id);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }
  const snapshots = engine.getAssessmentSnapshots();
  if (snapshots.length < 2) {
    res.json({ error: "Not enough snapshots to compare" });
    return;
  }
  const from = snapshots[snapshots.length - 2];
  const to = snapshots[snapshots.length - 1];
  // Import compareSnapshots
  const { compareSnapshots } = require("./investigation/memory-system.js");
  const diff = compareSnapshots(from, to);
  res.json(diff);
});

// List all investigations (active + persisted)
app.get("/api/investigations", async (_req, res) => {
  const active = [...investigations.values()].map((e) => ({
    id: e.id,
    question: e.question,
    phase: e.getPhase(),
    mode: e.getMode(),
    active: true,
  }));

  // Also list persisted investigations not currently active
  const persisted = await listInvestigations();
  const activeIds = new Set(active.map((a) => a.id));
  const persistedOnly = persisted
    .filter((p) => !activeIds.has(p.id))
    .map((p) => ({ ...p, active: false }));

  res.json([...active, ...persistedOnly]);
});

// ─── Directive 05: Load persisted investigation into memory ─────────────
app.post("/api/investigations/:id/load", async (req, res) => {
  if (investigations.has(req.params.id)) {
    res.json({ ok: true, message: "Already loaded" });
    return;
  }

  const engine = await InvestigationEngine.recover(registry, req.params.id);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found in storage" });
    return;
  }

  investigations.set(engine.id, engine);
  res.json({
    ok: true,
    id: engine.id,
    question: engine.question,
    phase: engine.getPhase(),
    mode: engine.getMode(),
  });
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

  const existingEvents = engine.getEvents();
  for (const event of existingEvents) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  const unsubscribe = globalEventEmitter.subscribe(engine.id, (event: InvestigationEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  const keepAlive = setInterval(() => {
    res.write(`: keep-alive\n\n`);
  }, 15000);

  req.on("close", () => {
    unsubscribe();
    clearInterval(keepAlive);
  });
});

// ─── Directive 05: Synchronous list helper ────────────────────────────────
function listInvestigationsSync(): number {
  // Quick count — async version used for full listing
  return 0; // placeholder; the async route does the real listing
}

// ─── Start server ────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`Ruthless Investigator API running on http://localhost:${PORT}`);
  console.log(`Providers: mock=✓ openrouter=${openrouterKey ? "✓" : "✗"} gemini=${geminiKey ? "✓" : "✗"}`);
  if (forceMock) {
    console.log("⚠ Running in MOCK MODE — no API keys configured. All responses are simulated.");
  }

  // ─── Directive 05: Crash Recovery ──────────────────────────────────────
  const incomplete = await findIncompleteInvestigations();
  if (incomplete.length > 0) {
    console.log(`\n📋 Found ${incomplete.length} incomplete investigation(s) — recovering...`);
    for (const serialized of incomplete) {
      try {
        const engine = await InvestigationEngine.recover(registry, serialized.id);
        if (engine) {
          investigations.set(engine.id, engine);
          console.log(`  ✓ Recovered: ${engine.id} — "${engine.question.substring(0, 60)}" [${engine.getPhase()}]`);
        }
      } catch (err) {
        console.error(`  ✗ Failed to recover ${serialized.id}:`, err);
      }
    }
  }
});
