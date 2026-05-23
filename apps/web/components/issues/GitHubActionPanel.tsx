import { ExternalLink, MessageSquare, Bot } from "lucide-react";
import type { IssueGroup, Project } from "@/lib/types";
import { GithubIcon } from "@/components/shared/GithubIcon";

export function GitHubActionPanel({ issue, project }: { issue: IssueGroup; project: Project }) {
  const isLinked = !!issue.github_issue_url;

  return (
    <div className="space-y-4">
      {/* GitHub card */}
      <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-text-1">
          <GithubIcon width={14} height={14} />
          GitHub
        </div>

        {isLinked ? (
          <div className="space-y-3">
            <a
              href={issue.github_issue_url!}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-accent hover:underline"
            >
              {project.github_repo} #{issue.github_issue_number}
              <ExternalLink size={11} />
            </a>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">open</span>
              {issue.github_auto_raised && (
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Bot size={9} /> auto-raised
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <a
                href={issue.github_issue_url!}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-border bg-surface-2 text-sm text-text-1 hover:border-text-3 transition-colors"
              >
                <ExternalLink size={12} />
                View on GitHub
              </a>
              {project.github_comment_enabled && (
                <button className="flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-border bg-surface-2 text-sm text-text-2 hover:text-text-1 hover:border-text-3 transition-colors">
                  <MessageSquare size={12} />
                  Post follow-up comment
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              placeholder="Add a comment before raising... (optional)"
              rows={3}
              className="w-full text-xs bg-surface-2 border border-border rounded-md px-3 py-2 text-text-1 placeholder:text-text-3 focus:outline-none focus:border-accent resize-none"
            />
            <button className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors">
              <GithubIcon width={13} height={13} />
              Raise GitHub Issue
            </button>
            <details className="text-xs text-text-3 cursor-pointer">
              <summary className="hover:text-text-2">Preview issue content</summary>
              <div className="mt-2 p-2 bg-surface-2 rounded border border-border text-text-2 leading-relaxed">
                <p className="font-mono text-text-3 mb-1">## {issue.title}</p>
                <p><strong>Severity:</strong> {issue.severity} | <strong>Confidence:</strong> {Math.round(issue.confidence * 100)}%</p>
                <p className="mt-1 truncate">{issue.root_cause.slice(0, 80)}…</p>
              </div>
            </details>
          </div>
        )}
      </div>

      {/* Session stats mini card */}
      <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
        <p className="text-xs font-medium text-text-2 uppercase tracking-wider">Session Stats</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-text-3">Affected</p>
            <p className="text-text-1 font-mono font-medium">{issue.affected_session_count} sessions</p>
          </div>
          <div>
            <p className="text-text-3">Avg Friction</p>
            <p className="text-p1 font-mono font-medium">74</p>
          </div>
          <div>
            <p className="text-text-3">Goal Completion</p>
            <p className="text-text-1 font-mono font-medium">12%</p>
          </div>
          <div>
            <p className="text-text-3">Environment</p>
            <div className="flex gap-1 mt-0.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20">prod</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

