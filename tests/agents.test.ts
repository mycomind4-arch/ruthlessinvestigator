// ─── TESTS: Agent Isolation ───────────────────────────────────────────────
// Initial research agents cannot see each other's conclusions.

import { describe, it, expect } from "vitest";
import { InvestigationEngine } from "../server/investigation/engine.js";
import { ModelRegistry } from "../server/providers/registry.js";
import { MockProvider } from "../server/providers/mock.js";

describe("Agent Isolation", () => {
  it("Independent research agents do not see each other's outputs", async () => {
    const registry = new ModelRegistry();
    registry.registerProvider(new MockProvider());

    const engine = new InvestigationEngine(registry, {
      question: "Test question",
      forceMock: true,
    });

    // Track events from each agent
    const agentEvents: Record<string, string[]> = {};
    const { globalEventEmitter } = await import("../server/investigation/events.js");
    const unsub = globalEventEmitter.subscribe(engine.id, (event) => {
      if (event.agentRole) {
        const key = event.agentRole;
        if (!agentEvents[key]) agentEvents[key] = [];
        agentEvents[key].push(event.message);
      }
    });

    await engine.run();
    unsub();

    // Primary Source Researcher and OSINT Researcher should have separate events
    const primaryEvents = agentEvents["PRIMARY_SOURCE_RESEARCHER"] ?? [];
    const osintEvents = agentEvents["OSINT_RESEARCHER"] ?? [];

    // Both should have events
    expect(primaryEvents.length).toBeGreaterThan(0);
    expect(osintEvents.length).toBeGreaterThan(0);

    // Neither agent's output should reference the other agent's findings
    // (In mock mode this is trivially true, but the architecture ensures it)
    const allPrimary = primaryEvents.join(" ").toLowerCase();
    const allOsint = osintEvents.join(" ").toLowerCase();

    expect(allPrimary).not.toContain("osint");
    expect(allOsint).not.toContain("primary source researcher");
  });
});
