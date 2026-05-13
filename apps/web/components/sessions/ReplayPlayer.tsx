"use client";

import { useState } from "react";
import { Play, Pause, AlertCircle, MousePointer2 } from "lucide-react";
import type { Session } from "@/lib/types";

interface ReplayPlayerProps {
  session: Session;
}

export function ReplayPlayer({ session }: ReplayPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 100

  // Mock events for the timeline based on session
  const events = [
    { id: 1, time: "00:02", type: "nav", message: `Navigated to ${session.url}` },
    { id: 2, time: "00:15", type: "click", message: "Clicked 'Add to Cart'" },
    ...(session.has_js_error || session.has_network_err ? [{ id: 3, time: "00:22", type: "error", message: "Exception captured during session" }] : []),
    { id: 4, time: "00:45", type: "click", message: "User abandoned or navigated away" },
  ];

  return (
    <div className="flex h-full flex-col lg:flex-row overflow-hidden border border-ui-3 bg-ui-1 rounded-xl shadow-sm">
      {/* Player Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Video Canvas Placeholder */}
        <div className="flex-1 bg-[#1A1A1A] flex items-center justify-center relative overflow-hidden">
          {/* Mock cursor */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 ease-in-out">
             <MousePointer2 className="w-6 h-6 text-white drop-shadow-md" fill="currentColor" />
          </div>
          
          <div className="text-center z-10 px-4">
            <div className="text-text-3 font-mono text-xs mb-2">VIEWPORT: {session.screen_width} × {session.screen_height}</div>
            <div className="text-text-2 text-sm max-w-sm mx-auto">
              This is a placeholder for the Session Replay canvas. In production, this area plays back DOM mutations.
            </div>
          </div>

          {/* Grid pattern background for canvas */}
          <div 
            className="absolute inset-0 opacity-[0.03] pointer-events-none" 
            style={{ backgroundImage: 'linear-gradient(var(--ui-3) 1px, transparent 1px), linear-gradient(90deg, var(--ui-3) 1px, transparent 1px)', backgroundSize: '20px 20px' }} 
          />
        </div>

        {/* Controls */}
        <div className="h-16 border-t border-ui-3 bg-ui-2 flex items-center px-4 gap-4 shrink-0">
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-ui-3 hover:bg-ui-4 transition-colors text-text-1 shrink-0"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
          </button>
          
          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs font-mono text-text-3 w-10 text-right shrink-0">00:00</span>
            <div className="flex-1 h-2 bg-ui-3 rounded-full overflow-hidden relative cursor-pointer">
              <div 
                className="absolute top-0 left-0 bottom-0 bg-blue-500 rounded-full transition-all duration-200"
                style={{ width: `${isPlaying ? 45 : progress}%` }}
              />
            </div>
            <span className="text-xs font-mono text-text-3 w-10 shrink-0">
              0{Math.floor(session.duration_ms / 60000)}:{String(Math.floor((session.duration_ms % 60000) / 1000)).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Event Timeline */}
      <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-ui-3 bg-ui-1 flex flex-col shrink-0">
        <div className="p-4 border-b border-ui-3 shrink-0">
          <h3 className="font-semibold text-text-1">Session Timeline</h3>
          <p className="text-xs text-text-3 mt-1">Key events and errors</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px]">
          {events.map((event, i) => (
            <div key={event.id} className="flex gap-3 relative">
              {i !== events.length - 1 && (
                <div className="absolute left-[9px] top-6 bottom-[-16px] w-[2px] bg-ui-3" />
              )}
              <div className="relative z-10 w-5 h-5 mt-0.5 shrink-0 flex items-center justify-center rounded-full bg-bg border border-ui-3">
                {event.type === 'error' ? (
                  <AlertCircle className="w-3 h-3 text-red-500" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-ui-4" />
                )}
              </div>
              <div className="pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-text-3">{event.time}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-text-3">{event.type}</span>
                </div>
                <p className="text-sm text-text-2">{event.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
