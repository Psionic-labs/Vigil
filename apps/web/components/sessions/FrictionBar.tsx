import { frictionColor } from "@/lib/utils";

export function FrictionBar({ score }: { score: number }) {
  const color = frictionColor(score);
  const label = score >= 80 ? "Critical" : score >= 60 ? "High" : score >= 30 ? "Medium" : "Low";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-xs w-6 text-right" style={{ color }}>{score}</span>
      <span className="text-text-3 text-xs hidden xl:block">{label}</span>
    </div>
  );
}
