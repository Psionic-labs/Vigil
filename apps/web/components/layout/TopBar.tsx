"use client"
import { Bell, Search, Globe } from "lucide-react"

export function TopBar() {
  return (
    <header className="h-14 bg-surface border-b border-border px-6 flex items-center justify-between shrink-0 shadow-sm">
      {/* Search box placeholder */}
      <div className="flex items-center gap-2 max-w-xs w-full text-text-3">
        <Search className="w-4 h-4" />
        <span className="text-xs font-mono select-none">Press ⌘K to search...</span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-text-2 font-medium bg-surface-2 px-2.5 py-1 rounded-full border border-border">
          <Globe className="w-3.5 h-3.5 text-ok" />
          <span>All Systems Operational</span>
        </div>
        <button aria-label="Notifications" className="relative w-8 h-8 rounded-lg bg-surface hover:bg-surface-2 border border-border flex items-center justify-center text-text-2 hover:text-accent transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-p0" />
        </button>
      </div>
    </header>
  )
}
