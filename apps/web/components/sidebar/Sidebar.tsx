"use client";
import { AlertTriangle, Activity, Settings, ChevronDown, Shield } from "lucide-react";
import { NavItem } from "./NavItem";
import { MOCK_PROJECT } from "@/lib/mock-data";

export function Sidebar() {
  return (
    <aside className="w-[240px] flex-shrink-0 h-screen sticky top-0 flex flex-col bg-surface border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-accent/20 border border-accent/30 flex items-center justify-center">
          <Shield size={14} className="text-accent" />
        </div>
        <span className="font-bold text-text-1 tracking-tight">Vigil</span>
        <span className="ml-auto text-[10px] font-mono text-text-3 bg-surface-2 px-1.5 py-0.5 rounded border border-border">
          v0.1
        </span>
      </div>

      {/* Project switcher */}
      <div className="px-3 py-3 border-b border-border">
        <button className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-surface-2 border border-border hover:border-text-3 transition-colors text-sm text-text-1">
          <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
          <span className="truncate text-xs">{MOCK_PROJECT.name}</span>
          <ChevronDown size={12} className="ml-auto text-text-3 flex-shrink-0" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        <NavItem href="/issues" icon={<AlertTriangle size={14} />} label="Issues" />
        <NavItem href="/sessions" icon={<Activity size={14} />} label="Sessions" />
        <NavItem href="/settings" icon={<Settings size={14} />} label="Settings" />
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-border pt-3">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
            D
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-text-1 truncate">dev@acme.io</span>
            <span className="text-[10px] text-text-3">Owner</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
