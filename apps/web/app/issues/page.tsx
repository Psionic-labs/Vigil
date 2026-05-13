"use client";

import { useState, useMemo, useEffect } from "react";
import { Search } from "lucide-react";
import { MOCK_ISSUES } from "@/lib/mock-data";
import { IssueRow } from "@/components/issues/IssueRow";
import { Skeleton } from "@/components/shared/Skeleton";
import type { Severity, IssueStatus } from "@/lib/types";

const FILTER_CHIPS = [
  { key: "all", label: "All" },
  { key: "P0", label: "P0" },
  { key: "P1", label: "P1" },
  { key: "P2", label: "P2" },
  { key: "P3", label: "P3" },
  { key: "linked", label: "Linked to GitHub" },
  { key: "ignored", label: "Ignored" },
];

export default function IssuesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortBy, setSortBy] = useState("severity");

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const openCount = MOCK_ISSUES.filter(i => i.status === "open" || i.status === "linked").length;

  const filteredAndSortedIssues = useMemo(() => {
    let result = [...MOCK_ISSUES];

    // 1. Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        i => i.title.toLowerCase().includes(q) || i.root_cause.toLowerCase().includes(q)
      );
    }

    // 2. Filter
    if (activeFilter !== "all") {
      if (["P0", "P1", "P2", "P3"].includes(activeFilter)) {
        result = result.filter(i => i.severity === activeFilter);
      } else if (activeFilter === "linked") {
        result = result.filter(i => i.status === "linked");
      } else if (activeFilter === "ignored") {
        result = result.filter(i => i.status === "ignored");
      }
    }

    // 3. Sort
    result.sort((a, b) => {
      if (sortBy === "severity") {
        const severityWeight = { P0: 4, P1: 3, P2: 2, P3: 1 };
        const aWeight = severityWeight[a.severity] || 0;
        const bWeight = severityWeight[b.severity] || 0;
        if (aWeight !== bWeight) return bWeight - aWeight;
        return b.affected_session_count - a.affected_session_count;
      }
      if (sortBy === "sessions") {
        return b.affected_session_count - a.affected_session_count;
      }
      if (sortBy === "last_seen") {
        return b.last_seen_at - a.last_seen_at;
      }
      if (sortBy === "confidence") {
        return b.confidence - a.confidence;
      }
      return 0;
    });

    return result;
  }, [searchQuery, activeFilter, sortBy]);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border sticky top-0 bg-bg z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-text-1">Issues</h1>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-p0/10 text-p0 border border-p0/20">
            {openCount} open
          </span>
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
          <input
            type="text"
            placeholder="Search issues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm bg-surface border border-border rounded-md text-text-1 placeholder:text-text-3 focus:outline-none focus:border-accent transition-colors w-56"
          />
        </div>

        {/* Sort */}
        <select 
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="text-sm bg-surface border border-border rounded-md text-text-2 px-2 py-1.5 focus:outline-none focus:border-accent"
        >
          <option value="severity">Sort: Severity</option>
          <option value="sessions">Sort: Affected Sessions</option>
          <option value="last_seen">Sort: Last Seen</option>
          <option value="confidence">Sort: Confidence</option>
        </select>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border overflow-x-auto">
        {FILTER_CHIPS.map((chip) => {
          const isActive = activeFilter === chip.key;
          return (
            <button
              key={chip.key}
              onClick={() => setActiveFilter(chip.key)}
              className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors ${
                isActive
                  ? "bg-accent/10 text-accent border-accent/30"
                  : "bg-transparent text-text-2 border-border hover:border-text-3 hover:text-text-1"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="animate-fade-in">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border">
                <Skeleton className="w-10 h-5" />
                <div className="flex-1">
                  <Skeleton className="w-64 h-4 mb-1" />
                  <Skeleton className="w-96 h-3 opacity-60" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="w-12 h-4" />
                  <Skeleton className="w-20 h-4" />
                  <Skeleton className="w-16 h-4" />
                  <Skeleton className="w-8 h-4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredAndSortedIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-text-3">
            <div className="text-4xl">✓</div>
            <p className="text-sm">No issues match your filters.</p>
            {(searchQuery || activeFilter !== "all") && (
              <button 
                onClick={() => { setSearchQuery(""); setActiveFilter("all"); }}
                className="text-xs text-accent hover:underline mt-2"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="animate-fade-in">
            {filteredAndSortedIssues.map((issue, i) => (
              <div
                key={issue.id}
                style={{ animationDelay: `${i * 30}ms` }}
                className="animate-slide-up"
              >
                <IssueRow issue={issue} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
