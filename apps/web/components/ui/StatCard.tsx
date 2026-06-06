import type { LucideIcon } from "lucide-react"

interface Props {
  label: string; value: string | number; subtext?: string
  trend?: { label: string; positive: boolean }
  icon: LucideIcon
  leftBorderClass: string   // e.g. "border-l-p0"
  iconBg: string            // e.g. "bg-p0-bg"
  iconColor: string         // e.g. "text-p0"
}

export function StatCard({ label, value, subtext, trend, icon: Icon, leftBorderClass, iconBg, iconColor }: Props) {
  return (
    <div className={`bg-surface rounded-2xl border border-border p-5
                     border-l-[3px] ${leftBorderClass}
                     shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-3">{label}</p>
          <p className="text-3xl font-bold text-text-1 mt-1.5 leading-none tracking-tight">{value}</p>
          {subtext && <p className="text-xs text-text-3 mt-1">{subtext}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold
                            px-2 py-0.5 rounded-full
                            ${trend.positive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
            {trend.positive ? "↑" : "↓"} {trend.label}
          </span>
          <span className="text-xs text-text-3">vs last week</span>
        </div>
      )}
    </div>
  )
}
