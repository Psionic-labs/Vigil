/**
 * @file page.tsx
 * @description Renders the list of tracked issue groups.
 * @why Allows users to view and filter all active issues.
 */

"use client"
import { useState, useEffect, useRef } from "react"
import { Search, ArrowUpDown, ChevronDown, AlertTriangle } from "lucide-react"
import { Github } from "@/components/ui/GithubIcon"
import { IssueBadge } from "@/components/ui/IssueBadge"
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge"
import { PageHeader } from "@/components/ui/PageHeader"
import { EmptyState } from "@/components/ui/EmptyState"
import { SkeletonRow } from "@/components/ui/SkeletonRow"

import { formatRelativeTime, apiFetch } from "@/lib/utils"
import Link from "next/link"
import { useProjects } from "@/lib/projects-context"
import { IssueGroup } from "@/lib/mock-data"

type Filter = "All" | "P0" | "P1" | "P2" | "P3" | "Linked to GitHub" | "Ignored"
const FILTERS: Filter[] = ["All", "P0", "P1", "P2", "P3", "Linked to GitHub", "Ignored"]

export default function IssuesPage() {
  const { activeProject } = useProjects()
  const [issues, setIssues] = useState<IssueGroup[]>([])
  const [isDataLoading, setIsDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [filter, setFilter] = useState<Filter>("All")
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"severity" | "sessions" | "newest">("severity")
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false)
  const sortDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (!activeProject) {
      setIssues([])
      setError(null)
      setIsDataLoading(false)
      return
    }

    setIsDataLoading(true)
    setError(null)
    const controller = new AbortController()
    apiFetch(`/api/v1/issues?projectId=${activeProject.id}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch issues from API")
        return res.json()
      })
      .then((json) => {
        setIssues(json.data || [])
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to load issues:", err)
          setError(err.message || "Failed to load issues. Please check your backend connection.")
        }
      })
      .finally(() => {
        setIsDataLoading(false)
      })

    return () => controller.abort()
  }, [activeProject, refreshKey])

  if (isDataLoading) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto animate-fade-up">
        <PageHeader title="Issues" count={0} />
        {/* Controls row placeholder */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 bg-surface border border-border rounded-xl w-64 animate-pulse" />
          <div className="ml-auto h-10 bg-surface border border-border rounded-xl w-36 animate-pulse" />
        </div>
        {/* Filter chips placeholder */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-7 bg-surface border border-border rounded-full w-16 animate-pulse" />
          ))}
        </div>
        {/* Skeleton list */}
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (!activeProject) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto flex items-center justify-center min-h-[50vh]">
        <p className="text-text-3 font-mono text-sm">Please select or create a project to view issues.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto animate-fade-up">
        <PageHeader title="Issues" count={0} />
        <div className="mt-8 flex flex-col items-center justify-center p-8 bg-p0/10 border border-p0/20 rounded-2xl text-center max-w-xl mx-auto shadow-sm">
          <AlertTriangle className="w-10 h-10 text-p0 mb-3" />
          <h3 className="text-sm font-semibold text-text-1 mb-1">Failed to Load Issues</h3>
          <p className="text-xs text-text-2 mb-6 max-w-sm">
            {error}
          </p>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="px-4 py-2 bg-p0 text-white font-medium text-xs rounded-xl hover:bg-p0/80 transition-colors shadow-sm cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }



  const visible = issues.filter(issue => {
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
      const order: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
      return (order[a.severity] ?? 99) - (order[b.severity] ?? 99)
    }
    if (sortBy === "sessions") {
      return b.affected_session_count - a.affected_session_count
    }
    if (sortBy === "newest") {
      return b.last_seen_at - a.last_seen_at
    }
    return 0
  })

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader title="Issues" count={issues.filter(i => i.status === "open" || i.status === "linked").length} />

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
        <div className="ml-auto relative" ref={sortDropdownRef}>
          <button
            onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
            className="flex items-center gap-2 px-3.5 py-2 text-sm text-text-2
                       bg-surface border border-border rounded-xl hover:border-accent/40
                       transition-all cursor-pointer select-none"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-text-3" />
            <span>Sort: {sortBy === "severity" ? "Severity" : sortBy === "sessions" ? "Sessions" : "Newest"}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-text-3 transition-transform duration-200 ${isSortDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          
          {isSortDropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 py-1 bg-surface border border-border rounded-xl shadow-xl z-50 min-w-[140px] overflow-hidden animate-fade-up">
              <button
                onClick={() => {
                  setSortBy("severity")
                  setIsSortDropdownOpen(false)
                }}
                className={`w-full text-left px-3.5 py-2 text-sm transition-colors cursor-pointer ${
                  sortBy === "severity" ? "bg-accent/10 text-accent font-medium" : "text-text-2 hover:bg-surface-2 hover:text-text-1"
                }`}
              >
                Severity
              </button>
              <button
                onClick={() => {
                  setSortBy("sessions")
                  setIsSortDropdownOpen(false)
                }}
                className={`w-full text-left px-3.5 py-2 text-sm transition-colors cursor-pointer ${
                  sortBy === "sessions" ? "bg-accent/10 text-accent font-medium" : "text-text-2 hover:bg-surface-2 hover:text-text-1"
                }`}
              >
                Sessions
              </button>
              <button
                onClick={() => {
                  setSortBy("newest")
                  setIsSortDropdownOpen(false)
                }}
                className={`w-full text-left px-3.5 py-2 text-sm transition-colors cursor-pointer ${
                  sortBy === "newest" ? "bg-accent/10 text-accent font-medium" : "text-text-2 hover:bg-surface-2 hover:text-text-1"
                }`}
              >
                Newest
              </button>
            </div>
          )}
        </div>
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

      {sorted.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No issues found"
          description={search || filter !== "All"
            ? "Try adjusting your search or filter criteria."
            : "No issues have been reported for this project yet."}
        />
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
