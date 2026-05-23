export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const safeConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  const pct = Math.round(safeConfidence * 100);
  return (
    <span className="font-mono text-xs text-text-2 bg-surface-2 px-1.5 py-0.5 rounded border border-border">
      {pct}%
    </span>
  );
}
