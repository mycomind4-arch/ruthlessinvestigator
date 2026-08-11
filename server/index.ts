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

// ─── SKILL FOUNDRY API (Directive 05) ───────────────────────────────────────
import { SkillRegistry, defaultPerformance, genSkillId } from "./investigation/skill-registry.js";
import { SkillExecutor } from "./investigation/skill-executor.js";
import { CapabilityGapDetector } from "./investigation/skill-discovery.js";
import { SkillValidator, SkillImprovement } from "./investigation/skill-validation.js";
import { registerBuiltinSkills } from "./investigation/builtin-skills.js";
import type { Skill, SkillProposal, CapabilityGap, SkillStatus } from "./investigation/skill-types.js";
import { SKILL_FOUNDRY_LIMITS } from "./investigation/skill-types.js";
import { selectSkillForStep, detectCapabilityGaps, checkForSkillFoundryIntervention } from "./investigation/director.js";

const skillRegistry = new SkillRegistry();
registerBuiltinSkills(skillRegistry);
await skillRegistry.load();

// ─── List all skills ──────────────────────────────────────────────────────
app.get("/api/skills", (req, res) => {
  const status = req.query.status as SkillStatus | undefined;
  const category = req.query.category as any;
  const skills = skillRegistry.searchSkills({ status, category });
  res.json({
    total: skills.length,
    skills: skills.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      status: s.status,
      version: s.version,
      performance: s.performance,
      subskills: s.subskills.length,
      procedureSteps: s.procedure.length,
      provenance: s.provenance.type,
      domain: s.domain,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  });
});

// ─── Get skill detail ─────────────────────────────────────────────────────
app.get("/api/skills/:id", (req, res) => {
  const skill = skillRegistry.getSkill(req.params.id);
  if (!skill) {
    res.status(404).json({ error: "Skill not found" });
    return;
  }
  res.json(skill);
});

// ─── Search skills ─────────────────────────────────────────────────────────
app.post("/api/skills/search", (req, res) => {
  const query = req.body;
  const results = skillRegistry.searchSkills(query);
  res.json({
    total: results.length,
    skills: results.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      status: s.status,
      performance: s.performance,
    })),
  });
});

// ─── Get skill proposals (capability gaps) ───────────────────────────────
app.get("/api/skills/gaps/:investigationId", (req, res) => {
  const engine = investigations.get(req.params.investigationId);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }
  const state = engine.getState();
  const detector = new CapabilityGapDetector(skillRegistry, state.id);
  const gaps = detectCapabilityGaps(detector, state);
  res.json({ gaps });
});

