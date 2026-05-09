"use client";
import { Play, Pause, Maximize2 } from "lucide-react";
import { useState } from "react";
import { formatTimestampOffset } from "@/lib/utils";
import type { EventSummary } from "@/lib/types";

export function ReplayPlayer({ duration_ms, events }: { duration_ms: number; events: EventSummary[] }) {
  const [playing, setPlaying] = useState(false);
  const totalSecs = Math.floor(duration_ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const totalLabel = `${mins}:${String(secs).padStart(2, "0")}`;

  const issueEvents = events.filter(e => ["js_error", "rage_click", "network_error"].includes(e.type));

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Fake browser viewport */}
      <div className="relative bg-[#0a0a0c] h-64 border-b border-border overflow-hidden">
        {/* Browser chrome bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 border-b border-border">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-p0/40" />
            <div className="w-2.5 h-2.5 rounded-full bg-p2/40" />
            <div className="w-2.5 h-2.5 rounded-full bg-success/40" />
          </div>
          <div className="flex-1 bg-bg rounded px-2 py-0.5 text-[10px] font-mono text-text-3 mx-2">
            https://checkout-app.vercel.app/checkout
          </div>
        </div>

        {/* Fake page content */}
        <div className="p-4 space-y-3 opacity-40">
          <div className="h-3 bg-surface-2 rounded w-1/3" />
          <div className="h-2 bg-surface-2 rounded w-2/3" />
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="h-20 bg-surface-2 rounded" />
            <div className="h-20 bg-surface-2 rounded" />
            <div className="h-20 bg-surface-2 rounded" />
          </div>
          <div className="h-8 bg-accent/20 rounded w-1/4 mt-4" />
        </div>

        {/* Issue markers overlay */}
        <div className="absolute bottom-2 left-4 right-4 flex gap-2">
          {issueEvents.map(ev => (
            <div
              key={ev.id}
              className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-p0/80 text-white border border-p0/50"
              title={ev.error_message ?? ev.type}
            >
              {formatTimestampOffset(ev.timestamp_ms)}
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 bg-surface">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPlaying(!playing)}
            className="w-8 h-8 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors flex-shrink-0"
          >
            {playing ? <Pause size={14} className="text-white" /> : <Play size={14} className="text-white ml-0.5" />}
          </button>

          {/* Timeline scrubber */}
          <div className="flex-1 relative">
            <div className="h-1.5 bg-surface-2 rounded-full relative">
              <div className="absolute top-0 left-0 h-full w-[8%] bg-accent rounded-full" />
              {/* Issue markers */}
              {issueEvents.map(ev => (
                <div
                  key={ev.id}
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-p0 border border-bg cursor-pointer"
                  style={{ left: `${(ev.timestamp_ms / duration_ms) * 100}%` }}
                  title={ev.error_message ?? ev.type}
                />
              ))}
            </div>
          </div>

          <span className="font-mono text-xs text-text-2 flex-shrink-0">0:12 / {totalLabel}</span>

          {/* Speed */}
          <select className="text-xs bg-surface-2 border border-border rounded px-1.5 py-0.5 text-text-2 focus:outline-none">
            <option>0.5x</option>
            <option selected>1x</option>
            <option>2x</option>
          </select>

          <button className="text-text-3 hover:text-text-1 transition-colors">
            <Maximize2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
