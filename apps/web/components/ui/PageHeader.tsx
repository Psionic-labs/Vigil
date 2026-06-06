export function PageHeader({
  title, subtitle, count, countLabel = "open", actions,
}: {
  title: string; subtitle?: string; count?: number
  countLabel?: string; actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-text-1 tracking-tight">{title}</h1>
          {count !== undefined && (
            <span className="px-2.5 py-0.5 text-sm font-semibold rounded-full
                             bg-accent-light text-accent">
              {count} {countLabel}
            </span>
          )}
        </div>
        {subtitle && <p className="text-sm text-text-2 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  )
}
