"use client";
import { useState } from "react";
import { AlertTriangle, Activity, Settings, ChevronDown, Shield, LayoutDashboard, Menu, X } from "lucide-react";
import { NavItem } from "./NavItem";
import { MOCK_PROJECT, MOCK_ISSUES } from "@/lib/mock-data";

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const openIssuesCount = MOCK_ISSUES.filter(i => i.status === "open" || i.status === "linked").length;

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-surface sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-accent/20 border border-accent/30 flex items-center justify-center shadow-inner">
            <Shield size={12} className="text-accent" />
          </div>
          <span className="font-bold text-text-1">Vigil</span>
        </div>
        <button 
          onClick={() => setIsOpen(true)}
          className="p-1 -mr-1 text-text-2 hover:text-text-1"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-bg/80 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-[240px] flex-shrink-0 flex flex-col bg-surface border-r border-border transform transition-transform duration-200 ease-in-out
        md:relative md:translate-x-0 md:h-screen md:sticky md:top-0
        ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        {/* Mobile Close Button (only visible on mobile when open) */}
        <div className="md:hidden absolute top-3 right-3">
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1 text-text-3 hover:text-text-1 bg-surface-2 rounded-md border border-border"
          >
            <X size={16} />
          </button>
        </div>

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border mt-8 md:mt-0">
          <div className="w-7 h-7 rounded-md bg-accent/20 border border-accent/30 flex items-center justify-center shadow-inner">
            <Shield size={14} className="text-accent" />
          </div>
          <span className="font-bold text-text-1 tracking-tight">Vigil</span>
          <span className="ml-auto text-[10px] font-mono text-text-3 bg-surface-2 px-1.5 py-0.5 rounded border border-border">
            v0.1
          </span>
        </div>

        {/* Project switcher */}
        <div className="px-3 py-3 border-b border-border">
          <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-2 border border-border/50 hover:border-border hover:shadow-sm transition-all text-sm text-text-1 group">
            <span className="w-2 h-2 rounded-full bg-success flex-shrink-0 shadow-[0_0_6px_rgba(var(--success),0.4)]" />
            <span className="truncate text-xs font-medium">{MOCK_PROJECT.name}</span>
            <ChevronDown size={12} className="ml-auto text-text-3 flex-shrink-0 group-hover:text-text-2 transition-colors" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <div onClick={() => setIsOpen(false)}><NavItem href="/" icon={<LayoutDashboard size={14} />} label="Overview" /></div>
          <div onClick={() => setIsOpen(false)}><NavItem href="/issues" icon={<AlertTriangle size={14} />} label="Issues" badge={openIssuesCount} /></div>
          <div onClick={() => setIsOpen(false)}><NavItem href="/sessions" icon={<Activity size={14} />} label="Sessions" /></div>
          
          <div className="pt-4 pb-2">
            <div className="h-px w-full bg-border/50" />
          </div>
          
          <div onClick={() => setIsOpen(false)}><NavItem href="/settings" icon={<Settings size={14} />} label="Settings" /></div>
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
    </>
  );
}
