/**
 * @file utils.ts
 * @description General helper methods for UI formatting.
 * @why Standardizes time durations, severity mappings, and text formatting.
 */

export function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24)   return `${hours}h ago`
  return `${days}d ago`
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

export function formatTimestamp(ms: number): string {
  const s = (ms / 1000).toFixed(1)
  return `+${s}s`
}

export function severityColor(s: string) {
  const map: Record<string, { text: string; bg: string; border: string; dot: string; accent: string }> = {
    P0: { text: "text-p0",  bg: "bg-p0-bg",  border: "border-red-200",    dot: "bg-p0",  accent: "border-l-p0"  },
    P1: { text: "text-p1",  bg: "bg-p1-bg",  border: "border-orange-200", dot: "bg-p1",  accent: "border-l-p1"  },
    P2: { text: "text-p2",  bg: "bg-p2-bg",  border: "border-yellow-200", dot: "bg-p2",  accent: "border-l-p2"  },
    P3: { text: "text-p3",  bg: "bg-p3-bg",  border: "border-slate-200",  dot: "bg-p3",  accent: "border-l-p3"  },
  }
  return map[s] ?? map.P3
}
