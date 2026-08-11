// ─── COST TRACKER ────────────────────────────────────────────────────────
// Tracks every AI call's cost. Enforces investigation budgets.

import type { TokenUsage, AIResponse } from "../providers/types.js";
import type { ModelDefinition } from "../providers/registry.js";

export interface CostRecord {
  id: string;
  provider: string;
  model: string;
  agentRole: string;
  taskLabel: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  durationMs: number;
  timestamp: number;
  simulated: boolean;
}

export class CostTracker {
  private records: CostRecord[] = [];
  private budgetUSD: number;
  private spentUSD = 0;

  constructor(budgetUSD: number = 10) {
    this.budgetUSD = budgetUSD;
  }

  record(
    response: AIResponse,
    model: ModelDefinition,
    agentRole: string,
    taskLabel: string
  ): CostRecord {
    // Compute cost from registry rates if provider didn't provide it
    let cost = response.usage.costUSD;
    if (cost === 0 && !response.simulated) {
      const inCost = (model.inputCostPer1K ?? 0) * response.usage.inputTokens / 1000;
      const outCost = (model.outputCostPer1K ?? 0) * response.usage.outputTokens / 1000;
      cost = inCost + outCost;
    }

    const record: CostRecord = {
      id: `cost-${this.records.length + 1}`,
      provider: response.provider,
      model: response.model,
      agentRole,
      taskLabel,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      costUSD: cost,
      durationMs: response.durationMs,
      timestamp: Date.now(),
      simulated: response.simulated,
    };

    this.records.push(record);
    this.spentUSD += cost;
    return record;
  }

  getSpent(): number {
    return this.spentUSD;
  }

  getRemaining(): number {
    return this.budgetUSD - this.spentUSD;
  }

  getBudget(): number {
    return this.budgetUSD;
  }

  setBudget(budget: number): void {
    this.budgetUSD = budget;
  }

  isBudgetExceeded(): boolean {
    return this.spentUSD >= this.budgetUSD;
  }

  isBudgetWarning(): boolean {
    return this.spentUSD >= this.budgetUSD * 0.8;
  }

  getRecords(): CostRecord[] {
    return [...this.records];
  }

  getSummary(): { budget: number; spent: number; remaining: number; calls: number; records: CostRecord[] } {
    return {
      budget: this.budgetUSD,
      spent: this.spentUSD,
      remaining: this.getRemaining(),
      calls: this.records.length,
      records: this.getRecords(),
    };
  }
}
