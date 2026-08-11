// ─── INVESTIGATION TASK MANAGER ───────────────────────────────────────────
// Directive 05: Queue, prioritize, pause, resume, cancel, retry tasks.
// Tasks must survive application restarts (via persistence layer).

import type { ResearchMission, MissionStatus } from "./persistence-types.js";

let missionCounter = 0;

export function genMissionId(): string {
  return `mission-${Date.now()}-${++missionCounter}`;
}

export class InvestigationTaskManager {
  private missions: Map<string, ResearchMission> = new Map();
  private queue: string[] = []; // mission IDs in priority order
  private active: Set<string> = new Set(); // currently running
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  // ─── Queue Management ──────────────────────────────────────────────────

  queueTask(mission: ResearchMission): void {
    this.missions.set(mission.id, mission);
    // Insert into queue at the right priority position
    const insertIdx = this.queue.findIndex((id) => {
      const m = this.missions.get(id);
      return m && m.priority < mission.priority;
    });
    if (insertIdx === -1) {
      this.queue.push(mission.id);
    } else {
      this.queue.splice(insertIdx, 0, mission.id);
    }
  }

  prioritizeTasks(): void {
    // Re-sort queue by priority (higher = more important)
    this.queue.sort((a, b) => {
      const ma = this.missions.get(a);
      const mb = this.missions.get(b);
      if (!ma || !mb) return 0;
      return mb.priority - ma.priority;
    });
  }

  startTask(missionId: string): ResearchMission | null {
    const mission = this.missions.get(missionId);
    if (!mission) return null;
    if (mission.status !== "PENDING" && mission.status !== "PAUSED") return null;

    // Check dependencies
    const pendingDeps = mission.dependencies.filter((depId) => {
      const dep = this.missions.get(depId);
      return dep && dep.status !== "COMPLETED";
    });
    if (pendingDeps.length > 0) return null;

    if (this.active.size >= this.maxConcurrent) return null;

    mission.status = "IN_PROGRESS";
    mission.startedAt = Date.now();
    this.active.add(missionId);
    this.queue = this.queue.filter((id) => id !== missionId);

    return mission;
  }

  pauseTask(missionId: string): void {
    const mission = this.missions.get(missionId);
    if (!mission) return;
    if (mission.status === "IN_PROGRESS") {
      mission.status = "PAUSED";
      this.active.delete(missionId);
      // Put back in queue
      this.queue.push(missionId);
    }
  }

  resumeTask(missionId: string): ResearchMission | null {
    const mission = this.missions.get(missionId);
    if (!mission || mission.status !== "PAUSED") return null;
    return this.startTask(missionId);
  }

  cancelTask(missionId: string): void {
    const mission = this.missions.get(missionId);
    if (!mission) return;
    mission.status = "CANCELLED";
    mission.completedAt = Date.now();
    this.active.delete(missionId);
    this.queue = this.queue.filter((id) => id !== missionId);
  }

  retryTask(missionId: string): ResearchMission | null {
    const mission = this.missions.get(missionId);
    if (!mission) return null;
    if (mission.status !== "FAILED") return null;
    mission.status = "PENDING";
    mission.startedAt = undefined;
    mission.completedAt = undefined;
    this.queueTask(mission);
    return mission;
  }

  escalateTask(missionId: string, newPriority: number, newDepth: string): ResearchMission | null {
    const mission = this.missions.get(missionId);
    if (!mission) return null;
    mission.priority = newPriority;
    mission.reasoningDepth = newDepth as ResearchMission["reasoningDepth"];
    this.prioritizeTasks();
    return mission;
  }

  completeTask(missionId: string, result: ResearchMission["result"]): void {
    const mission = this.missions.get(missionId);
    if (!mission) return;
    mission.status = "COMPLETED";
    mission.result = result;
    mission.completedAt = Date.now();
    this.active.delete(missionId);
  }

  failTask(missionId: string, error: string): void {
    const mission = this.missions.get(missionId);
    if (!mission) return;
    mission.status = "FAILED";
    mission.completedAt = Date.now();
    this.active.delete(missionId);
  }

  // ─── Queries ────────────────────────────────────────────────────────────

  getMission(id: string): ResearchMission | undefined {
    return this.missions.get(id);
  }

  getAllMissions(): ResearchMission[] {
    return [...this.missions.values()];
  }

  getPendingMissions(): ResearchMission[] {
    return this.queue.map((id) => this.missions.get(id)).filter(Boolean) as ResearchMission[];
  }

  getActiveMissions(): ResearchMission[] {
    return [...this.active].map((id) => this.missions.get(id)).filter(Boolean) as ResearchMission[];
  }

  getCompletedMissions(): ResearchMission[] {
    return [...this.missions.values()].filter((m) => m.status === "COMPLETED");
  }

  getFailedMissions(): ResearchMission[] {
    return [...this.missions.values()].filter((m) => m.status === "FAILED");
  }

  hasPendingTasks(): boolean {
    return this.queue.length > 0;
  }

  canStartMore(): boolean {
    return this.active.size < this.maxConcurrent && this.queue.length > 0;
  }

  nextTask(): ResearchMission | null {
    if (!this.canStartMore()) return null;
    // Find first task whose dependencies are met
    for (const id of this.queue) {
      const mission = this.missions.get(id);
      if (!mission) continue;
      const depsMet = mission.dependencies.every((depId) => {
        const dep = this.missions.get(depId);
        return dep && dep.status === "COMPLETED";
      });
      if (depsMet) {
        return this.startTask(id);
      }
    }
    return null;
  }

  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max;
  }

  serialize(): ResearchMission[] {
    return [...this.missions.values()];
  }

  loadMissions(missions: ResearchMission[]): void {
    for (const m of missions) {
      this.missions.set(m.id, m);
      if (m.status === "PENDING" || m.status === "PAUSED") {
        this.queue.push(m.id);
      }
    }
    this.prioritizeTasks();
  }
}
