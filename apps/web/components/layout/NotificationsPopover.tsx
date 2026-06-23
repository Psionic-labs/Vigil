/**
 * @file NotificationsPopover.tsx
 * @description Dynamic notifications dropdown showing triage alerts and critical sessions.
 * @why Enables real-time feedback on critical system triggers and user path blockages.
 */

"use client"
import React, { useState, useEffect, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Bell, Check, Trash2, X, AlertTriangle, Monitor, Info, CheckCircle2 } from "lucide-react"
import { useProjects } from "@/lib/projects-context"
import { apiFetch, formatRelativeTime } from "@/lib/utils"
import { IssueGroup, Session } from "@/lib/mock-data"

interface NotificationItem {
  id: string
  title: string
  message: string
  type: "issue" | "session" | "system"
  severity: "P0" | "P1" | "info"
  timestamp: number
  link: string
}

export function NotificationsPopover() {
  const router = useRouter()
  const { activeProject } = useProjects()
  const [isOpen, setIsOpen] = useState(false)
  const [issues, setIssues] = useState<IssueGroup[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)

  // Local storage state tracking
  const [readIds, setReadIds] = useState<string[]>([])
  const [dismissedIds, setDismissedIds] = useState<string[]>([])

  const popoverRef = useRef<HTMLDivElement>(null)

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Load state from local storage on mount
  useEffect(() => {
    try {
      const read = localStorage.getItem("vigil_read_notifications")
      const dismissed = localStorage.getItem("vigil_dismissed_notifications")
      if (read) setReadIds(JSON.parse(read))
      if (dismissed) setDismissedIds(JSON.parse(dismissed))
    } catch (e) {
      console.error("Failed to load notifications read/dismissed states", e)
    }
  }, [])

  // Fetch data from server when active project changes
  useEffect(() => {
    if (!activeProject) {
      setIssues([])
      setSessions([])
      return
    }

    setLoading(true)
    Promise.all([
      apiFetch(`/api/v1/issues?projectId=${activeProject.id}`).then(res => res.ok ? res.json() : { data: [] }),
      apiFetch(`/api/v1/sessions?projectId=${activeProject.id}`).then(res => res.ok ? res.json() : { data: [] })
    ])
      .then(([issuesRes, sessionsRes]) => {
        setIssues(issuesRes.data || [])
        setSessions(sessionsRes.data || [])
      })
      .catch(err => {
        console.error("Failed to fetch notification sources:", err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [activeProject])

  // Derive notifications list dynamically
  const notifications = useMemo(() => {
    const list: NotificationItem[] = []

    if (!activeProject) return list

    // 1. Generate alerts for critical issues (P0 / P1)
    issues.forEach(issue => {
      if (issue.severity === "P0" || issue.severity === "P1") {
        list.push({
          id: `issue-${issue.id}`,
          title: `${issue.severity} Triage Alert`,
          message: issue.title,
          type: "issue",
          severity: issue.severity as "P0" | "P1",
          timestamp: issue.last_seen_at,
          link: `/issues/${issue.id}`
        })
      }
    })

    // 2. Generate alerts for high friction sessions (friction score > 70)
    sessions.forEach(session => {
      if (session.ai_friction_score > 70) {
        list.push({
          id: `session-${session.id}`,
          title: "High Friction Session",
          message: `Session ${session.id} on ${session.url} logged score ${session.ai_friction_score}`,
          type: "session",
          severity: "P1",
          timestamp: session.started_at,
          link: `/sessions/${session.id}`
        })
      }
    })

    // 3. Fallback welcome notification if no alerts exist
    if (list.length === 0) {
      list.push({
        id: `system-welcome-${activeProject.id}`,
        title: "Workspace Configured",
        message: `Project ${activeProject.name} created successfully. Awaiting unhandled exception telemetry.`,
        type: "system",
        severity: "info",
        timestamp: activeProject.createdAt || 1782237000000,
        link: "/"
      })
    }

    // Sort newest first
    return list.sort((a, b) => b.timestamp - a.timestamp)
  }, [issues, sessions, activeProject])

  // Exclude dismissed notifications
  const visibleNotifications = useMemo(() => {
    return notifications.filter(n => !dismissedIds.includes(n.id))
  }, [notifications, dismissedIds])

  // Count unread
  const unreadCount = useMemo(() => {
    return visibleNotifications.filter(n => !readIds.includes(n.id)).length
  }, [visibleNotifications, readIds])

  const handleMarkAsRead = (id: string) => {
    if (readIds.includes(id)) return
    const updated = [...readIds, id]
    setReadIds(updated)
    localStorage.setItem("vigil_read_notifications", JSON.stringify(updated))
  }

  const handleMarkAllAsRead = () => {
    const unreadFiltered = visibleNotifications.filter(n => !readIds.includes(n.id))
    const updated = [...readIds, ...unreadFiltered.map(n => n.id)]
    setReadIds(updated)
    localStorage.setItem("vigil_read_notifications", JSON.stringify(updated))
  }

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const updated = [...dismissedIds, id]
    setDismissedIds(updated)
    localStorage.setItem("vigil_dismissed_notifications", JSON.stringify(updated))
  }

  const handleDismissAll = () => {
    const updated = [...dismissedIds, ...visibleNotifications.map(n => n.id)]
    setDismissedIds(updated)
    localStorage.setItem("vigil_dismissed_notifications", JSON.stringify(updated))
  }

  const handleNotificationClick = (item: NotificationItem) => {
    handleMarkAsRead(item.id)
    setIsOpen(false)
    router.push(item.link)
  }

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="relative w-8 h-8 rounded-lg bg-surface hover:bg-surface-2 border border-border flex items-center justify-center text-text-2 hover:text-accent transition-colors focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-p0 animate-pulse" />
        )}
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div 
          role="dialog"
          aria-label="Notifications inbox"
          className="absolute right-0 mt-2.5 w-96 bg-surface border border-border rounded-2xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[480px] animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-1">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold bg-p0-bg text-p0 px-2 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {visibleNotifications.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-accent hover:text-accent-dark font-medium transition-colors flex items-center gap-1 focus:outline-none"
                >
                  <Check className="w-3.5 h-3.5" /> Mark all read
                </button>
                <button
                  onClick={handleDismissAll}
                  className="text-xs text-text-3 hover:text-text-2 font-medium transition-colors flex items-center gap-1 focus:outline-none"
                  aria-label="Clear all notifications"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear all
                </button>
              </div>
            )}
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-border bg-surface">
            {loading && visibleNotifications.length === 0 ? (
              <div className="py-12 text-center text-text-3 text-xs font-mono animate-pulse">
                Checking notifications...
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div className="py-16 text-center flex flex-col items-center justify-center p-6">
                <div className="w-10 h-10 rounded-full bg-ok-bg flex items-center justify-center text-ok mb-3">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-medium text-text-1">All Caught Up</h3>
                <p className="text-xs text-text-3 text-center mt-1 max-w-[240px]">
                  No alert incidents or high-friction flows active on this workspace.
                </p>
              </div>
            ) : (
              visibleNotifications.map((item) => {
                const isUnread = !readIds.includes(item.id)
                const IconComponent = 
                  item.type === "issue" ? AlertTriangle : 
                  item.type === "session" ? Monitor : Info

                const severityColors = 
                  item.severity === "P0" ? "bg-p0-bg text-p0 border-red-200" :
                  item.severity === "P1" ? "bg-p1-bg text-p1 border-orange-200" :
                  "bg-accent-light text-accent border-accent/20"

                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`flex items-start gap-3 p-4 transition-colors cursor-pointer group relative ${
                      isUnread ? "bg-accent/5 hover:bg-accent/10" : "hover:bg-surface-2"
                    }`}
                  >
                    {/* Read indicator dot */}
                    {isUnread && (
                      <span className="absolute top-4 left-2 w-1.5 h-1.5 rounded-full bg-accent" />
                    )}

                    {/* Icon Badge */}
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${severityColors}`}>
                      <IconComponent className="w-4 h-4" />
                    </div>

                    {/* Notification info */}
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold truncate ${
                          isUnread ? "text-text-1 font-bold" : "text-text-2"
                        }`}>
                          {item.title}
                        </span>
                        <span className="text-[10px] text-text-3 shrink-0">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 leading-relaxed line-clamp-2 ${
                        isUnread ? "text-text-1 font-medium" : "text-text-2"
                      }`}>
                        {item.message}
                      </p>
                    </div>

                    {/* Dismiss Button */}
                    <button
                      onClick={(e) => handleDismiss(item.id, e)}
                      aria-label="Dismiss notification"
                      className="absolute right-3 top-4 text-text-3 hover:text-text-1 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 p-0.5 rounded hover:bg-surface-2"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
