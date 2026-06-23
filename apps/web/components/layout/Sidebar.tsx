/**
 * @file Sidebar.tsx
 * @description Main navigation sidebar containing the project selector dropdown.
 * @why Controls app navigation and project scope switches.
 */

"use client"
import { useState, useRef, useEffect } from "react"
import { usePathname } from "next/navigation"
import { LayoutDashboard, AlertTriangle, Monitor, Settings, ChevronDown, Activity, User, LogOut } from "lucide-react"
import { useProjects } from "@/lib/projects-context"
import { CreateProjectModal } from "@/components/projects/CreateProjectModal"
import { NavItem } from "./NavItem"
import { IssueGroup } from "@/lib/mock-data"
import { apiFetch } from "@/lib/utils"
import { authClient } from "@/lib/auth-client"

export function Sidebar() {
  const pathname = usePathname()
  const { data: sessionData } = authClient.useSession()
  const userEmail = sessionData?.user?.email || "dev@acme.io"
  const userName = sessionData?.user?.name || "Owner"

  const { projects, activeProject, setActiveProjectId, createProject } = useProjects()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [openIssuesCount, setOpenIssuesCount] = useState<number | undefined>(undefined)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (!activeProject) {
      setOpenIssuesCount(undefined)
      return
    }
    apiFetch(`/api/v1/issues?projectId=${activeProject.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch open issues count")
        return res.json()
      })
      .then((json) => {
        const count = json.data?.filter(
          (i: IssueGroup) => i.status === "open" && ["P0", "P1", "P2", "P3"].includes(i.severity)
        ).length ?? 0
        setOpenIssuesCount(count)
      })
      .catch((err) => {
        console.error("Failed to load open issues count in sidebar:", err)
        setOpenIssuesCount(0)
      })
  }, [activeProject])

  const navItems = [
    { href: "/",         label: "Overview",  icon: LayoutDashboard },
    { href: "/issues",   label: "Issues",    icon: AlertTriangle,   badge: openIssuesCount },
    { href: "/sessions", label: "Sessions",  icon: Monitor },
    { href: "/settings", label: "Settings",  icon: Settings },
  ]

  return (
    <aside className="w-60 bg-sidebar flex flex-col shrink-0 h-full z-10">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4 border-b border-indigo-800/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shadow-lg">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-white text-base tracking-tight">Vigil</span>
          <span className="ml-auto text-xs font-mono text-sidebar-muted bg-indigo-900/60 px-1.5 py-0.5 rounded">
            v0.1
          </span>
        </div>
      </div>

      {/* Project switcher */}
      <div className="px-3 py-3 border-b border-indigo-800/60 relative" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          suppressHydrationWarning
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg
                     bg-indigo-900/50 border border-indigo-700/50
                     hover:bg-indigo-900 transition-colors"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${activeProject ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
          <span className="text-sm text-sidebar-text font-medium flex-1 text-left truncate">
            {activeProject ? activeProject.name : "Select Project"}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-sidebar-muted shrink-0 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
        </button>

        {isDropdownOpen && (
          <div className="absolute top-full left-3 right-3 mt-1 py-1 bg-surface border border-border rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="max-h-48 overflow-y-auto">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => {
                    setActiveProjectId(project.id)
                    setIsDropdownOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    activeProject?.id === project.id 
                      ? "bg-accent/10 text-accent font-medium" 
                      : "text-text-2 hover:bg-surface-2 hover:text-text-1"
                  }`}
                >
                  {project.name}
                </button>
              ))}
            </div>
            
            {projects.length > 0 && <div className="h-px bg-border my-1" />}
            
            <button
              onClick={() => {
                setIsModalOpen(true)
                setIsDropdownOpen(false)
              }}
              className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-surface-2 transition-colors font-medium flex items-center gap-2"
            >
              <span className="text-lg leading-none">+</span> Create Project
            </button>
          </div>
        )}
      </div>

      <CreateProjectModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={createProject} 
      />

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-sidebar-muted">
          Menu
        </p>
        {navItems.map(({ href, label, icon, badge }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href))
          return (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              isActive={isActive}
              badge={badge}
            />
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-indigo-800/60 pt-3">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-full bg-indigo-900/60 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-sidebar-text" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-text truncate">{userEmail}</p>
              <p className="text-xs text-sidebar-muted truncate">{userName}</p>
            </div>
          </div>
          <button
            onClick={async () => {
              await authClient.signOut()
              window.location.href = "/sign-in"
            }}
            aria-label="Sign out"
            className="w-8 h-8 rounded-lg hover:bg-indigo-900 flex items-center justify-center text-sidebar-muted hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
