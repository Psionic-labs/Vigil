/**
 * @file page.tsx
 * @description Main landing dashboard of the Vigil web app.
 * @why Prompts project selection or gives a summary overview of tracked metrics.
 */

"use client"
import { useState, useEffect } from "react"
import { AlertTriangle, Activity, Monitor, CheckCircle, ArrowRight, FolderPlus, Code2 } from "lucide-react"
import { StatCard } from "@/components/ui/StatCard"
import { IssueBadge } from "@/components/ui/IssueBadge"
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge"
import { FrictionBar } from "@/components/ui/FrictionBar"
import { PageHeader } from "@/components/ui/PageHeader"
import { EnvironmentChip } from "@/components/ui/EnvironmentChip"
import { CodeBlock } from "@/components/ui/CodeBlock"
import { formatRelativeTime, formatDuration, apiFetch } from "@/lib/utils"
import Link from "next/link"
import { useProjects } from "@/lib/projects-context"
import { CreateProjectModal } from "@/components/projects/CreateProjectModal"
import { IssueGroup, Session } from "@/lib/mock-data"

const severityBreakdown = [
  { label: "Critical", key: "P0", borderClass: "border-t-p0",  dotClass: "bg-p0",  textClass: "text-p0"  },
  { label: "High",     key: "P1", borderClass: "border-t-p1",  dotClass: "bg-p1",  textClass: "text-p1"  },
  { label: "Medium",   key: "P2", borderClass: "border-t-p2",  dotClass: "bg-p2",  textClass: "text-p2"  },
  { label: "Low",      key: "P3", borderClass: "border-t-p3",  dotClass: "bg-p3",  textClass: "text-p3"  },
]

