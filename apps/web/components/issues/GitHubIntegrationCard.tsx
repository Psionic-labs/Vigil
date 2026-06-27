/**
 * @file GitHubIntegrationCard.tsx
 * @description Component rendering options to link Vigil issues with GitHub issues.
 * @why Facilitates issue synchronization with developers' project trackers.
 */

"use client"
import { useState, useEffect } from "react"
import { AlertTriangle, ArrowRight } from "lucide-react"
import { Github } from "@/components/ui/GithubIcon"
import { apiFetch } from "@/lib/utils"
import Link from "next/link"

interface GitHubIntegrationCardProps {
  projectId: string
  issueGroupId: string
  initialIssueUrl: string | null
  initialIssueNumber: number | null
}

interface ConnectionStatus {
  connected: boolean
  connectionStatus?: "active" | "expired" | "revoked" | "rate_limited" | "error"
  githubUsername?: string
  repoSelected?: boolean
  defaultRepo?: string | null
}

export function GitHubIntegrationCard({
  projectId,
  issueGroupId,
  initialIssueUrl,
  initialIssueNumber,
}: GitHubIntegrationCardProps) {
  const [raisedUrl, setRaisedUrl] = useState<string | null>(initialIssueUrl)
  const [raisedNumber, setRaisedNumber] = useState<number | null>(initialIssueNumber)
  const [comment, setComment] = useState("")
  const [isRaising, setIsRaising] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  useEffect(() => {
    // We only need to check connection health if the issue is not raised yet
    if (raisedUrl) {
      setStatusLoading(false)
      return
    }

    async function checkStatus() {
      try {
        const res = await apiFetch(`/api/v1/github/status?projectId=${projectId}`)
        if (res.ok) {
          const { data } = await res.json()
          setStatus(data)
        }
      } catch (err) {
        console.error("Failed to load GitHub status:", err)
      } finally {
        setStatusLoading(false)
      }
    }

    checkStatus()
  }, [projectId, raisedUrl])

  const handleRaiseIssue = async () => {
    setIsRaising(false)
    setErrorMsg(null)
    setIsRaising(true)

    try {
      const res = await apiFetch("/api/v1/github/raise", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          issueGroupId,
          comment: comment.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setRaisedUrl(data.data.url)
        setRaisedNumber(data.data.number)
      } else {
        if (res.status === 409) {
          setErrorMsg("This issue is already being raised or linked in a concurrent request.")
        } else if (res.status === 429) {
          setErrorMsg("GitHub rate limit exceeded. Please try again in a few minutes.")
        } else {
          setErrorMsg(data.error || "Failed to raise GitHub issue.")
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "A network error occurred.")
    } finally {
      setIsRaising(false)
    }
  }

  if (statusLoading) {
    return (
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 animate-pulse text-xs text-text-3">
        Checking GitHub connection status...
      </div>
    )
  }

  // If issue is already linked
  if (raisedUrl) {
    // Extract repository from raisedUrl if status is not loaded
    const displayRepo = status?.defaultRepo || "GitHub Repository"

    return (
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Github className="w-4 h-4 text-text-2" />
          <p className="text-sm font-semibold text-text-1">GitHub Integration</p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-surface-2 rounded-xl border border-border">
            <Github className="w-4 h-4 text-accent" />
            <span className="text-xs font-semibold text-text-1 font-mono truncate flex-1">
              {displayRepo} #{raisedNumber}
            </span>
            <span className="text-xxs font-bold text-ok bg-ok-bg border border-green-200 px-2 py-0.5 rounded-full shrink-0">
              linked
            </span>
          </div>
          <a
            href={raisedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold
                       text-text-2 bg-surface-2 border border-border rounded-xl
                       hover:border-accent/40 hover:text-accent transition-all cursor-pointer"
          >
            View on GitHub
          </a>
        </div>
      </div>
    )
  }

  // If integration is not connected
  if (!status || !status.connected || !status.repoSelected) {
    return (
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Github className="w-4 h-4 text-text-2" />
          <p className="text-sm font-semibold text-text-1">GitHub Integration</p>
        </div>
        <p className="text-xs text-text-3 mb-4 leading-relaxed">
          Setup GitHub OAuth and configure a target repository in your settings to raise issue reports directly.
        </p>
        <Link
          href={`/settings?project_id=${projectId}`}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold
                     text-accent bg-accent-light border border-accent/20 rounded-xl
                     hover:bg-accent hover:text-white transition-all cursor-pointer"
        >
          Configure Settings
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    )
  }

  const isHealthDegraded = status.connectionStatus !== "active"

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Github className="w-4 h-4 text-text-2" />
          <p className="text-sm font-semibold text-text-1">GitHub Integration</p>
        </div>
        <span className="text-xxs text-text-3 font-medium">Target: {status.defaultRepo}</span>
      </div>

      {isHealthDegraded && (
        <div className="flex items-start gap-2 p-2.5 bg-p0-bg border border-red-200 rounded-xl text-p0 text-xxs mb-3 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            {status.connectionStatus === "expired" && "Connection credentials have expired. Reconnect in Settings."}
            {status.connectionStatus === "revoked" && "Access was revoked by GitHub. Reconnect in Settings."}
            {status.connectionStatus === "rate_limited" && "GitHub API rate limits are currently exhausted. Try again later."}
            {status.connectionStatus === "error" && "Integration is experiencing connection errors. Verify in Settings."}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 bg-p0-bg border border-red-200 rounded-xl text-p0 text-xxs mb-3 font-mono leading-relaxed break-words">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      <div className="space-y-3">
        <textarea
          placeholder="Add a comment before raising (optional)..."
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={isRaising}
          className="w-full text-sm bg-surface-2 border border-border rounded-xl p-3 resize-none
                     text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-2
                     focus:ring-accent/30 focus:border-accent transition-all disabled:opacity-50"
        />
        <button
          onClick={handleRaiseIssue}
          disabled={isRaising}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold
                     text-white bg-accent hover:bg-accent-dark border border-accent rounded-xl
                     transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <Github className="w-4 h-4 text-white" />
          {isRaising ? "Raising Issue..." : "Raise GitHub Issue"}
        </button>
      </div>
    </div>
  )
}
