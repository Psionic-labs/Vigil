import Link from "next/link";
import { Users, GitBranch, Bot } from "lucide-react";
import { IssueBadge } from "./IssueBadge";
import { ConfidenceBadge } from "@/components/shared/ConfidenceBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import type { IssueGroup } from "@/lib/types";

export function IssueRow({ issue }: { issue: IssueGroup }) {
  return (
    <Link
      href={`/issues/${issue.id}`}
      className="group flex items-center gap-4 px-4 py-3.5 border-b border-border hover:bg-surface-2 transition-colors duration-100 relative"
    >
      {/* Left accent on hover */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent opacity-0 group-hover:opacity-100 transition-opacity duration-100" />

      {/* Severity */}
      <div className="flex-shrink-0">
        <IssueBadge severity={issue.severity} />
      </div>

      {/* Title + root cause */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-1 truncate font-medium leading-tight">
          {issue.title}
        </p>
        <p className="text-xs text-text-2 truncate mt-0.5 leading-tight">
          {issue.root_cause.slice(0, 100)}…
        </p>
      </div>

      {/* Metadata cluster */}
      <div className="flex items-center gap-3 flex-shrink-0 text-xs text-text-2">
        {/* Sessions */}
        <div className="flex items-center gap-1">
          <Users size={11} className="text-text-3" />
          <span className="font-mono">{issue.affected_session_count}</span>
        </div>

        {/* Confidence */}
        <ConfidenceBadge confidence={issue.confidence} />

        {/* Last seen */}
        <RelativeTime unixMs={issue.last_seen_at} />

        {/* GitHub status */}
        <div className="flex items-center gap-1">
          <GitBranch size={12} className={issue.github_issue_url ? "text-text-1" : "text-text-3"} />
          {issue.github_issue_url && (
            <span className="text-text-2">#{issue.github_issue_number}</span>
          )}
        </div>

        {/* Auto-raised tag */}
        {issue.github_auto_raised && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Bot size={9} />
            auto
          </span>
        )}

        {/* Ignored */}
        {issue.status === "ignored" && (
          <span className="text-[10px] text-text-3 bg-surface-2 px-1.5 py-0.5 rounded border border-border">
            ignored
          </span>
        )}
      </div>
    </Link>
  );
}

