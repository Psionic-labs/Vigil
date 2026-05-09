import { formatTimestampOffset } from "@/lib/utils";
import { SignalIcon } from "@/components/shared/SignalIcons";
import type { EventSummary } from "@/lib/types";

export function EvidenceTimeline({ events }: { events: EventSummary[] }) {
  return (
    <div className="space-y-1">
      {events.map((ev) => (
        <div key={ev.id} className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-surface-2 transition-colors group">
          <span className="font-mono text-[10px] text-text-3 w-12 flex-shrink-0 pt-0.5">
            {formatTimestampOffset(ev.timestamp_ms)}
          </span>
          <div className="flex-shrink-0 pt-0.5">
            <SignalIcon type={ev.type} size={13} />
          </div>
          <div className="flex-1 min-w-0">
            {ev.type === "js_error" && (
              <div>
                <p className="text-xs text-p1 font-mono truncate">{ev.error_message}</p>
                {ev.error_stack && (
                  <details className="mt-1">
                    <summary className="text-[10px] text-text-3 cursor-pointer hover:text-text-2">stack trace</summary>
                    <pre className="mt-1 text-[10px] font-mono text-text-3 whitespace-pre-wrap leading-relaxed bg-surface-2 p-2 rounded">
                      {ev.error_stack}
                    </pre>
                  </details>
                )}
              </div>
            )}
            {ev.type === "network_error" && (
              <p className="text-xs font-mono">
                <span className="text-text-3">{ev.network_method} </span>
                <span className="text-text-1">{ev.network_url}</span>
                {ev.network_status && (
                  <span className={`ml-2 ${ev.network_status >= 500 ? "text-p0" : ev.network_status >= 400 ? "text-p1" : "text-text-2"}`}>
                    → {ev.network_status}
                  </span>
                )}
              </p>
            )}
            {ev.type === "rage_click" && (
              <p className="text-xs font-mono text-p2">
                Rage clicked <span className="text-text-1">{ev.target}</span>
                {ev.click_count && <span className="text-text-3"> ×{ev.click_count}</span>}
              </p>
            )}
            {ev.type === "dead_click" && (
              <p className="text-xs font-mono text-p3">
                Dead click on <span className="text-text-1">{ev.target}</span>
              </p>
            )}
            {ev.type === "navigation" && (
              <p className="text-xs font-mono text-text-2">
                Navigated to <span className="text-text-1">{ev.nav_to}</span>
              </p>
            )}
            {ev.type === "click" && (
              <p className="text-xs font-mono text-text-3">
                Clicked <span className="text-text-2">{ev.target}</span>
              </p>
            )}
            {ev.type === "console_error" && (
              <p className="text-xs font-mono text-p1">{ev.error_message}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
