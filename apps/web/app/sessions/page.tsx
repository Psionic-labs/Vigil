"use client"
import { useState } from "react"
import { Search, ArrowRight, ArrowUpDown } from "lucide-react"
import { FrictionBar } from "@/components/ui/FrictionBar"
import { SignalIcons } from "@/components/ui/SignalIcons"
import { EnvironmentChip } from "@/components/ui/EnvironmentChip"
import { PageHeader } from "@/components/ui/PageHeader"
import { EmptyState } from "@/components/ui/EmptyState"
import { mockSessions } from "@/lib/mock-data"
import { formatDuration, formatRelativeTime } from "@/lib/utils"
import Link from "next/link"

type Filter = "All" | "Has Issues" | "Goal Failed" | "Has JS Error" | "Has Rage Click" | "Production only"
const FILTERS: Filter[] = ["All", "Has Issues", "Goal Failed", "Has JS Error", "Has Rage Click", "Production only"]

export default function SessionsPage() {
  const [filter, setFilter] = useState<Filter>("All")
  const [search, setSearch] = useState("")

  const visible = mockSessions.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || s.id.toLowerCase().includes(q) || s.url.toLowerCase().includes(q)
    const matchFilter =
      filter === "All"              ? true :
      filter === "Has Issues"       ? s.issue_instance_count > 0 :
      filter === "Goal Failed"      ? !s.ai_goal_completed :
      filter === "Has JS Error"     ? s.has_js_error :
      filter === "Has Rage Click"   ? s.has_rage_click :
      filter === "Production only"  ? s.environment === "production" :
      true
    return matchSearch && matchFilter
  })

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader title="Sessions" count={mockSessions.length} countLabel="total" />

      <div className="flex items-center gap-3 mb-5">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-border rounded-xl
                       text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-2
                       focus:ring-accent/30 focus:border-accent transition-all"
          />
        </div>
        <button className="ml-auto flex items-center gap-2 px-3.5 py-2 text-sm text-text-2
                           bg-surface border border-border rounded-xl hover:border-accent/40 transition-all cursor-pointer">
          <ArrowUpDown className="w-3.5 h-3.5" />
          Sort: Date
        </button>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all cursor-pointer
              ${filter === f
                ? "bg-accent text-white border-accent shadow-sm"
                : "bg-surface text-text-2 border-border hover:border-accent/40 hover:text-accent"}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[148px_1fr_180px_110px_60px_80px_100px_90px_90px_36px]
                      gap-3 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider
                      text-text-3 mb-1.5 border-b border-border">
        <span>Session</span>
        <span>URL</span>
        <span>Friction</span>
        <span>Goal</span>
        <span>Issues</span>
        <span>Signals</span>
        <span>Duration</span>
        <span>Env</span>
        <span>Started</span>
        <span />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Search} title="No sessions found" description="Try adjusting your search or filter." />
      ) : (
        <div className="space-y-1.5">
          {visible.map((session, i) => (
            <Link
              key={session.id}
              href={`/sessions/${session.id}`}
              className="animate-fade-up grid grid-cols-[148px_1fr_180px_110px_60px_80px_100px_90px_90px_36px]
                         gap-3 items-center bg-surface border border-border rounded-2xl px-5 py-3.5
                         hover:shadow-md hover:border-accent/30 transition-all group"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <span className="font-mono text-xs text-text-3 truncate">{session.id}</span>
              <span className="text-sm text-text-2 truncate group-hover:text-accent transition-colors">
                {session.url}
              </span>
              <FrictionBar score={session.ai_friction_score} />
              <span className={`text-xs font-medium flex items-center gap-1
                ${session.ai_goal_completed ? "text-ok" : "text-p0"}`}>
                {session.ai_goal_completed ? "✓ Goal Met" : "✕ Failed"}
              </span>
              <span className={`text-xs font-mono font-bold text-center
                ${session.issue_instance_count > 0 ? "text-p0" : "text-text-3"}`}>
                {session.issue_instance_count > 0 ? session.issue_instance_count : "—"}
              </span>
              <SignalIcons signals={session} />
              <span className="font-mono text-xs text-text-3">{formatDuration(session.duration_ms)}</span>
              <EnvironmentChip env={session.environment} />
              <span className="text-xs text-text-3 truncate">{formatRelativeTime(session.started_at)}</span>
              <ArrowRight className="w-4 h-4 text-text-3 group-hover:text-accent transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
