"use client"
import { usePathname } from "next/navigation"
import { LayoutDashboard, AlertTriangle, Monitor, Settings, ChevronDown, Activity, User } from "lucide-react"
import { mockIssues } from "@/lib/mock-data"

import { NavItem } from "./NavItem"

const openCount = mockIssues.filter(i => i.status === "open").length

const navItems = [
  { href: "/",         label: "Overview",  icon: LayoutDashboard },
  { href: "/issues",   label: "Issues",    icon: AlertTriangle,   badge: openCount },
  { href: "/sessions", label: "Sessions",  icon: Monitor },
  { href: "/settings", label: "Settings",  icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 bg-sidebar flex flex-col shrink-0 h-full">
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
      <div className="px-3 py-3 border-b border-indigo-800/60">
        <button
          suppressHydrationWarning
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg
                     bg-indigo-900/50 border border-indigo-700/50
                     hover:bg-indigo-900 transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          <span className="text-sm text-sidebar-text font-medium flex-1 text-left truncate">
            Checkout App
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-sidebar-muted shrink-0" />
        </button>
      </div>

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
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-indigo-900/60 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-sidebar-text" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-text truncate">dev@acme.io</p>
            <p className="text-xs text-sidebar-muted">Owner</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
