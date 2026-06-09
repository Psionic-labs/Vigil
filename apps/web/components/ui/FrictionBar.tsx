/**
 * @file FrictionBar.tsx
 * @description Bar component summarizing user friction points like dead/rage clicks.
 * @why Graphically represents friction index indicators.
 */

export function FrictionBar({ score, className = "" }: { score: number; className?: string }) {
  const bar  = score >= 80 ? "bg-p0" : score >= 60 ? "bg-p1" : score >= 30 ? "bg-p2" : "bg-ok"
  const text = score >= 80 ? "text-p0" : score >= 60 ? "text-p1" : score >= 30 ? "text-p2" : "text-ok"
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden min-w-[56px]">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold w-6 shrink-0 text-right ${text}`}>{score}</span>
    </div>
  )
}