export default function OverviewPage() {
  const { projects, isLoading, activeProject, createProject } = useProjects()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [issues, setIssues] = useState<IssueGroup[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [isDataLoading, setIsDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!activeProject) {
      setIssues([])
      setSessions([])
      setError(null)
      setIsDataLoading(false)
      return
    }

    setIsDataLoading(true)
    setError(null)
    const controller = new AbortController()
    Promise.all([
      apiFetch(`/api/v1/issues?projectId=${activeProject.id}`, { signal: controller.signal }).then((res) => { if (!res.ok) throw new Error("Failed to fetch issues"); return res.json() }),
      apiFetch(`/api/v1/sessions?projectId=${activeProject.id}`, { signal: controller.signal }).then((res) => { if (!res.ok) throw new Error("Failed to fetch sessions"); return res.json() })
    ])
      .then(([issuesRes, sessionsRes]) => {
        setIssues(issuesRes.data || [])
        setSessions(sessionsRes.data || [])
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch dashboard overview data:", err)
          setError(err.message || "Failed to load dashboard data. Please check your backend connection.")
        }
      })
      .finally(() => {
        setIsDataLoading(false)
      })

    return () => controller.abort()
  }, [activeProject, refreshKey])

  if (isLoading) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto flex items-center justify-center min-h-[50vh]">
        <p className="text-text-3 font-mono text-sm animate-pulse">Loading dashboard...</p>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto flex flex-col items-center justify-center min-h-[70vh]">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-6 shadow-sm">
          <FolderPlus className="w-8 h-8 text-accent" />
        </div>
        <h1 className="text-2xl font-bold text-text-1 mb-2">Welcome to Vigil</h1>
        <p className="text-text-2 text-center max-w-md mb-8">
          Get started by creating your first project. Once created, you&apos;ll be able to install the SDK and start tracking AI bug triage.
        </p>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-6 py-3 bg-accent hover:bg-accent-light text-white font-medium rounded-xl transition-colors shadow-sm"
        >
          Create Your First Project
        </button>

        <CreateProjectModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onSubmit={createProject} 
        />
      </div>
    )
  }

  if (isDataLoading) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto animate-pulse">
        {/* Header skeleton */}
        <div className="h-7 bg-surface-2 rounded w-1/4 mb-2" />
        <div className="h-4 bg-surface-2 rounded w-1/3 mb-7" />

        {/* Stat cards skeleton */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-7">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-surface border border-border rounded-2xl p-5" />
          ))}
        </div>

        {/* Main grid skeleton */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <div className="xl:col-span-2 space-y-5">
            <div className="bg-surface border border-border rounded-2xl p-5 h-60" />
            <div className="bg-surface border border-border rounded-2xl p-5 h-40" />
          </div>
          <div className="xl:col-span-3 space-y-5">
            <div className="bg-surface border border-border rounded-2xl p-5 h-72" />
            <div className="bg-surface border border-border rounded-2xl p-5 h-60" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto animate-fade-up">
        <PageHeader title="Overview Dashboard" />
        <div className="mt-8 flex flex-col items-center justify-center p-8 bg-red-50 border border-red-200 rounded-2xl text-center max-w-xl mx-auto shadow-sm">
          <AlertTriangle className="w-10 h-10 text-p0 mb-3" />
          <h3 className="text-sm font-semibold text-text-1 mb-1">Failed to Load Dashboard Data</h3>
          <p className="text-xs text-text-2 mb-6 max-w-sm">
            {error}
          </p>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="px-4 py-2 bg-p0 text-white font-medium text-xs rounded-xl hover:bg-red-700 transition-colors shadow-sm cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  if (!activeProject) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto flex items-center justify-center min-h-[50vh]">
        <p className="text-text-3 font-mono text-sm">Please select or create a project to view the dashboard.</p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto animate-fade-up">
        <PageHeader
          title="Overview Dashboard"
          subtitle="Here's a summary of your app's health and recent AI triage results."
        />
        
        <div className="mt-8 flex flex-col items-center justify-center p-8 bg-surface border border-border rounded-2xl text-center max-w-2xl mx-auto shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-accent-light flex items-center justify-center text-accent mb-4 shadow-sm">
            <Code2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-text-1 mb-2">Awaiting SDK Integration</h3>
          <p className="text-xs text-text-2 mb-6 max-w-md">
            No session telemetry has been received for **{activeProject.name}** yet. Follow the guide below to integrate the Vigil SDK and start tracking user sessions.
          </p>
          
          <div className="w-full text-left mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">Quick Integration</p>
            <CodeBlock
              label="html"
              code={`<script src="https://cdn.usevigilhq.com/sdk/v1/vigil.min.js"></script>\n<script>\n  Vigil.init({ projectKey: "${activeProject.publicKey}" });\n</script>`}
            />
          </div>

          <Link
            href="/setup"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-accent hover:bg-accent-light text-white text-xs font-medium rounded-xl transition-colors shadow-sm"
          >
            View Complete Setup Guide <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    )
  }

  const openIssuesCount = issues.filter(i => i.status === "open").length
  const avgFrictionScore = sessions.length > 0 ? Math.round(sessions.reduce((sum, s) => sum + s.ai_friction_score, 0) / sessions.length) : 0
  const totalSessionsCount = sessions.length
  const completedGoalsCount = sessions.filter(s => s.ai_goal_completed).length
  const goalCompletionRate = sessions.length > 0 ? Math.round((completedGoalsCount / sessions.length) * 100) : 0

  const recentIssues = issues.filter(i => i.status !== "ignored").slice(0, 4)
  const highFrictionSessions = [...sessions]
    .sort((a, b) => b.ai_friction_score - a.ai_friction_score)
    .slice(0, 3)

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="Overview Dashboard"
        subtitle="Here's a summary of your app's health and recent AI triage results."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-7">
        <StatCard label="Open Issues"       value={openIssuesCount}    trend={{ label: "+3 this week", positive: false }}  subtext="vs last week"          icon={AlertTriangle} leftBorderClass="border-l-p0"     iconBg="bg-p0-bg"        iconColor="text-p0"     />
        <StatCard label="Avg Friction Score" value={avgFrictionScore}   trend={{ label: "+4 points",    positive: false }}  subtext="since latest release"  icon={Activity}      leftBorderClass="border-l-p1"     iconBg="bg-p1-bg"        iconColor="text-p1"     />
        <StatCard label="Total Sessions"    value={totalSessionsCount}                                                     subtext="Last 24 hours"         icon={Monitor}       leftBorderClass="border-l-accent"  iconBg="bg-accent-light" iconColor="text-accent" />
        <StatCard label="Goal Completion"   value={`${goalCompletionRate}%`}  trend={{ label: "+12% this week", positive: true }} subtext="vs last week"          icon={CheckCircle}   leftBorderClass="border-l-ok"     iconBg="bg-ok-bg"        iconColor="text-ok"     />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Left panel */}
        <div className="xl:col-span-2 space-y-5">

          {/* Severity breakdown */}
          <div className="bg-surface rounded-2xl border border-border p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-text-1 mb-4">Severity Breakdown</h2>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {severityBreakdown.map(({ label, key, borderClass, dotClass, textClass }) => {
                const count = issues.filter(i => i.severity === key && i.status !== "ignored").length
                return (
                  <div key={key} className={`bg-surface-2 rounded-xl border border-border border-t-[3px] ${borderClass} p-3.5 text-center`}>
                    <p className={`text-2xl font-bold ${textClass}`}>{count}</p>
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                      <span className="text-xs text-text-2">{label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="space-y-2.5">
              {severityBreakdown.map(({ label, key, dotClass }) => {
                const count = issues.filter(i => i.severity === key && i.status !== "ignored").length
                const total = issues.filter(i => i.status !== "ignored").length
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 w-24 shrink-0">
                      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                      <span className="text-xs text-text-2">{key} {label}</span>
                    </div>
                    <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${dotClass}`} style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs font-mono text-text-3 w-4 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* AI Insights */}
          <div className="bg-surface rounded-2xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3.5">
              <div className="w-6 h-6 rounded-md bg-accent-light flex items-center justify-center">
                <span className="text-accent text-xs font-bold">✦</span>
              </div>
              <h2 className="text-sm font-semibold text-text-1">Vigil AI Insights</h2>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-text-2">
              <p>
                <span className="font-semibold text-text-1">Checkout Friction: </span>
                High friction detected in recent{" "}
                <code className="text-xs bg-surface-2 border border-border px-1.5 py-0.5 rounded font-mono text-accent">/checkout</code>
                {" "}sessions due to a 503 error from the payment API.
              </p>
              <p>
                <span className="font-semibold text-text-1">JS Errors: </span>
                <code className="text-xs bg-red-50 border border-red-100 px-1.5 py-0.5 rounded font-mono text-p0">TypeError: Cannot read properties</code>
                {" "}is spiking on mobile devices.
              </p>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="xl:col-span-3 space-y-5">

          {/* Recent triage inbox */}
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-sm font-semibold text-text-1">Recent Triage Inbox</h2>
              <Link href="/issues" className="text-xs text-accent hover:text-accent-dark font-medium transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {recentIssues.map(issue => (
                <Link
                  key={issue.id}
                  href={`/issues/${issue.id}`}
                  className="flex items-start gap-3.5 px-5 py-3.5 hover:bg-surface-2 transition-colors group"
                >
                  <IssueBadge severity={issue.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-1 truncate group-hover:text-accent transition-colors">
                      {issue.title}
                    </p>
                    <p className="text-xs text-text-3 mt-0.5 truncate">{issue.root_cause}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-bold text-text-1">{issue.affected_session_count}</p>
                      <p className="text-xs text-text-3 leading-none">sessions</p>
                    </div>
                    <ConfidenceBadge value={issue.confidence} />
                    <span className="text-xs text-text-3 w-12 text-right">
                      {formatRelativeTime(issue.last_seen_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* High friction sessions */}
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-sm font-semibold text-text-1">Recent High-Friction Sessions</h2>
              <Link href="/sessions" className="text-xs text-accent hover:text-accent-dark font-medium transition-colors flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {highFrictionSessions.map(session => (
                <Link
                  key={session.id}
                  href={`/sessions/${session.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors group"
                >
                  <span className="font-mono text-xs text-text-3 w-24 shrink-0 truncate">{session.id}</span>
                  <span className="text-xs text-text-2 w-24 shrink-0 truncate">{session.url}</span>
                  <FrictionBar score={session.ai_friction_score} className="flex-1" />
                  <span className={`text-xs flex items-center gap-1 shrink-0 w-20 ${session.ai_goal_completed ? "text-ok" : "text-p0"}`}>
                    {session.ai_goal_completed ? "✓ Met" : "✕ Failed"}
                  </span>
                  <span className="font-mono text-xs text-text-3 w-14 shrink-0 text-right">
                    {formatDuration(session.duration_ms)}
                  </span>
                  <EnvironmentChip env={session.environment} />
                  <span className="text-xs text-text-3 w-12 text-right shrink-0">
                    {formatRelativeTime(session.started_at)}
                  </span>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
