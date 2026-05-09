import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import { MOCK_SESSIONS, MOCK_EVENTS, MOCK_ISSUES } from "@/lib/mock-data";
import { ReplayPlayer } from "@/components/sessions/ReplayPlayer";
import { EvidenceTimeline } from "@/components/issues/EvidenceTimeline";
import { IssueBadge } from "@/components/issues/IssueBadge";
import { FrictionBar } from "@/components/sessions/FrictionBar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { frictionLabel } from "@/lib/utils";

export default function SessionDetailPage({ params }: { params: { id: string } }) {
  const session = MOCK_SESSIONS.find(s => s.id === params.id);
  if (!session) notFound();

  const events = MOCK_EVENTS.filter(e => e.session_id === session.id);
  const allEvents = events.length > 0 ? events : MOCK_EVENTS; // fallback for demo
  const linkedIssues = MOCK_ISSUES.filter(i => i.affected_session_count > 0).slice(0, 3);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border sticky top-0 bg-bg z-10">
        <Link href="/sessions" className="flex items-center gap-1.5 text-text-3 hover:text-text-1 transition-colors text-sm">
          <ArrowLeft size={13} />
          Sessions
        </Link>
        <span className="text-border">/</span>
        <span className="text-text-2 text-sm font-mono">{session.id}</span>
        {session.environment && (
          <span className={`text-[10px] px-2 py-0.5 rounded border ${
            session.environment === "production" ? "bg-success/10 text-success border-success/20" : "bg-p2/10 text-p2 border-p2/20"
          }`}>
            {session.environment}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-6">
          {/* Replay player */}
          <ReplayPlayer duration_ms={session.duration_ms} events={allEvents} />

          {/* Bottom two columns */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left: AI Analysis */}
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-text-3 uppercase tracking-wider">AI Analysis</h2>

              {/* Summary */}
              <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
                <p className="text-sm text-text-1 leading-relaxed">{session.ai_session_summary}</p>
              </div>

              {/* Friction score */}
              <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-text-3">Friction Score</p>
                  <p className="text-xs text-text-2">{frictionLabel(session.ai_friction_score)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold font-mono" style={{
                    color: session.ai_friction_score >= 80 ? "var(--p0)" : session.ai_friction_score >= 60 ? "var(--p1)" : session.ai_friction_score >= 30 ? "var(--p2)" : "var(--success)"
                  }}>
                    {session.ai_friction_score}
                  </span>
                  <div className="flex-1"><FrictionBar score={session.ai_friction_score} /></div>
                </div>
              </div>

              {/* Goal completed */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  {session.ai_goal_completed
                    ? <CheckCircle size={18} className="text-success" />
                    : <XCircle size={18} className="text-p0" />}
                  <div>
                    <p className="text-sm font-medium text-text-1">{session.ai_goal_completed ? "Goal Completed" : "Goal Not Completed"}</p>
                    <p className="text-xs text-text-3 mt-0.5">User {session.ai_goal_completed ? "successfully completed" : "did not complete"} their session objective</p>
                  </div>
                </div>
              </div>

              {/* Linked issues */}
              {linkedIssues.length > 0 && (
                <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                  <p className="text-xs font-medium text-text-3 uppercase tracking-wider">Linked Issues</p>
                  <div className="space-y-2">
                    {linkedIssues.map(issue => (
                      <Link key={issue.id} href={`/issues/${issue.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity group">
                        <IssueBadge severity={issue.severity} />
                        <p className="text-xs text-text-2 group-hover:text-text-1 transition-colors truncate">{issue.title}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Release info */}
              <div className="flex gap-2 flex-wrap">
                {session.release && (
                  <span className="text-[10px] font-mono px-2 py-1 rounded border border-border bg-surface text-text-3">
                    {session.release}
                  </span>
                )}
                {session.commit_sha && (
                  <span className="text-[10px] font-mono px-2 py-1 rounded border border-border bg-surface text-text-3">
                    {session.commit_sha}
                  </span>
                )}
              </div>
            </div>

            {/* Right: Event timeline */}
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-text-3 uppercase tracking-wider">Event Timeline</h2>
              <div className="rounded-lg border border-border bg-surface overflow-hidden">
                <EvidenceTimeline events={allEvents} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
