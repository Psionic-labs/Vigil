export function EnvironmentChip({ env }: { env: string | null }) {
  if (!env) return null
  const s: Record<string, string> = {
    production:  "bg-green-50  text-green-700  border-green-200",
    preview:     "bg-amber-50  text-amber-700  border-amber-200",
    development: "bg-slate-100 text-slate-600  border-slate-200",
  }
  return (
    <span className={`text-xs font-bold uppercase tracking-wide
                      px-2 py-0.5 rounded border ${s[env] ?? s.development}`}>
      {env === "production" ? "PROD" : env.toUpperCase()}
    </span>
  )
}
