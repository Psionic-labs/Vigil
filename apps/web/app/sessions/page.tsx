"use client";

import { useState, useMemo, useEffect } from "react";
import { MOCK_SESSIONS } from "@/lib/mock-data";
import { SessionRow } from "@/components/sessions/SessionRow";
import { Skeleton } from "@/components/shared/Skeleton";
import { Search, X } from "lucide-react";

const SORT_OPTIONS = ["Date", "Friction Score", "Issue Count", "Duration"];
const FILTER_CHIPS = ["All", "Has Issues", "Goal Failed", "Has JS Error", "Has Rage Click", "Production only"];

export default function SessionsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Date");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const filteredAndSortedSessions = useMemo(() => {
    // 1. Filter
    let result = MOCK_SESSIONS.filter((session) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !session.id.toLowerCase().includes(q) &&
          !session.url.toLowerCase().includes(q) &&
          !session.ai_session_summary?.toLowerCase().includes(q)
        ) {
          return false;
        }
      }

      // Chip Filter
      switch (activeFilter) {
        case "Has Issues":
          if (session.issue_instance_count === 0 && session.error_count === 0) return false;
          break;
        case "Goal Failed":
          if (session.ai_goal_completed !== false) return false;
          break;
        case "Has JS Error":
          if (!session.has_js_error) return false;
          break;
        case "Has Rage Click":
          if (!session.has_rage_click) return false;
          break;
        case "Production only":
          if (session.environment !== "production") return false;
          break;
      }
      
      return true;
    });

    // 2. Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "Date":
          return b.started_at - a.started_at;
        case "Friction Score":
          return (b.ai_friction_score || 0) - (a.ai_friction_score || 0);
        case "Issue Count":
          return (b.issue_instance_count || 0) - (a.issue_instance_count || 0);
        case "Duration":
          return (b.duration_ms || 0) - (a.duration_ms || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [activeFilter, sortBy, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border sticky top-0 bg-bg z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-text-1">Sessions</h1>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-surface text-text-2 border border-border">
            {filteredAndSortedSessions.length} total
          </span>
        </div>
        
        <div className="flex-1" />

        {/* Search */}
        <div className="relative w-64 hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
          <input 
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-border rounded-md pl-9 pr-4 py-1.5 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort */}
        <select 
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="text-sm bg-surface border border-border rounded-md text-text-2 px-2 py-1.5 focus:outline-none focus:border-accent"
        >
          {SORT_OPTIONS.map(o => <option key={o} value={o}>Sort: {o}</option>)}
        </select>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border overflow-x-auto">
        {FILTER_CHIPS.map((chip) => {
          const isActive = activeFilter === chip;
          return (
            <button 
              key={chip} 
              onClick={() => setActiveFilter(chip)}
              className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors ${
                isActive 
                  ? "bg-accent/10 text-accent border-accent/30 font-medium" 
                  : "text-text-2 border-border hover:border-text-3 hover:text-text-1 bg-surface/50"
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[900px]">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="border-b border-border shadow-sm">
              {["Session ID", "URL", "Friction", "Goal", "Issues", "Signals", "Duration", "Env", "Started", ""].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-text-3 uppercase tracking-wider whitespace-nowrap bg-surface">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-4" /></td>
                </tr>
              ))
            ) : filteredAndSortedSessions.length > 0 ? (
              filteredAndSortedSessions.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))
            ) : (
              <tr>
                <td colSpan={10}>
                  <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                    <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mb-3">
                      <Search className="w-5 h-5 text-text-3" />
                    </div>
                    <h3 className="text-sm font-medium text-text-1 mb-1">No sessions found</h3>
                    <p className="text-xs text-text-2 max-w-sm mb-4">
                      We couldn't find any sessions matching your current filters and search query.
                    </p>
                    <button 
                      onClick={() => {
                        setActiveFilter("All");
                        setSearchQuery("");
                      }}
                      className="text-xs font-medium text-white bg-accent px-3 py-1.5 rounded-md hover:bg-accent/90 transition-colors"
                    >
                      Clear filters
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
