// Persistent-style in-memory bulletin board for agent handoffs and leads.
// Posts are explicitly NOT evidence. They become evidence only after verification.
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

export class BulletinBoard {
  private posts = new Map<string, BulletinPost[]>();
  private handoffs = new Map<string, AgentHandoff[]>();

  post(input: Omit<BulletinPost, "id" | "timestamp" | "verified">): BulletinPost {
    const post: BulletinPost = { ...input, id: `bulletin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now(), verified: false };
    const list = this.posts.get(post.investigationId) ?? [];
    list.push(post); this.posts.set(post.investigationId, list);
    return post;
  }

  search(investigationId: string, query?: string, type?: BulletinType): BulletinPost[] {
    const list = this.posts.get(investigationId) ?? [];
    const q = query?.toLowerCase().trim();
    return list.filter(p => (!type || p.type === type) && (!q || `${p.subject} ${p.message}`.toLowerCase().includes(q))).slice().reverse();
  }

  recent(investigationId: string, limit = 50): BulletinPost[] { return this.search(investigationId).slice(0, limit); }

  handoff(input: Omit<AgentHandoff, "id" | "createdAt" | "status">): AgentHandoff {
    const item: AgentHandoff = { ...input, id: `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now(), status: "QUEUED" };
    const list = this.handoffs.get(item.investigationId) ?? []; list.push(item); this.handoffs.set(item.investigationId, list); return item;
  }

  getHandoffs(investigationId: string): AgentHandoff[] { return (this.handoffs.get(investigationId) ?? []).slice().reverse(); }
}

export const globalBulletinBoard = new BulletinBoard();
