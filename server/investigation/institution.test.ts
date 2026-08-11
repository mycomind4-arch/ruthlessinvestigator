import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { InstitutionalFramework } from "./institution.js";

describe("InstitutionalFramework", () => {
  it("persists agents, capabilities, and permission grants", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ri-institution-"));
    process.env.INSTITUTION_DATA_DIR = dir;
    const framework = new InstitutionalFramework();
    await framework.load();
    const agent = await framework.registerAgent({ name: "Test Agent", role: "OSINT", status: "ACTIVE", capabilities: [], permissions: [], constitutionVersion: "1.0.0", performance: { tasks: 0, successes: 0, failures: 0, evidenceProduced: 0, provenanceViolations: 0 } });
    const cap = await framework.registerCapability({ name: "Source Verification", version: 1, description: "Verify provenance", status: "PROPOSED", prerequisites: [], composedFrom: [], permissions: ["source.verify"], risk: "LOW", provenance: [] });
    await framework.certifyCapability(cap.id, agent.id, 5, 1, ["test"], "director");
    await framework.grantPermission(agent.id, cap.id, "source.verify", "certified capability");
    const reloaded = new InstitutionalFramework(); await reloaded.load();
    expect(reloaded.getConstitution().version).toBe("1.0.0");
    expect(reloaded.listAgents()).toHaveLength(1);
    expect(reloaded.listCapabilities("CERTIFIED")).toHaveLength(1);
    expect(reloaded.listGrants(agent.id)).toHaveLength(1);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("blocks self-certification and uncertified permissions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ri-institution-"));
    process.env.INSTITUTION_DATA_DIR = dir;
    const framework = new InstitutionalFramework(); await framework.load();
    const agent = await framework.registerAgent({ name: "Agent", role: "OSINT", status: "ACTIVE", capabilities: [], permissions: [], constitutionVersion: "1.0.0", performance: { tasks: 0, successes: 0, failures: 0, evidenceProduced: 0, provenanceViolations: 0 } });
    const cap = await framework.registerCapability({ name: "Network Research", version: 1, description: "Research", status: "PROPOSED", prerequisites: [], composedFrom: [], permissions: ["web.search"], risk: "MODERATE", provenance: [] });
    await expect(framework.certifyCapability(cap.id, agent.id, 2, 0, [], agent.id)).rejects.toThrow("Self-certification");
    await expect(framework.grantPermission(agent.id, cap.id, "web.search", "test")).rejects.toThrow("certified");
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("composes capabilities without auto-granting permissions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ri-institution-")); process.env.INSTITUTION_DATA_DIR = dir;
    const framework = new InstitutionalFramework(); await framework.load();
    const a = await framework.registerCapability({ name: "Search", version: 1, description: "Search", status: "CERTIFIED", prerequisites: [], composedFrom: [], permissions: ["web.search"], risk: "LOW", provenance: [] });
    const b = await framework.registerCapability({ name: "Source Review", version: 1, description: "Review", status: "CERTIFIED", prerequisites: [], composedFrom: [], permissions: ["source.verify"], risk: "LOW", provenance: [] });
    const composite = await framework.composeCapability("Research Suite", "Composite capability", [a.id, b.id]);
    expect(composite.status).toBe("PROPOSED");
    expect(composite.permissions.sort()).toEqual(["source.verify", "web.search"]);
    expect(framework.listGrants()).toHaveLength(0);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
