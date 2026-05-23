import type { Severity } from "@/lib/types";

const config: Record<Severity, { bg: string; text: string; border: string; label: string }> = {
  P0: { bg: "bg-p0/10", text: "text-p0", border: "border-p0/30", label: "P0" },
  P1: { bg: "bg-p1/10", text: "text-p1", border: "border-p1/30", label: "P1" },
  P2: { bg: "bg-p2/10", text: "text-p2", border: "border-p2/30", label: "P2" },
  P3: { bg: "bg-p3/10", text: "text-p3", border: "border-p3/30", label: "P3" },
};

export function IssueBadge({ severity }: { severity: Severity }) {
  const c = config[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold font-mono border ${c.bg} ${c.text} ${c.border} ${severity === "P0" ? "badge-p0" : ""}`}
    >
      {severity === "P0" && (
        <span className="w-1.5 h-1.5 rounded-full bg-p0 animate-pulse" />
      )}
      {c.label}
    </span>
  );
}