// ─── Activate a skill ──────────────────────────────────────────────────────
app.post("/api/skills/:id/activate", (req, res) => {
  try {
    skillRegistry.activateSkill(req.params.id);
    res.json({ success: true, message: "Skill activated" });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Deactivate a skill ────────────────────────────────────────────────────
app.post("/api/skills/:id/deactivate", (req, res) => {
  try {
    skillRegistry.deactivateSkill(req.params.id);
    res.json({ success: true, message: "Skill deactivated" });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Deprecate a skill ──────────────────────────────────────────────────────
app.post("/api/skills/:id/deprecate", (req, res) => {
  try {
    skillRegistry.deprecateSkill(req.params.id);
    res.json({ success: true, message: "Skill deprecated" });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Create a new skill manually ───────────────────────────────────────────
app.post("/api/skills", async (req, res) => {
  try {
    const { name, description, purpose, category, inputs, outputs, procedure, domain } = req.body;
    const skill: Skill = {
      id: genSkillId(),
      name,
      description,
      purpose: purpose ?? description,
      category,
      inputs: inputs ?? [],
      outputs: outputs ?? [],
      prerequisites: [],
      procedure: procedure ?? [],
      subskills: [],
      compatibleAgents: req.body.compatibleAgents ?? [],
      compatibleSources: req.body.compatibleSources ?? [],
      validationTests: req.body.validationTests ?? [],
      knownFailureModes: req.body.knownFailureModes ?? [],
      provenance: { type: "USER_CREATED", createdAt: Date.now() },
      version: 1,
      status: "PROPOSED",
      performance: defaultPerformance(),
      versions: [],
      failures: [],
      domain,
      maxCompositionDepth: req.body.maxCompositionDepth ?? 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    skillRegistry.registerSkill(skill);
    await skillRegistry.persist();
    res.status(201).json(skill);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Compose skills ─────────────────────────────────────────────────────────
app.post("/api/skills/compose", (req, res) => {
  try {
    const { parentSkillId, childSkillIds } = req.body;
    const parent = skillRegistry.getSkill(parentSkillId);
    if (!parent) {
      res.status(404).json({ error: "Parent skill not found" });
      return;
    }
    const children = childSkillIds
      .map((id: string) => skillRegistry.getSkill(id))
      .filter((s: Skill | undefined): s is Skill => s !== undefined);
    if (children.length !== childSkillIds.length) {
      res.status(400).json({ error: "One or more child skills not found" });
      return;
    }
    const composed = skillRegistry.composeSkills(parent, children);
    res.status(201).json(composed);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Get skill version history ──────────────────────────────────────────────
app.get("/api/skills/:id/versions", (req, res) => {
  const history = skillRegistry.getVersionHistory(req.params.id);
  res.json({ versions: history });
});

// ─── Create new skill version ────────────────────────────────────────────────
app.post("/api/skills/:id/version", async (req, res) => {
  try {
    const { changes, changeReason, modifications } = req.body;
    const improvement = new SkillImprovement(skillRegistry, "manual");
    const newVersion = improvement.proposeImprovement(req.params.id, changes, changeReason, modifications);
    if (!newVersion) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    await skillRegistry.persist();
    res.status(201).json(newVersion);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Validate a skill ───────────────────────────────────────────────────────
app.post("/api/skills/:id/validate", async (req, res) => {
  try {
    const skill = skillRegistry.getSkill(req.params.id);
    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    const investigationId = req.body.investigationId ?? "validation-sandbox";

    // Use mock provider for validation
    const { model, provider } = registry.resolve("mock/deterministic");
    const executor = new SkillExecutor(skillRegistry, registry, investigationId);

    // Create a minimal mock state
    const mockState = {
      id: investigationId,
      question: "Validation test question",
      phase: "RESEARCH" as const,
      investigationCycle: 0,
      maxCycles: 3,
      hypotheses: new Map(),
      evidence: new Map(),
      claims: new Map(),
      sources: new Map(),
      contradictions: new Map(),
      informationGaps: new Map(),
      researchTasks: new Map(),
      assessment: {
        confidenceLevel: "LOW" as const,
        summary: "",
        supportingEvidence: [],
        contradictingEvidence: [],
        majorUnknowns: [],
        hypothesisSummaries: [],
        revisedAt: Date.now(),
      },
      cost: 0,
      budget: { maxCost: SKILL_FOUNDRY_LIMITS.maxValidationBudget, maxDuration: SKILL_FOUNDRY_LIMITS.maxSkillExecutionTime, maxCycles: 5 },
      agentRuns: [],
      events: [],
      converged: false,
      paused: false,
      assessmentSnapshots: [],
      expandedScorecard: null,
      investigationMode: "STANDARD" as const,
      reasoningConfig: { effort: "standard" as const, maxReasoningSteps: 10, currentDepth: 0, escalations: [], artifact: null },
      currentCycle: null,
      researchMissions: [],
      memory: { items: [], currentFocus: [], resolvedQuestions: [], supersededItems: [], summary: "" },
    };

    const validator = new SkillValidator(skillRegistry, investigationId);
    const result = await validator.validate(skill, executor, mockState as any);

    if (result.overallPass) {
      skillRegistry.activateSkill(skill.id);
      await skillRegistry.persist();
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Get skill failures ──────────────────────────────────────────────────────
app.get("/api/skills/:id/failures", (req, res) => {
  const skill = skillRegistry.getSkill(req.params.id);
  if (!skill) {
    res.status(404).json({ error: "Skill not found" });
    return;
  }
  res.json({ failures: skill.failures });
});

// ─── Check if investigation needs Skill Foundry intervention ────────────────
app.get("/api/skills/intervention/:investigationId", (req, res) => {
  const engine = investigations.get(req.params.investigationId);
  if (!engine) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }
  const state = engine.getState();
  const result = checkForSkillFoundryIntervention(state, skillRegistry);
  res.json(result);
});

// ─── Execute a skill within an investigation ────────────────────────────────
app.post("/api/skills/:id/execute", async (req, res) => {
  try {
    const skill = skillRegistry.getSkill(req.params.id);
    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    if (skill.status !== "ACTIVE" && skill.status !== "VALIDATED") {
      res.status(400).json({ error: `Skill is not active (status: ${skill.status})` });
      return;
    }

    const { investigationId, inputs } = req.body;
    const engine = investigations.get(investigationId);
    if (!engine) {
      res.status(404).json({ error: "Investigation not found" });
      return;
    }

    const state = engine.getState();
    const executor = new SkillExecutor(skillRegistry, registry, investigationId);
    const result = await executor.execute(skill, state, inputs ?? {});
    await skillRegistry.persist();

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Persist skills on shutdown ─────────────────────────────────────────────
process.on("SIGINT", async () => {
  await skillRegistry.persist();
  process.exit(0);
});
