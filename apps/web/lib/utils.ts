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

export const eventTypeLabel: Record<string, string> = {
  navigation:    "Navigated to",
  click:         "Clicked",
  rage_click:    "Rage clicked",
  dead_click:    "Dead click on",
  network_error: "Network error",
  js_error:      "JS Error",
  console_error: "Console error",
}

export const eventColor: Record<string, string> = {
  navigation:    "bg-accent-light border-accent/20 text-accent",
  click:         "bg-surface-2 border-border text-text-2",
  rage_click:    "bg-p2-bg border-yellow-200 text-p2",
  dead_click:    "bg-surface-2 border-border text-text-3",
  network_error: "bg-p0-bg border-red-200 text-p0",
  js_error:      "bg-p1-bg border-orange-200 text-p1",
  console_error: "bg-surface-2 border-border text-text-3",
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`
  const headers = new Headers(options.headers)

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const mergedOptions: RequestInit = {
    ...options,
    headers,
    credentials: "include",
  }

  const res = await fetch(url, mergedOptions)

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.location.href = "/sign-in"
    }
  }

  return res
}
