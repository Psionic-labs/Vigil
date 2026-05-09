import { Search } from "lucide-react";
import { MOCK_ISSUES } from "@/lib/mock-data";
import { IssueRow } from "@/components/issues/IssueRow";
import type { Severity, IssueStatus } from "@/lib/types";

const SEVERITIES: Severity[] = ["P0", "P1", "P2", "P3"];

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
  const openCount = MOCK_ISSUES.filter(i => i.status === "open" || i.status === "linked").length;

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
            className="pl-8 pr-3 py-1.5 text-sm bg-surface border border-border rounded-md text-text-1 placeholder:text-text-3 focus:outline-none focus:border-accent transition-colors w-56"
          />
        </div>

        {/* Sort */}
        <select className="text-sm bg-surface border border-border rounded-md text-text-2 px-2 py-1.5 focus:outline-none focus:border-accent">
          <option>Sort: Severity</option>
          <option>Sort: Affected Sessions</option>
          <option>Sort: Last Seen</option>
          <option>Sort: Confidence</option>
        </select>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border overflow-x-auto">
        {FILTER_CHIPS.map((chip, i) => (
          <button
            key={chip.key}
            className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors ${
              i === 0
                ? "bg-accent/10 text-accent border-accent/30"
                : "bg-transparent text-text-2 border-border hover:border-text-3 hover:text-text-1"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto">
        {MOCK_ISSUES.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-text-3">
            <div className="text-4xl">✓</div>
            <p className="text-sm">No issues found. Your app is looking clean.</p>
          </div>
        ) : (
          <div className="animate-fade-in">
            {MOCK_ISSUES.map((issue, i) => (
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
