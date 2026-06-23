/**
 * @file CommandPalette.tsx
 * @description Sleek command palette/search modal activated globally via ⌘K/Ctrl+K.
 * @why Provides lightning-fast navigation, project switching, and issue/session querying.
 */

"use client"
import React, { useState, useEffect, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Search, X, CornerDownLeft, Command, Activity, AlertTriangle, Folder, Settings } from "lucide-react"
import { useProjects } from "@/lib/projects-context"
import { apiFetch } from "@/lib/utils"
import { IssueGroup, Session } from "@/lib/mock-data"

interface CommandPaletteProps {
  isOpen: boolean
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function CommandPalette({ isOpen, setIsOpen }: CommandPaletteProps) {
  const router = useRouter()
  const { projects, activeProject, setActiveProjectId } = useProjects()
  const [query, setQuery] = useState("")
  const [issues, setIssues] = useState<IssueGroup[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const backdropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedItemRef = useRef<HTMLButtonElement>(null)

  // Global key listener to toggle command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [setIsOpen])

  // Reset query and focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("")
      setSelectedIndex(0)
      // Small timeout to ensure element is rendered
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
  }, [isOpen])

  // Fetch issues and sessions for active project when open
  useEffect(() => {
    if (!isOpen || !activeProject) {
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
        console.error("Failed to load command palette search data:", err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [isOpen, activeProject])

  // Scroll selected item into view when index changes
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  // Generate and filter list of visible items
  const visibleItems = useMemo(() => {
    const list: Array<{
      id: string
      title: string
      subtitle?: string
      category: string
      badge?: string
      badgeColor?: string
      icon: React.ComponentType<{ className?: string }>
      onSelect: () => void
    }> = []

    const q = query.trim().toLowerCase()

    // 1. Navigation pages
    const pages = [
      { title: "Overview Dashboard", path: "/", icon: Activity },
      { title: "Triage Issues", path: "/issues", icon: AlertTriangle },
      { title: "User Sessions", path: "/sessions", icon: Activity },
      { title: "Settings", path: "/settings", icon: Settings },
    ]

    pages.forEach(p => {
      if (!q || p.title.toLowerCase().includes(q)) {
        list.push({
          id: `nav-${p.path}`,
          title: p.title,
          subtitle: `Navigate to ${p.title}`,
          category: "Navigation",
          icon: p.icon,
          onSelect: () => {
            router.push(p.path)
            setIsOpen(false)
          }
        })
      }
    })

    // 2. Projects switcher
    projects.forEach(p => {
      if (!q || p.name.toLowerCase().includes(q)) {
        list.push({
          id: `proj-${p.id}`,
          title: p.name,
          subtitle: `Switch current workspace`,
          category: "Projects",
          badge: activeProject?.id === p.id ? "Active" : undefined,
          badgeColor: activeProject?.id === p.id ? "bg-ok-bg text-ok" : undefined,
          icon: Folder,
          onSelect: () => {
            setActiveProjectId(p.id)
            router.push("/")
            setIsOpen(false)
          }
        })
      }
    })

    // 3. Issues
    issues.forEach(issue => {
      const matchesTitle = issue.title.toLowerCase().includes(q)
      const matchesCause = (issue.root_cause || "").toLowerCase().includes(q)
      const matchesId = issue.id.toLowerCase().includes(q)

      if (!q || matchesTitle || matchesCause || matchesId) {
        list.push({
          id: `issue-${issue.id}`,
          title: issue.title,
          subtitle: issue.root_cause || "No analyzed root cause available",
          category: "Issues",
          badge: issue.severity,
          badgeColor: 
            issue.severity === "P0" ? "bg-p0-bg text-p0 font-semibold" : 
            issue.severity === "P1" ? "bg-p1-bg text-p1 font-semibold" : 
            issue.severity === "P2" ? "bg-p2-bg text-p2 font-semibold" : "bg-p3-bg text-p3 font-semibold",
          icon: AlertTriangle,
          onSelect: () => {
            router.push(`/issues/${issue.id}`)
            setIsOpen(false)
          }
        })
      }
    })

    // 4. Sessions
    sessions.forEach(session => {
      const matchesId = session.id.toLowerCase().includes(q)
      const matchesUrl = session.url.toLowerCase().includes(q)
      const matchesSummary = (session.ai_session_summary || "").toLowerCase().includes(q)

      if (!q || matchesId || matchesUrl || matchesSummary) {
        list.push({
          id: `session-${session.id}`,
          title: `${session.id} (${session.url})`,
          subtitle: session.ai_session_summary || "No AI session summary available",
          category: "Sessions",
          badge: `${session.ai_friction_score} Friction`,
          badgeColor: session.ai_friction_score > 70 ? "bg-p0-bg text-p0" : "bg-ok-bg text-ok",
          icon: Activity,
          onSelect: () => {
            router.push(`/sessions/${session.id}`)
            setIsOpen(false)
          }
        })
      }
    })

    // If query is empty, slice to keep results size readable and clean
    if (!q) {
      const navs = list.filter(item => item.category === "Navigation")
      const projs = list.filter(item => item.category === "Projects")
      const iss = list.filter(item => item.category === "Issues").slice(0, 3)
      const sess = list.filter(item => item.category === "Sessions").slice(0, 3)
      return [...navs, ...projs, ...iss, ...sess]
    }

    return list
  }, [query, projects, issues, sessions, activeProject, router, setActiveProjectId, setIsOpen])

  // Reset index if list length shifts
  useEffect(() => {
    setSelectedIndex(0)
  }, [visibleItems.length])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % visibleItems.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + visibleItems.length) % visibleItems.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (visibleItems[selectedIndex]) {
        visibleItems[selectedIndex].onSelect()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setIsOpen(false)
    }
  }

  if (!isOpen) return null

  // Categorize grouped items to render headers
  const groupedCategories: Record<string, typeof visibleItems> = {}
  visibleItems.forEach(item => {
    if (!groupedCategories[item.category]) {
      groupedCategories[item.category] = []
    }
    groupedCategories[item.category].push(item)
  })

  // Helper index tracker for rendering selection states correctly across category groups
  let absoluteItemCount = 0

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-20 px-4"
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) {
          setIsOpen(false)
        }
      }}
    >
      <div 
        role="dialog"
        aria-modal="true"
        aria-label="Command Menu"
        className="bg-surface border border-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[500px] animate-in fade-in zoom-in-95 duration-200"
        onKeyDown={handleKeyDown}
      >
        {/* Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-surface shrink-0">
          <Search className="w-5 h-5 text-text-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, project, issue, or session to search..."
            className="w-full text-text-1 bg-transparent border-0 focus:outline-none placeholder-text-3 text-sm"
          />
          <div className="flex items-center gap-1">
            <kbd className="text-[10px] font-mono text-text-3 bg-surface-2 border border-border px-1.5 py-0.5 rounded shadow-sm flex items-center gap-0.5">
              <Command className="w-2.5 h-2.5" />
              <span>K</span>
            </kbd>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-text-3 hover:text-text-1 p-1 rounded hover:bg-surface-2 transition-colors"
              aria-label="Close search"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 bg-surface select-none">
          {loading && visibleItems.length === 0 ? (
            <div className="py-12 text-center text-text-3 text-xs font-mono animate-pulse">
              Fetching workspace data...
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="py-12 text-center text-text-3 text-sm">
              No results found for <span className="font-semibold text-text-1">&quot;{query}&quot;</span>
            </div>
          ) : (
            Object.keys(groupedCategories).map((category) => {
              const categoryItems = groupedCategories[category]
              return (
                <div key={category} className="mb-3 last:mb-0">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-3 font-mono">
                    {category}
                  </div>
                  <div className="space-y-0.5">
                    {categoryItems.map((item) => {
                      const itemIndex = absoluteItemCount++
                      const isSelected = itemIndex === selectedIndex

                      return (
                        <button
                          key={item.id}
                          ref={isSelected ? selectedItemRef : null}
                          onClick={item.onSelect}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                            isSelected 
                              ? "bg-accent/10 border-accent/20" 
                              : "bg-transparent border-transparent"
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected 
                              ? "bg-accent text-white border-accent" 
                              : "bg-surface-2 border-border text-text-2"
                          }`}>
                            <item.icon className="w-4 h-4" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium truncate ${
                                isSelected ? "text-accent font-semibold" : "text-text-1"
                              }`}>
                                {item.title}
                              </span>
                              {item.badge && (
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 border ${
                                  isSelected ? "border-accent/30" : "border-transparent"
                                } ${item.badgeColor}`}>
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            {item.subtitle && (
                              <p className="text-xs text-text-3 truncate mt-0.5">
                                {item.subtitle}
                              </p>
                            )}
                          </div>

                          {isSelected && (
                            <kbd className="text-[10px] font-mono text-accent-dark bg-accent-light border border-accent/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <span>Enter</span>
                              <CornerDownLeft className="w-2.5 h-2.5" />
                            </kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-surface-2 text-[10px] text-text-3 font-mono shrink-0">
          <div className="flex items-center gap-3">
            <span>Use <kbd className="bg-surface border border-border px-1 py-0.5 rounded shadow-xs">↑↓</kbd> to navigate</span>
            <span><kbd className="bg-surface border border-border px-1 py-0.5 rounded shadow-xs">Enter</kbd> to select</span>
          </div>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  )
}
