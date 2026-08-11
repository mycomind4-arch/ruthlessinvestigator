// ─── CAPABILITY EVENT STREAM (Directive 06, Step 34) ─────────────────────
// Every capability operation generates events for full observability.

export type CapabilityEvent =
  | "capability_gap_detected"
  | "capability_search_started"
  | "capability_candidate_found"
  | "repository_candidate_found"
  | "dataset_candidate_found"
  | "source_candidate_found"
  | "capability_evaluated"
  | "security_assessment_created"
  | "license_assessment_created"
  | "capability_rejected"
  | "capability_sandbox_started"
  | "capability_sandbox_completed"
  | "capability_benchmark_started"
  | "capability_benchmark_completed"
  | "capability_promoted"
  | "capability_suspended"
  | "capability_deprecated"
  | "skill_proposed"
  | "skill_composed"
  | "skill_specialized"
  | "skill_improved"
  | "skill_failed"
  | "capability_bundle_created"
  | "investigation_learning_recorded"
  | "cross_domain_transfer_proposed"
  | "capability_cached";

export interface CapabilityEventRecord {
  id: string;
  eventType: CapabilityEvent;
  capabilityId?: string;
  investigationId?: string;
  message: string;
  details?: unknown;
  timestamp: number;
}

export class CapabilityEventStream {
  private events: CapabilityEventRecord[] = [];
  private listeners: Array<(event: CapabilityEventRecord) => void> = [];

  emit(
    eventType: CapabilityEvent,
    message: string,
    options?: { capabilityId?: string; investigationId?: string; details?: unknown },
  ): CapabilityEventRecord {
    const record: CapabilityEventRecord = {
      id: `cap-event-${this.events.length + 1}`,
      eventType,
      message,
      capabilityId: options?.capabilityId,
      investigationId: options?.investigationId,
      details: options?.details,
      timestamp: Date.now(),
    };
    this.events.push(record);
    for (const listener of this.listeners) {
      listener(record);
    }
    return record;
  }

  subscribe(listener: (event: CapabilityEventRecord) => void): void {
    this.listeners.push(listener);
  }

  getEvents(filter?: { eventType?: CapabilityEvent; investigationId?: string; capabilityId?: string }): CapabilityEventRecord[] {
    let result = [...this.events];
    if (filter?.eventType) result = result.filter(e => e.eventType === filter.eventType);
    if (filter?.investigationId) result = result.filter(e => e.investigationId === filter.investigationId);
    if (filter?.capabilityId) result = result.filter(e => e.capabilityId === filter.capabilityId);
    return result;
  }

  getEventsForInvestigation(investigationId: string): CapabilityEventRecord[] {
    return this.events.filter(e => e.investigationId === investigationId);
  }

  getAllEvents(): CapabilityEventRecord[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}
