/**
 * @file page.tsx
 * @description Detailed page displaying diagnostics, AI suggestions, and sessions for an issue group.
 * @why Helps developers debug issues using AI root cause analysis and timelines.
 */

import { mockIssues, getSessionsForIssue } from "@/lib/mock-data"
import { IssueBadge } from "@/components/ui/IssueBadge"
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge"
import { formatRelativeTime, formatTimestamp, severityColor } from "@/lib/utils"
import { ArrowLeft, Users, Clock, ChevronRight } from "lucide-react"
import { GitHubIntegrationCard } from "@/components/issues/GitHubIntegrationCard"
import Link from "next/link"
import { notFound } from "next/navigation"

const eventTypeLabel: Record<string, string> = {
  navigation:    "Navigated to",
  click:         "Clicked",
  rage_click:    "Rage clicked",
  dead_click:    "Dead click on",
  network_error: "Network error",
  js_error:      "JS Error",
  console_error: "Console error",
}
const eventColor: Record<string, string> = {
  navigation:    "bg-accent-light border-accent/20 text-accent",
  click:         "bg-surface-2 border-border text-text-2",
  rage_click:    "bg-p2-bg border-yellow-200 text-p2",
  dead_click:    "bg-surface-2 border-border text-text-3",
  network_error: "bg-p0-bg border-red-200 text-p0",
  js_error:      "bg-p1-bg border-orange-200 text-p1",
  console_error: "bg-surface-2 border-border text-text-3",
}

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const issue = mockIssues.find(i => i.id === id)
  if (!issue) {
    notFound()
  }
  const c = severityColor(issue.severity)
  const affectedSessions = getSessionsForIssue(issue.id).slice(0, 5)

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <Link href="/issues" className="inline-flex items-center gap-1.5 text-sm text-text-3
                                      hover:text-accent transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to Issues
      </Link>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">

        {/* Left — AI report */}
        <div className="space-y-5">
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden relative">
            <div className={`h-1 w-full absolute top-0 ${c.dot}`} />
            <div className="p-6 pt-7">
              <div className="flex items-center gap-3 mb-4">
                <IssueBadge severity={issue.severity} />
                <ConfidenceBadge value={issue.confidence} />
                {issue.github_auto_raised && (
                  <span className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                    auto-raised
                  </span>
                )}
                <span className="ml-auto text-xs text-text-3 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Last seen {formatRelativeTime(issue.last_seen_at)}
                </span>
              </div>
              <h1 className="text-xl font-bold text-text-1 leading-snug">{issue.title}</h1>
              <div className="flex items-center gap-5 mt-3 text-xs text-text-3">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  {issue.affected_session_count} sessions affected
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  First seen {formatRelativeTime(issue.first_seen_at)}
                </span>
              </div>
            </div>

            <div className="border-t border-border divide-y divide-border">
              {[
                { label: "Root Cause",      content: issue.root_cause     },
                { label: "Suggested Fix",   content: issue.suggested_fix  },
              ].map(({ label, content }) => (
                <div key={label} className="p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">{label}</p>
                  <p className="text-sm text-text-2 leading-relaxed">{content}</p>
                </div>
              ))}

              <div className="p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-3">Reproduction Steps</p>
                <ol className="space-y-2.5">
                  {issue.reproduction_steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-text-2">
                      <span className="w-6 h-6 rounded-full bg-accent-light text-accent text-xs font-bold
                                       flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-3">Evidence Timeline</p>
                <div className="space-y-3">
                  {issue.evidence.map((ev, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium border ${eventColor[ev.type] ?? eventColor.click} shrink-0`}>
                        {eventTypeLabel[ev.type] ?? ev.type}
                      </span>
                      <span className="text-sm text-text-1 flex-1">{ev.detail}</span>
                      <span className="font-mono text-xs text-text-3 bg-surface-2 border border-border px-1.5 py-0.5 rounded shrink-0">
                        {formatTimestamp(ev.timestamp_ms)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Affected sessions */}
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <p className="text-sm font-semibold text-text-1">Affected Sessions</p>
            </div>
            <div className="divide-y divide-border">
              {affectedSessions.map(s => (
                <Link key={s.id} href={`/sessions/${s.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors group">
                  <span className="font-mono text-xs text-text-3 w-28 shrink-0">{s.id}</span>
                  <span className="text-xs text-text-2 flex-1 truncate">{s.url}</span>
                  <span className={`text-xs font-medium ${s.ai_goal_completed ? "text-ok" : "text-p0"}`}>
                    {s.ai_goal_completed ? "✓ Goal Met" : "✕ Failed"}
                  </span>
                  <span className="text-xs text-text-3 w-14 text-right">{formatRelativeTime(s.started_at)}</span>
                  <ChevronRight className="w-4 h-4 text-text-3 group-hover:text-accent transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right — action panel */}
        <div className="space-y-4">
          <GitHubIntegrationCard
            initialIssueUrl={issue.github_issue_url}
            initialIssueNumber={issue.github_issue_number}
          />

          <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-3">Session Stats</p>
            <div className="space-y-2.5">
              {[
                { label: "Affected sessions", value: issue.affected_session_count },
                { label: "Avg confidence",    value: `${Math.round(issue.confidence * 100)}%` },
                { label: "First seen",        value: formatRelativeTime(issue.first_seen_at) },
                { label: "Last seen",         value: formatRelativeTime(issue.last_seen_at) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-text-3">{label}</span>
                  <span className="text-xs font-semibold text-text-1 font-mono">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
