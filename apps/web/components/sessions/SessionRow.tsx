import Link from "next/link";
import { ArrowRight, CheckCircle, XCircle, AlertTriangle, Wifi, Zap, MousePointerClick } from "lucide-react";
import { FrictionBar } from "./FrictionBar";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { formatDuration } from "@/lib/utils";
import type { Session } from "@/lib/types";

export function SessionRow({ session }: { session: Session }) {
  return (
    <tr className="border-b border-border hover:bg-surface-2 transition-colors group stagger-item">
      <td className="px-4 py-3 font-mono text-xs text-text-2">{session.id}</td>
      <td className="px-4 py-3 text-xs text-text-1 max-w-[140px] truncate">{session.url}</td>
      <td className="px-4 py-3 w-36"><FrictionBar score={session.ai_friction_score} /></td>
      <td className="px-4 py-3 text-xs">
        {session.ai_goal_completed
          ? <CheckCircle size={14} className="text-success" />
          : <XCircle size={14} className="text-text-3" />}
      </td>
      <td className="px-4 py-3 text-xs">
        {session.issue_group_count > 0
          ? <span className="font-mono px-1.5 py-0.5 rounded bg-p0/10 text-p0 border border-p0/20">{session.issue_group_count}</span>
          : <span className="text-text-3 font-mono">—</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {session.has_js_error && <span title="JS Error"><AlertTriangle size={11} className="text-p1" /></span>}
          {session.has_rage_click && <span title="Rage Click"><Zap size={11} className="text-p2" /></span>}
          {session.has_network_err && <span title="Network Error"><Wifi size={11} className="text-p0" /></span>}
          {session.has_dead_click && <span title="Dead Click"><MousePointerClick size={11} className="text-p3" /></span>}
          {!session.has_js_error && !session.has_rage_click && !session.has_network_err && !session.has_dead_click && (
            <span className="text-text-3 text-xs">—</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-text-2">{formatDuration(session.duration_ms)}</td>
      <td className="px-4 py-3 text-xs">
        {session.environment ? (
          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${
            session.environment === "production" ? "bg-success/10 text-success border-success/20" :
            session.environment === "preview" ? "bg-p2/10 text-p2 border-p2/20" :
            "bg-surface-2 text-text-3 border-border"
          }`}>
            {session.environment}
          </span>
        ) : <span className="text-text-3">—</span>}
      </td>
      <td className="px-4 py-3"><RelativeTime unixMs={session.started_at} /></td>
      <td className="px-4 py-3">
        <Link href={`/sessions/${session.id}`} className="opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowRight size={14} className="text-accent" />
        </Link>
      </td>
    </tr>
  );
}
