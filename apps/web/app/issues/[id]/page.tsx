import { notFound } from "next/navigation";
import { ArrowLeft, Users, Clock, Calendar } from "lucide-react";
import Link from "next/link";
import { MOCK_ISSUES, MOCK_EVENTS, MOCK_SESSIONS, MOCK_PROJECT } from "@/lib/mock-data";
import { IssueBadge } from "@/components/issues/IssueBadge";
import { ConfidenceBadge } from "@/components/shared/ConfidenceBadge";
import { EvidenceTimeline } from "@/components/issues/EvidenceTimeline";
import { GitHubActionPanel } from "@/components/issues/GitHubActionPanel";
import { TriageActions } from "@/components/issues/TriageActions";
import { FrictionBar } from "@/components/sessions/FrictionBar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { InlineCode } from "@/components/shared/CodeBlock";
import { formatDuration, formatRelativeTime } from "@/lib/utils";

export default function IssueDetailPage({ params }: { params: { id: string } }) {
  const issue = MOCK_ISSUES.find(i => i.id === params.id);
  if (!issue) notFound();

  const steps: string[] = JSON.parse(issue.reproduction_steps_json);
  const affectedSessions = MOCK_SESSIONS.filter(s => s.issue_group_count > 0).slice(0, 5);
  const relatedIssues = MOCK_ISSUES.filter(i => i.id !== issue.id && i.severity <= issue.severity).slice(0, 3);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border sticky top-0 bg-bg z-10">
        <Link href="/issues" className="flex items-center gap-1.5 text-text-3 hover:text-text-1 transition-colors text-sm">
          <ArrowLeft size={13} />
          Issues
        </Link>
        <span className="text-border">/</span>
        <span className="text-text-2 text-sm font-mono truncate max-w-xs">{issue.id}</span>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left column */}
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-6 space-y-6">
          {/* AI Bug Report */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <IssueBadge severity={issue.severity} />
              <ConfidenceBadge confidence={issue.confidence} />
              <span className="text-xs text-text-3">confidence</span>
            </div>

            <h1 className="text-xl font-bold text-text-1 leading-snug">{issue.title}</h1>

            {/* Meta row */}
            <div className="flex items-center gap-4 text-xs text-text-2">
              <span className="flex items-center gap-1"><Calendar size={11} className="text-text-3" /> First seen <RelativeTime unixMs={issue.first_seen_at} /></span>
              <span className="flex items-center gap-1"><Clock size={11} className="text-text-3" /> Last seen <RelativeTime unixMs={issue.last_seen_at} /></span>
              <span className="flex items-center gap-1"><Users size={11} className="text-text-3" /> {issue.affected_session_count} sessions</span>
            </div>

            <div className="h-px bg-border" />

            {/* Root cause */}
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-text-3 uppercase tracking-wider">Root Cause</h2>
              <p className="text-sm text-text-1 leading-relaxed">{issue.root_cause}</p>
            </div>

            {/* Suggested fix */}
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-text-3 uppercase tracking-wider">Suggested Fix</h2>
              <p className="text-sm text-text-1 leading-relaxed">{issue.suggested_fix}</p>
            </div>

            {/* Reproduction steps */}
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-text-3 uppercase tracking-wider">Reproduction Steps</h2>
              <ol className="space-y-2">
                {steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-text-1">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-surface-2 border border-border flex items-center justify-center text-[10px] font-mono text-text-3 mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            {/* Evidence */}
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-text-3 uppercase tracking-wider">Evidence</h2>
              <div className="rounded-lg border border-border bg-surface overflow-hidden">
                <EvidenceTimeline events={MOCK_EVENTS} />
              </div>
            </div>
          </div>

          {/* Affected sessions */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-text-3 uppercase tracking-wider">Affected Sessions</h2>
            <div className="rounded-lg border border-border bg-surface overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 text-text-3 font-medium">Session</th>
                    <th className="text-left px-4 py-2 text-text-3 font-medium">URL</th>
                    <th className="text-left px-4 py-2 text-text-3 font-medium w-32">Friction</th>
                    <th className="text-left px-4 py-2 text-text-3 font-medium">Duration</th>
                    <th className="text-left px-4 py-2 text-text-3 font-medium">When</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {affectedSessions.map(s => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-text-2">{s.id}</td>
                      <td className="px-4 py-2.5 text-text-1 truncate max-w-[120px]">{s.url}</td>
                      <td className="px-4 py-2.5 w-32"><FrictionBar score={s.ai_friction_score} /></td>
                      <td className="px-4 py-2.5 font-mono text-text-2">{formatDuration(s.duration_ms)}</td>
                      <td className="px-4 py-2.5"><RelativeTime unixMs={s.started_at} /></td>
                      <td className="px-4 py-2.5">
                        <Link href={`/sessions/${s.id}`} className="text-accent text-xs hover:underline">replay →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 border-t border-border">
                <button className="text-xs text-accent hover:underline">Show all {issue.affected_session_count} sessions</button>
              </div>
            </div>
          </div>
        </div>

        {/* Right column — sticky panel */}
        <div className="w-80 flex-shrink-0 border-l border-border overflow-y-auto px-4 py-6 space-y-4">
          <TriageActions issue={issue} />
          <GitHubActionPanel issue={issue} project={MOCK_PROJECT} />

          {/* Related issues */}
          {relatedIssues.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
              <p className="text-xs font-medium text-text-2 uppercase tracking-wider">Related Issues</p>
              <div className="space-y-2">
                {relatedIssues.map(r => (
                  <Link key={r.id} href={`/issues/${r.id}`} className="flex items-start gap-2 group">
                    <IssueBadge severity={r.severity} />
                    <p className="text-xs text-text-2 group-hover:text-text-1 transition-colors truncate leading-tight pt-0.5">
                      {r.title.slice(0, 50)}…
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
