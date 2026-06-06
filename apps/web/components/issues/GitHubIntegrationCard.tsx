"use client"
import { useState } from "react"
import { Github } from "@/components/ui/GithubIcon"

interface GitHubIntegrationCardProps {
  initialIssueUrl: string | null
  initialIssueNumber: number | null
}

export function GitHubIntegrationCard({
  initialIssueUrl,
  initialIssueNumber,
}: GitHubIntegrationCardProps) {
  const [raisedUrl, setRaisedUrl] = useState<string | null>(initialIssueUrl)
  const [raisedNumber, setRaisedNumber] = useState<number | null>(initialIssueNumber)
  const [comment, setComment] = useState("")
  const [isRaising, setIsRaising] = useState(false)

  const handleRaiseIssue = async () => {
    setIsRaising(true)
    // Simulate API call to create a GitHub issue
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const randomNum = Math.floor(Math.random() * 50) + 150
    setRaisedNumber(randomNum)
    setRaisedUrl(`https://github.com/acme/checkout-app/issues/${randomNum}`)
    setIsRaising(false)
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Github className="w-4 h-4 text-text-2" />
        <p className="text-sm font-semibold text-text-1">GitHub</p>
      </div>
      {raisedUrl ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-surface-2 rounded-xl border border-border">
            <Github className="w-4 h-4 text-text-2" />
            <span className="text-sm text-text-1 font-medium truncate">
              acme/checkout-app #{raisedNumber}
            </span>
            <span className="ml-auto text-xs font-medium text-ok bg-ok-bg border border-green-200 px-2 py-0.5 rounded-full shrink-0">
              open
            </span>
          </div>
          <a
            href={raisedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium
                       text-text-2 bg-surface-2 border border-border rounded-xl
                       hover:border-accent/40 hover:text-accent transition-all cursor-pointer"
          >
            View on GitHub
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            placeholder="Add a comment before raising..."
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
      )}
    </div>
  )
}
