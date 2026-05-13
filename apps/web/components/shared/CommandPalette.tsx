"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search, LayoutDashboard, AlertCircle, PlaySquare } from "lucide-react";
import { MOCK_ISSUES } from "@/lib/mock-data";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Toggle the menu when ⌘K is pressed or close on ESC
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-bg/80 backdrop-blur-sm transition-opacity"
        onClick={() => setOpen(false)}
      />
      
      {/* Modal */}
      <Command 
        className="relative z-50 w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-bg shadow-2xl flex flex-col"
        label="Global Command Menu"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          }
        }}
      >
        <div className="flex items-center border-b border-border px-4">
          <Search className="mr-3 h-5 w-5 shrink-0 opacity-50" />
          <Command.Input 
            autoFocus
            className="flex h-14 w-full rounded-md bg-transparent py-3 text-base outline-none placeholder:text-text-3 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Type a command or search..." 
          />
          <div className="ml-3 hidden sm:flex h-5 items-center gap-1 rounded border border-border bg-surface-2 px-1.5 font-mono text-[10px] font-medium text-text-3 opacity-100">
            <span>ESC</span>
          </div>
        </div>
        
        <Command.List className="max-h-[60vh] overflow-y-auto overflow-x-hidden p-2">
          <Command.Empty className="py-12 text-center text-sm text-text-3">No results found.</Command.Empty>
          
          <Command.Group heading="Navigation" className="px-2 py-2 text-xs font-medium text-text-3">
            <Command.Item 
              onSelect={() => runCommand(() => router.push("/"))}
              className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2.5 text-sm outline-none aria-selected:bg-surface-2 data-[selected='true']:bg-surface-2 transition-colors"
            >
              <LayoutDashboard className="mr-3 h-4 w-4 text-text-2" />
              <span className="text-text-1">Overview</span>
            </Command.Item>
            <Command.Item 
              onSelect={() => runCommand(() => router.push("/issues"))}
              className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2.5 text-sm outline-none aria-selected:bg-surface-2 data-[selected='true']:bg-surface-2 transition-colors"
            >
              <AlertCircle className="mr-3 h-4 w-4 text-text-2" />
              <span className="text-text-1">Issues</span>
            </Command.Item>
            <Command.Item 
              onSelect={() => runCommand(() => router.push("/sessions"))}
              className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2.5 text-sm outline-none aria-selected:bg-surface-2 data-[selected='true']:bg-surface-2 transition-colors"
            >
              <PlaySquare className="mr-3 h-4 w-4 text-text-2" />
              <span className="text-text-1">Sessions</span>
            </Command.Item>
          </Command.Group>

          <Command.Separator className="h-px bg-border my-1" />

          <Command.Group heading="Issues" className="px-2 py-2 text-xs font-medium text-text-3">
            {MOCK_ISSUES.map(issue => (
              <Command.Item 
                key={issue.id}
                onSelect={() => runCommand(() => router.push(`/issues/${issue.id}`))}
                className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2.5 text-sm outline-none aria-selected:bg-surface-2 data-[selected='true']:bg-surface-2 transition-colors group"
              >
                <div className="flex flex-col gap-1 w-full overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text-1 truncate group-hover:text-accent transition-colors">{issue.title}</span>
                    <span className="text-xs text-text-3 ml-2 shrink-0">{issue.id}</span>
                  </div>
                  <span className="text-xs text-text-3 truncate">{issue.root_cause}</span>
                </div>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
