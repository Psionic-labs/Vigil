/**
 * @file TopBar.tsx
 * @description Global top bar displaying current project and user details.
 * @why Provides context-switching controls and user visual reference.
 */

"use client"
import React, { useState } from "react"
import { Search, Globe } from "lucide-react"
import { CommandPalette } from "./CommandPalette"
import { NotificationsPopover } from "./NotificationsPopover"

export function TopBar() {
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  return (
    <header className="h-14 bg-surface border-b border-border px-6 flex items-center justify-between shrink-0 shadow-sm">
      {/* Search box trigger */}
      <button
        onClick={() => setIsSearchOpen(true)}
        className="flex items-center gap-2 max-w-xs w-full text-text-3 hover:text-text-2 transition-colors text-left focus:outline-none cursor-pointer"
        aria-label="Open search palette"
      >
        <Search className="w-4 h-4" />
        <span className="text-xs font-mono select-none">Press ⌘K to search...</span>
      </button>

      {/* Command Palette Modal */}
      <CommandPalette isOpen={isSearchOpen} setIsOpen={setIsSearchOpen} />

      {/* Right controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-text-2 font-medium bg-surface-2 px-2.5 py-1 rounded-full border border-border">
          <Globe className="w-3.5 h-3.5 text-ok animate-pulse" />
          <span>All Systems Operational</span>
        </div>
        
        {/* Dynamic Notifications Popover */}
        <NotificationsPopover />
      </div>
    </header>
  )
}

