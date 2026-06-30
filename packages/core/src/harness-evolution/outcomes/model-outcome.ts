export type ModelOutcome = "pass" | "fail" | "infra_error" | "cancelled";

export interface ModelOutcomeRecord {
  taskSignature: string;
  modelTarget: string;
  role: "worker" | "supervisor";
  outcome: ModelOutcome;
  failureClass?: string;
  toolFailureCount: number;
  repairRounds: number;
  cost?: number;
  durationMs: number;
  runId?: string;
  createdAt: string;
}

export interface ModelOutcomeAggregate {
  modelTarget: string;
  role: "worker" | "supervisor";
  totalRuns: number;
  passCount: number;
  failCount: number;
  infraErrorCount: number;
  cancelledCount: number;
  passRate: number;
  avgDurationMs: number;
  avgToolFailures: number;
  avgRepairRounds: number;
  avgCost?: number;
}

export function aggregateByModel(records: ModelOutcomeRecord[]): ModelOutcomeAggregate[] {
  const groups = new Map<string, ModelOutcomeRecord[]>();
  for (const r of records) {
    const key = `${r.modelTarget}:${r.role}`;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }

  const results: ModelOutcomeAggregate[] = [];
  for (const [key, group] of groups) {
    const [modelTarget, role] = key.split(":") as [string, "worker" | "supervisor"];
    const totalRuns = group.length;
    const passCount = group.filter(r => r.outcome === "pass").length;
    const failCount = group.filter(r => r.outcome === "fail").length;
    const infraErrorCount = group.filter(r => r.outcome === "infra_error").length;
    const cancelledCount = group.filter(r => r.outcome === "cancelled").length;
    const avgDurationMs = Math.round(group.reduce((s, r) => s + r.durationMs, 0) / totalRuns);
    const avgToolFailures = parseFloat((group.reduce((s, r) => s + r.toolFailureCount, 0) / totalRuns).toFixed(2));
    const avgRepairRounds = parseFloat((group.reduce((s, r) => s + r.repairRounds, 0) / totalRuns).toFixed(2));
    const totalCost = group.reduce((s, r) => s + (r.cost ?? 0), 0);
    const avgCost = totalCost > 0 ? parseFloat((totalCost / totalRuns).toFixed(4)) : undefined;

    results.push({
      modelTarget,
      role,
      totalRuns,
      passCount,
      failCount,
      infraErrorCount,
      cancelledCount,
      passRate: parseFloat((passCount / totalRuns).toFixed(4)),
      avgDurationMs,
      avgToolFailures,
      avgRepairRounds,
      avgCost,
    });
  }

  results.sort((a, b) => b.totalRuns - a.totalRuns);
  return results;
}

export function formatModelReport(aggregates: ModelOutcomeAggregate[]): string {
  if (aggregates.length === 0) return "No model outcome data.";
  const lines = aggregates.map(a => {
    const costStr = a.avgCost !== undefined ? `, avgCost: $${a.avgCost}` : "";
    return `  ${a.modelTarget} (${a.role}): ${a.totalRuns} runs, ${(a.passRate * 100).toFixed(1)}% pass (${a.passCount}/${a.totalRuns}), avg ${a.avgDurationMs}ms, ${a.avgToolFailures} tool failures, ${a.avgRepairRounds} repair rounds${costStr}`;
  });
  return "## Model Outcome Report\n" + lines.join("\n") + "\n";
}
