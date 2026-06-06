"use client"
import { useState } from "react"
import { Search, ArrowUpDown } from "lucide-react"
import { Github } from "@/components/ui/GithubIcon"
import { IssueBadge } from "@/components/ui/IssueBadge"
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge"
import { PageHeader } from "@/components/ui/PageHeader"
import { EmptyState } from "@/components/ui/EmptyState"
import { mockIssues } from "@/lib/mock-data"
import { formatRelativeTime } from "@/lib/utils"
import Link from "next/link"

type Filter = "All" | "P0" | "P1" | "P2" | "P3" | "Linked to GitHub" | "Ignored"
const FILTERS: Filter[] = ["All", "P0", "P1", "P2", "P3", "Linked to GitHub", "Ignored"]

export default function IssuesPage() {
  const [filter, setFilter] = useState<Filter>("All")
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"severity" | "sessions" | "newest">("severity")

  const visible = mockIssues.filter(issue => {
    const q = search.toLowerCase()
    const matchSearch = !q || issue.title.toLowerCase().includes(q) || issue.root_cause.toLowerCase().includes(q)
    const matchFilter =
      filter === "All"               ? true :
      filter === "Linked to GitHub"  ? !!issue.github_issue_url :
      filter === "Ignored"           ? issue.status === "ignored" :
      issue.severity === filter
    return matchSearch && matchFilter
  })

  const sorted = [...visible].sort((a, b) => {
    if (sortBy === "severity") {
      const order = { P0: 0, P1: 1, P2: 2, P3: 3 }
      return order[a.severity] - order[b.severity]
    }
    if (sortBy === "sessions") {
      return b.affected_session_count - a.affected_session_count
    }
    if (sortBy === "newest") {
      return b.last_seen_at - a.last_seen_at
    }
    return 0
  })

  const cycleSort = () => {
    setSortBy(prev => {
      if (prev === "severity") return "sessions"
      if (prev === "sessions") return "newest"
      return "severity"
    })
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader title="Issues" count={mockIssues.filter(i => i.status === "open").length} />

      {/* Controls row */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search issues..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-border rounded-xl
                       text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-2
                       focus:ring-accent/30 focus:border-accent transition-all"
          />
        </div>
        <button onClick={cycleSort} className="ml-auto flex items-center gap-2 px-3.5 py-2 text-sm text-text-2
                           bg-surface border border-border rounded-xl hover:border-accent/40 transition-all cursor-pointer">
          <ArrowUpDown className="w-3.5 h-3.5" />
          Sort: {sortBy === "severity" ? "Severity" : sortBy === "sessions" ? "Sessions" : "Newest"}
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
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

      {/* Issue rows */}
      {sorted.length === 0 ? (
        <EmptyState icon={Search} title="No issues found" description="Try adjusting your search or filter criteria." />
      ) : (
        <div className="space-y-2">
          {sorted.map((issue, i) => (
            <Link
              key={issue.id}
              href={`/issues/${issue.id}`}
              className="animate-fade-up flex items-center gap-4 bg-surface border border-border
                         rounded-2xl px-5 py-4 hover:shadow-md hover:border-accent/30
                         transition-all group block"
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <IssueBadge severity={issue.severity} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-1 truncate group-hover:text-accent transition-colors">
                  {issue.title}
                </p>
                <p className="text-xs text-text-3 mt-0.5 truncate">{issue.root_cause}</p>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-text-1">{issue.affected_session_count}</p>
                  <p className="text-xs text-text-3 leading-none">sessions</p>
                </div>
                <ConfidenceBadge value={issue.confidence} />
                <span className="text-xs text-text-3 w-14 text-right">
                  {formatRelativeTime(issue.last_seen_at)}
                </span>
                {issue.github_issue_url ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-green-700
                                   bg-green-50 border border-green-200 px-2 py-0.5 rounded-full shrink-0">
                    <Github className="w-3 h-3" />
                    #{issue.github_issue_number}
                  </span>
                ) : (
                  <span className="w-[72px] shrink-0" />
                )}
                {issue.github_auto_raised && (
                  <span className="text-xs font-medium bg-amber-50 text-amber-700
                                   border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                    auto
                  </span>
                )}
                {issue.status === "ignored" && (
                  <span className="text-xs font-medium bg-surface-2 text-text-3
                                   border border-border px-2 py-0.5 rounded-full shrink-0">
                    ignored
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
