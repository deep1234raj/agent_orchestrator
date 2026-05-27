interface CostCounterProps {
  totalCostUsd: number;
  totalTokens: number;
  liveCostDelta: number;
  liveTokensDelta: number;
}

export function CostCounter({
  totalCostUsd,
  totalTokens,
  liveCostDelta,
  liveTokensDelta,
}: CostCounterProps) {
  const displayCost = totalCostUsd + liveCostDelta;
  const displayTokens = totalTokens + liveTokensDelta;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface/40 p-4">
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
        Usage
      </h3>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-2xl text-fg">
          ${displayCost.toFixed(4)}
        </span>
        <span className="text-xs text-fg-muted">USD</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-lg text-fg-muted">
          {displayTokens.toLocaleString()}
        </span>
        <span className="text-xs text-fg-subtle">tokens</span>
      </div>
    </div>
  );
}
