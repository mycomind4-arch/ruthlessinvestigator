import { promises as fs } from "node:fs";
import * as path from "node:path";

// Shared agent bulletin board. Posts are coordination metadata, NOT evidence.
// They become evidence only after an explicit verification step.
export type BulletinType = "DISCOVERY" | "WARNING" | "QUESTION" | "LEAD" | "CONTRADICTION" | "SOURCE" | "EVIDENCE" | "TASK_REQUEST" | "TASK_RESULT" | "ENTITY" | "RELATIONSHIP" | "METHODOLOGY" | "SKILL_DISCOVERY" | "SKILL_FAILURE" | "STATUS";
export type BulletinImportance = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface BulletinPost {
  id: string;
  investigationId: string;
  authorAgent: string;
  timestamp: number;
  type: BulletinType;
  subject: string;
  message: string;
  relatedClaims: string[];
  relatedEvidence: string[];
  relatedSources: string[];
  relatedHypotheses: string[];
  relatedTasks: string[];
  importance: BulletinImportance;
  confidence?: number;
  verified: false;
}

export interface AgentHandoff {
  id: string;
  investigationId: string;
  fromAgent: string;
  toAgent: string;
  task: string;
  reason: string;
  evidence: string[];
  sourceReferences: string[];
  constraints: string[];
  expectedResult: string;
  createdAt: number;
  status: "QUEUED" | "ACCEPTED" | "COMPLETED" | "FAILED";
}

interface BulletinStore { posts: BulletinPost[]; handoffs: AgentHandoff[]; }

const DATA_DIR = process.env.INVESTIGATION_DATA_DIR ?? path.join(process.cwd(), "investigation-data");
const STORE_PATH = path.join(DATA_DIR, "bulletin-board.json");

export class BulletinBoard {
  private posts = new Map<string, BulletinPost[]>();
  private handoffs = new Map<string, AgentHandoff[]>();
  private writeChain: Promise<void> = Promise.resolve();

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(STORE_PATH, "utf8");
      const data = JSON.parse(raw) as BulletinStore;
      this.posts.clear(); this.handoffs.clear();
      for (const post of data.posts ?? []) this.addPostToMap(post);
      for (const handoff of data.handoffs ?? []) this.addHandoffToMap(handoff);
    } catch {
      // First run or missing store is normal.
    }
  }

  private addPostToMap(post: BulletinPost): void {
    const list = this.posts.get(post.investigationId) ?? [];
    list.push(post); this.posts.set(post.investigationId, list);
  }

  private addHandoffToMap(handoff: AgentHandoff): void {
    const list = this.handoffs.get(handoff.investigationId) ?? [];
    list.push(handoff); this.handoffs.set(handoff.investigationId, list);
  }

  private persistSoon(): void {
    const store: BulletinStore = {
      posts: [...this.posts.values()].flat(),
      handoffs: [...this.handoffs.values()].flat(),
    };
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${STORE_PATH}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
      await fs.rename(tmp, STORE_PATH);
    }).catch(() => undefined);
  }

  post(input: Omit<BulletinPost, "id" | "timestamp" | "verified">): BulletinPost {
    const post: BulletinPost = { ...input, id: `bulletin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now(), verified: false };
    this.addPostToMap(post); this.persistSoon(); return post;
  }

  search(investigationId: string, query?: string, type?: BulletinType): BulletinPost[] {
    const list = this.posts.get(investigationId) ?? [];
    const q = query?.toLowerCase().trim();
    return list.filter(p => (!type || p.type === type) && (!q || `${p.subject} ${p.message}`.toLowerCase().includes(q))).slice().reverse();
  }

  recent(investigationId: string, limit = 50): BulletinPost[] { return this.search(investigationId).slice(0, limit); }

  handoff(input: Omit<AgentHandoff, "id" | "createdAt" | "status">): AgentHandoff {
    const item: AgentHandoff = { ...input, id: `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now(), status: "QUEUED" };
    this.addHandoffToMap(item); this.persistSoon(); return item;
  }

  updateHandoff(investigationId: string, handoffId: string, status: AgentHandoff["status"]): AgentHandoff | null {
    const item = (this.handoffs.get(investigationId) ?? []).find(h => h.id === handoffId);
    if (!item) return null;
    item.status = status; this.persistSoon(); return item;
  }

  getHandoffs(investigationId: string): AgentHandoff[] { return (this.handoffs.get(investigationId) ?? []).slice().reverse(); }
}

export const globalBulletinBoard = new BulletinBoard();
