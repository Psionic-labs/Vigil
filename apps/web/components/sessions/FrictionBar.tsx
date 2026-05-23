import { frictionColor } from "@/lib/utils";

export function FrictionBar({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const color = frictionColor(clampedScore);
  const label = clampedScore >= 80 ? "Critical" : clampedScore >= 60 ? "High" : clampedScore >= 30 ? "Medium" : "Low";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${clampedScore}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-xs w-6 text-right" style={{ color }}>{clampedScore}</span>
      <span className="text-text-3 text-xs hidden xl:block">{label}</span>
    </div>
  );
}
