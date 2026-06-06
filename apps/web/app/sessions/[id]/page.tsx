import { mockSessions, getIssuesForSession } from "@/lib/mock-data"
import { IssueBadge } from "@/components/ui/IssueBadge"
import { FrictionBar } from "@/components/ui/FrictionBar"
import { formatRelativeTime, formatDuration, formatTimestamp } from "@/lib/utils"
import { ArrowLeft, Play, MonitorPlay } from "lucide-react"
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

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = mockSessions.find(s => s.id === id)
  if (!session) {
    notFound()
  }
  const linkedIssues = getIssuesForSession(session.id).slice(0, 2)

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <Link href="/sessions" className="inline-flex items-center gap-1.5 text-sm text-text-3
                                        hover:text-accent transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to Sessions
      </Link>

      {/* Replay player */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden mb-6">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-2 border-b border-border">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-400 animate-pulse" />
            <span className="w-3 h-3 rounded-full bg-yellow-400" />
            <span className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 bg-surface border border-border rounded-md px-3 py-1 text-xs font-mono text-text-3">
            https://example.com{session.url}
          </div>
          <span className="text-xs font-mono text-text-3">{session.screen_width}×{session.screen_height}</span>
        </div>

        {/* Viewport */}
        <div className="aspect-video bg-slate-50 relative overflow-hidden flex items-center justify-center">
          <div className="w-full h-full p-8 space-y-4 opacity-40">
            <div className="h-6 w-40 bg-slate-200 rounded" />
            <div className="grid grid-cols-3 gap-4">
              <div className="h-32 bg-slate-200 rounded-lg" />
              <div className="h-32 bg-slate-200 rounded-lg" />
              <div className="h-32 bg-slate-200 rounded-lg" />
            </div>
            <div className="h-10 w-32 bg-slate-300 rounded-lg" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-text-3">
              <MonitorPlay className="w-10 h-10" />
              <p className="text-sm font-medium">Session replay will render here</p>
              <p className="text-xs">rrweb-player · {formatDuration(session.duration_ms)}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="px-4 py-3 bg-surface-2 border-t border-border">
          <div className="flex items-center gap-3 mb-2.5">
            <button className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent-dark transition-colors cursor-pointer">
              <Play className="w-4 h-4 ml-0.5" />
            </button>
            <span className="font-mono text-xs text-text-3">0:00 / {formatDuration(session.duration_ms)}</span>
            <select className="ml-auto text-xs bg-surface border border-border rounded-lg px-2 py-1 text-text-2 cursor-pointer">
              <option>1×</option><option>2×</option><option>0.5×</option>
            </select>
          </div>
          {/* Scrubber */}
          <div className="relative h-2 bg-surface-2 rounded-full border border-border overflow-hidden">
            <div className="absolute left-0 top-0 h-full w-[8%] bg-accent rounded-full" />
            {session.timeline
              .filter(e => e.type === "network_error" || e.type === "js_error" || e.type === "rage_click")
              .map((ev, i) => (
                <div key={i}
                  className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm
                    ${ev.type === "network_error" || ev.type === "js_error" ? "bg-p0" : "bg-p2"}`}
                  style={{ left: `${Math.min((ev.timestamp_ms / session.duration_ms) * 100, 95)}%` }}
                  title={ev.type}
                />
              ))}
          </div>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">

        {/* AI Analysis */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-accent-light flex items-center justify-center">
              <span className="text-accent text-xs font-bold">✦</span>
            </div>
            <p className="text-sm font-semibold text-text-1">AI Session Analysis</p>
          </div>
          <p className="text-sm text-text-2 leading-relaxed mb-5">{session.ai_session_summary}</p>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-surface-2 rounded-xl border border-border p-4">
              <p className="text-xs text-text-3 mb-1">Friction Score</p>
              <FrictionBar score={session.ai_friction_score} />
            </div>
            <div className="bg-surface-2 rounded-xl border border-border p-4">
              <p className="text-xs text-text-3 mb-1">Goal Completion</p>
              <p className={`text-sm font-semibold ${session.ai_goal_completed ? "text-ok" : "text-p0"}`}>
                {session.ai_goal_completed ? "✓ Goal Met" : "✕ Goal Failed"}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            {[
              { label: "Release",     value: session.release },
              { label: "Commit",      value: session.commit_sha, mono: true },
              { label: "Duration",    value: formatDuration(session.duration_ms) },
              { label: "Started",     value: formatRelativeTime(session.started_at) },
              { label: "Environment", value: session.environment },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-xs text-text-3">{label}</span>
                <span className={`text-xs font-semibold text-text-1 ${mono ? "font-mono" : ""}`}>{value}</span>
              </div>
            ))}
          </div>

          {linkedIssues.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2.5">Linked Issues</p>
              <div className="space-y-2">
                {linkedIssues.map(issue => (
                  <Link key={issue.id} href={`/issues/${issue.id}`}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border
                               hover:border-accent/30 hover:bg-surface-2 transition-all group">
                    <IssueBadge severity={issue.severity} />
                    <span className="text-xs text-text-1 flex-1 truncate group-hover:text-accent transition-colors">
                      {issue.title}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Event timeline */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <p className="text-sm font-semibold text-text-1">Event Timeline</p>
          </div>
          <div className="divide-y divide-border overflow-y-auto max-h-[480px]">
            {session.timeline.map((ev, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium border
                                  shrink-0 ${eventColor[ev.type] ?? eventColor.click}`}>
                  {eventTypeLabel[ev.type] ?? ev.type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-1 leading-relaxed">
                    {ev.nav_to ?? ev.target ?? ev.network_url ?? ev.error_message ?? ""}
                    {ev.network_status && (
                      <span className="ml-1 font-mono font-bold text-p0">→ {ev.network_status}</span>
                    )}
                    {ev.click_count && (
                      <span className="ml-1 text-p2 font-semibold">×{ev.click_count}</span>
                    )}
                  </p>
                </div>
                <span className="font-mono text-xs text-text-3 bg-surface-2 border border-border
                                 px-1.5 py-0.5 rounded shrink-0">
                  {formatTimestamp(ev.timestamp_ms)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
