export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 90 ? "text-ok" : pct >= 75 ? "text-p2" : "text-p3"
  return (
    <span className={`font-mono text-xs font-semibold bg-surface-2
                      border border-border px-2 py-0.5 rounded-md ${color}`}>
      {pct}%
    </span>
  )
}
