// ─── EVENT EMITTER ──────────────────────────────────────────────────────
// Every meaningful operation produces an InvestigationEvent.
// Events are persisted and streamed to the frontend via SSE.

import { EventEmitter } from "events";
import type { InvestigationEvent, EventType } from "./types.js";

let idCounter = 0;

export class InvestigationEventEmitter extends EventEmitter {
  private events: Map<string, InvestigationEvent[]> = new Map();

  recordEvent(
    investigationId: string,
    type: EventType,
    message: string,
    details?: unknown,
    agentRole?: string,
    modelId?: string
  ): InvestigationEvent {
    const event: InvestigationEvent = {
      id: `evt-${Date.now()}-${++idCounter}`,
      investigationId,
      type,
      message,
      details,
      agentRole,
      modelId,
      timestamp: Date.now(),
    };

    // Persist
    const existing = this.events.get(investigationId) ?? [];
    existing.push(event);
    this.events.set(investigationId, existing);

    // Stream to subscribers
    this.emitEvent("event", event);
    return event;
  }

  private emitEvent(event: string, data: InvestigationEvent) {
    super.emit(event, data);
    super.emit(`event:${data.investigationId}`, data);
  }

  getEvents(investigationId: string): InvestigationEvent[] {
    return [...(this.events.get(investigationId) ?? [])];
  }

  subscribe(investigationId: string, callback: (event: InvestigationEvent) => void): () => void {
    const handler = (event: InvestigationEvent) => {
      if (event.investigationId === investigationId) {
        callback(event);
      }
    };
    this.on(`event:${investigationId}`, handler);
    return () => this.off(`event:${investigationId}`, handler);
  }

  subscribeAll(callback: (event: InvestigationEvent) => void): () => void {
    this.on("event", callback);
    return () => this.off("event", callback);
  }

  clear(investigationId: string): void {
    this.events.delete(investigationId);
  }
}

export const globalEventEmitter = new InvestigationEventEmitter();
