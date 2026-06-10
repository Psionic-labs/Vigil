/**
 * @file page.tsx
 * @description Details view of a single recorded session with event timelines.
 * @why Inspects what a user did leading up to a specific error.
 */

"use client"
import { use, useEffect, useState, useRef } from "react"
import { IssueBadge } from "@/components/ui/IssueBadge"
import { FrictionBar } from "@/components/ui/FrictionBar"
import { formatRelativeTime, formatDuration, formatTimestamp } from "@/lib/utils"
import { ArrowLeft, Pause, Play, MonitorPlay } from "lucide-react"
import Link from "next/link"
import { Session } from "@/lib/mock-data"

interface LinkedIssue {
  id: string
  title: string
  severity: "P0" | "P1" | "P2" | "P3"
}

interface TimelineEvent {
  type: string
  timestamp_ms: number
  target?: string
  error_message?: string
  error_stack?: string
  network_url?: string
  network_status?: number
  network_method?: string
  click_count?: number
  nav_to?: string
}

interface SessionDetail extends Session {
  project_id: string
  linkedIssues: LinkedIssue[]
  timeline: TimelineEvent[]
}

const eventTypeLabel: Record<string, string> = {
  navigation:    "Navigated to",
  click:         "Clicked",
  rage_click:    "Rage clicked",
  dead_click:    "Dead click on",
  network_error: "Network error",
  js_error:      "JS Error",
  console_error: "Console error",
}
const eventColor: Record<string, string> = {
  navigation:    "bg-accent-light border-accent/20 text-accent",
  click:         "bg-surface-2 border-border text-text-2",
  rage_click:    "bg-p2-bg border-yellow-200 text-p2",
  dead_click:    "bg-surface-2 border-border text-text-3",
  network_error: "bg-p0-bg border-red-200 text-p0",
  js_error:      "bg-p1-bg border-orange-200 text-p1",
  console_error: "bg-surface-2 border-border text-text-3",
}

interface RrwebEvent {
  type: number
  data: unknown
  timestamp: number
}

interface RrwebReplayerInstance {
  wrapper?: HTMLDivElement
  iframe?: HTMLIFrameElement
  destroy?: () => void
  play?: (timeOffset?: number) => void
  pause?: (timeOffset?: number) => void
  getCurrentTime?: () => number
  getTimeOffset?: () => number
  getMetaData?: () => { startTime: number; endTime: number; totalTime: number }
  on?: (event: string, handler: (...args: unknown[]) => void) => RrwebReplayerInstance
  setConfig?: (config: Record<string, unknown>) => void
}

function renderReplayError(container: HTMLElement, title: string, message: string) {
  const wrapper = document.createElement("div")
  wrapper.className = "p-5 text-sm font-mono text-p0 bg-p0-bg border border-red-200 rounded-xl max-w-md mx-auto text-center"

  const heading = document.createElement("div")
  heading.textContent = title

  const detail = document.createElement("span")
  detail.className = "text-xs text-text-3 mt-2 block"
  detail.textContent = message

  wrapper.append(heading, detail)
  container.replaceChildren(wrapper)
}

function fitReplayToContainer(container: HTMLElement, replayer: RrwebReplayerInstance) {
  if (!replayer.wrapper || !replayer.iframe) return

  const frameWidth = Number(replayer.iframe.getAttribute("width") || replayer.iframe.width || 0)
  const frameHeight = Number(replayer.iframe.getAttribute("height") || replayer.iframe.height || 0)
  if (!frameWidth || !frameHeight) return

  const scale = Math.min(
    container.clientWidth / frameWidth,
    container.clientHeight / frameHeight,
    1
  )

  replayer.wrapper.style.flex = "0 0 auto"
  replayer.wrapper.style.transform = `scale(${scale})`
  replayer.wrapper.style.transformOrigin = "center center"
  replayer.wrapper.style.background = "white"
  replayer.wrapper.style.boxShadow = "0 18px 40px rgba(15, 23, 42, 0.12)"
}

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [isDataLoading, setIsDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const playerContainerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<RrwebReplayerInstance | null>(null)
  const [events, setEvents] = useState<RrwebEvent[]>([])
  const [isEventsLoading, setIsEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [isReplayPlaying, setIsReplayPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    if (!isReplayPlaying) return
    const player = playerRef.current
    if (!player || !player.getCurrentTime) return
    let rafId: number
    const tick = () => {
      const t = player.getCurrentTime!()
      setCurrentTime(t)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isReplayPlaying])

  useEffect(() => {
    setIsDataLoading(true)
    setIsEventsLoading(true)
    setError(null)
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
    
    fetch(`${API_BASE_URL}/api/v1/sessions/${id}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404 || res.status === 401) {
            throw new Error("Session not found or unauthorized")
          }
          throw new Error("Failed to fetch session details")
        }
        return res.json()
      })
      .then((json) => {
        setSession(json.data || null)
      })
      .catch((err) => {
        console.error("Failed to load session:", err)
        setError(err.message || "Failed to load session")
      })
      .finally(() => {
        setIsDataLoading(false)
      })

    setEventsError(null)
    fetch(`${API_BASE_URL}/api/v1/sessions/${id}/events`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to fetch replay events");
        }
        return res.json();
      })
      .then((json) => {
        if (!json.ok) {
          throw new Error(json.error || "Failed to load replay events");
        }
        setEvents(json.events || [])
      })
      .catch((err) => {
        console.error("Failed to load replay events:", err)
        setEventsError(err.message || "Failed to load replay events")
      })
      .finally(() => {
        setIsEventsLoading(false)
      })
  }, [id])

  useEffect(() => {
    if (typeof window === "undefined" || events.length === 0 || !playerContainerRef.current) {
      return
    }

    const container = playerContainerRef.current
    let active = true
    let resizeObserver: ResizeObserver | null = null

    const teardownPlayer = () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy?.()
        } catch (e) {
          console.warn("Failed to destroy replay player:", e)
        }
        playerRef.current = null
      }
      setIsReplayPlaying(false)
    }

    import("rrweb").then((module) => {
      if (!active || !container) return

      try {
        teardownPlayer()

        container.replaceChildren()
        const replayStage = document.createElement("div")
        replayStage.className = "absolute inset-0 flex items-center justify-center overflow-hidden bg-white"
        container.append(replayStage)

        type ReplayerConstructor = new (events: RrwebEvent[], config: Record<string, unknown>) => RrwebReplayerInstance
        const ReplayerClass = module.Replayer as ReplayerConstructor

        if (!ReplayerClass) {
          throw new Error("rrweb Replayer export was not found")
        }

        const player = new ReplayerClass(events, {
          root: replayStage,
          speed: 1,
          skipInactive: true,
          showWarning: true,
          showDebug: false,
          mouseTail: false,
          triggerFocus: false,
          UNSAFE_replayCanvas: true,
        })

        player.on?.("finish", () => {
          setIsReplayPlaying(false)
          try {
            player.pause?.(0)
          } catch (err) {
            console.warn("Failed to reset replay after finish:", err)
          }
        })

        playerRef.current = player

        const resize = () => fitReplayToContainer(container, player)
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(container)

        requestAnimationFrame(() => {
          if (!active || playerRef.current !== player) return
          try {
            player.pause?.(0)
            resize()
            const iframeText = player.iframe?.contentDocument?.body?.innerText?.trim()
            if (!iframeText) {
              console.warn("Replay iframe mounted but did not expose body text", {
                eventCount: events.length,
                meta: player.getMetaData?.(),
                iframeWidth: player.iframe?.getAttribute("width"),
                iframeHeight: player.iframe?.getAttribute("height"),
              })
            }
          } catch (err) {
            console.warn("Failed to initialize replay first frame:", err)
          }
        })
      } catch (err) {
        console.error("Failed to initialize rrweb replay:", err)
        if (active) {
          const message = err instanceof Error ? err.message : "Unknown replay initialization error"
          renderReplayError(container, "Failed to initialize session replay", message)
        }
      }
    }).catch(err => {
      console.error("Failed to load rrweb replay:", err)
      if (active && container) {
        renderReplayError(container, "Failed to load session replay", err.message)
      }
    })

    return () => {
      active = false
      resizeObserver?.disconnect()
      teardownPlayer()
      if (container) {
        container.replaceChildren()
      }
    }
  }, [events])

  const changePlaybackSpeed = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const speed = parseFloat(e.target.value)
    setPlaybackSpeed(speed)
    playerRef.current?.setConfig?.({ speed })
  }

  const toggleReplayPlayback = () => {
    const player = playerRef.current
    if (!player) return

    try {
      if (isReplayPlaying) {
        player.pause?.()
        setIsReplayPlaying(false)
      } else {
        player.play?.(player.getTimeOffset?.() ?? 0)
        setIsReplayPlaying(true)
      }
    } catch (err) {
      console.error("Failed to toggle replay playback:", err)
      setEventsError(err instanceof Error ? err.message : "Failed to control replay playback")
      setIsReplayPlaying(false)
    }
  }

  if (isDataLoading) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto flex items-center justify-center min-h-[50vh]">
        <p className="text-text-3 font-mono text-sm animate-pulse">Loading session details...</p>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-p0 font-mono text-sm mb-4">{error || "Session not found."}</p>
        <Link href="/sessions" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Sessions
        </Link>
      </div>
    )
  }

  const linkedIssues = session.linkedIssues || []
  
  const displayUrl = session.url.startsWith("http://") || session.url.startsWith("https://")
    ? session.url
    : `https://example.com${session.url.startsWith("/") ? "" : "/"}${session.url}`

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <Link href="/sessions" className="inline-flex items-center gap-1.5 text-sm text-text-3
                                        hover:text-accent transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to Sessions
      </Link>

      {/* Replay player */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden mb-6">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-2 border-b border-border">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-400 animate-pulse" />
            <span className="w-3 h-3 rounded-full bg-yellow-400" />
            <span className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 bg-surface border border-border rounded-md px-3 py-1 text-xs font-mono text-text-3 truncate">
            {displayUrl}
          </div>
          <span className="text-xs font-mono text-text-3">{session.screen_width}×{session.screen_height}</span>
        </div>

        {/* Viewport */}
        <div className="aspect-video bg-slate-50 relative overflow-hidden flex items-center justify-center min-h-[300px] md:min-h-[500px]">
          {isEventsLoading ? (
            <div className="flex flex-col items-center gap-3 text-text-3">
              <p className="text-sm font-medium animate-pulse">Loading replay events...</p>
            </div>
          ) : eventsError ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <div className="flex flex-col items-center gap-3 max-w-md bg-p0-bg/30 border border-p0/20 p-5 rounded-2xl">
                <p className="text-sm font-semibold text-p0">Replay Reconstruction Error</p>
                <p className="text-xs text-text-2 font-mono leading-relaxed">{eventsError}</p>
              </div>
            </div>
          ) : events.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-text-3">
                <MonitorPlay className="w-10 h-10" />
                <p className="text-sm font-medium">Session replay will render here</p>
                <p className="text-xs">rrweb · {formatDuration(session.duration_ms)}</p>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 w-full h-full" ref={playerContainerRef} />
          )}
        </div>

        {/* Controls */}
        {(!isEventsLoading && !eventsError) && (
          <div className="px-4 py-3 bg-surface-2 border-t border-border">
            <div className="flex items-center gap-3 mb-2.5">
              <button
                type="button"
                onClick={events.length > 0 ? toggleReplayPlayback : undefined}
                disabled={events.length === 0}
                className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent-dark transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isReplayPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <span className="font-mono text-xs text-text-3">
                {events.length > 0 ? `${events.length} replay events` : "0 replay events"} · {formatDuration(session.duration_ms)}
              </span>
              <select className="ml-auto text-xs bg-surface border border-border rounded-lg px-2 py-1 text-text-2 cursor-pointer" value={playbackSpeed} onChange={changePlaybackSpeed}>
                <option value="0.5">0.5×</option>
                <option value="1">1×</option>
                <option value="2">2×</option>
              </select>
            </div>
            {/* Scrubber */}
            <div
              className="relative h-2 bg-surface-2 rounded-full border border-border overflow-hidden cursor-pointer group"
              onClick={(e) => {
                const player = playerRef.current
                if (!player || !player.play || !session) return
                const rect = e.currentTarget.getBoundingClientRect()
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                const targetTime = ratio * session.duration_ms
                player.play(targetTime)
                setIsReplayPlaying(true)
              }}
            >
              <div
                className="absolute left-0 top-0 h-full bg-accent rounded-full transition-[width] duration-75"
                style={{ width: `${session.duration_ms > 0 ? Math.min((currentTime / session.duration_ms) * 100, 100) : 0}%` }}
              />
              {(session.timeline || [])
                .filter((e: TimelineEvent) => e.type === "network_error" || e.type === "js_error" || e.type === "rage_click")
                .map((ev: TimelineEvent, i: number) => (
                  <div key={i}
                    className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm
                      ${ev.type === "network_error" || ev.type === "js_error" ? "bg-p0" : "bg-p2"}`}
                    style={{ left: `${session.duration_ms > 0 ? Math.min((ev.timestamp_ms / session.duration_ms) * 100, 95) : 0}%` }}
                    title={ev.type}
                  />
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">

        {/* AI Analysis */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-accent-light flex items-center justify-center">
              <span className="text-accent text-xs font-bold">✦</span>
            </div>
            <p className="text-sm font-semibold text-text-1">AI Session Analysis</p>
          </div>
          <p className="text-sm text-text-2 leading-relaxed mb-5">{session.ai_session_summary}</p>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-surface-2 rounded-xl border border-border p-4">
              <p className="text-xs text-text-3 mb-1">Friction Score</p>
              <FrictionBar score={session.ai_friction_score} />
            </div>
            <div className="bg-surface-2 rounded-xl border border-border p-4">
              <p className="text-xs text-text-3 mb-1">Goal Completion</p>
              <p className={`text-sm font-semibold ${session.ai_goal_completed ? "text-ok" : "text-p0"}`}>
                {session.ai_goal_completed ? "✓ Goal Met" : "✕ Goal Failed"}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            {[
              { label: "Release",     value: session.release },
              { label: "Commit",      value: session.commit_sha, mono: true },
              { label: "Duration",    value: formatDuration(session.duration_ms) },
              { label: "Started",     value: formatRelativeTime(session.started_at) },
              { label: "Environment", value: session.environment },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-xs text-text-3">{label}</span>
                <span className={`text-xs font-semibold text-text-1 ${mono ? "font-mono" : ""}`}>{value}</span>
              </div>
            ))}
          </div>

          {linkedIssues.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2.5">Linked Issues</p>
              <div className="space-y-2">
                {linkedIssues.map((issue: LinkedIssue) => (
                  <Link key={issue.id} href={`/issues/${issue.id}`}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border
                               hover:border-accent/30 hover:bg-surface-2 transition-all group">
                    <IssueBadge severity={issue.severity} />
                    <span className="text-xs text-text-1 flex-1 truncate group-hover:text-accent transition-colors">
                      {issue.title}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Event timeline */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <p className="text-sm font-semibold text-text-1">Event Timeline</p>
          </div>
          <div className="divide-y divide-border overflow-y-auto max-h-[480px]">
            {(session.timeline || []).map((ev: TimelineEvent, i: number) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium border
                                  shrink-0 ${eventColor[ev.type] ?? eventColor.click}`}>
                  {eventTypeLabel[ev.type] ?? ev.type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-1 leading-relaxed">
                    {ev.nav_to ?? ev.target ?? ev.network_url ?? ev.error_message ?? ""}
                    {ev.network_status && (
                      <span className="ml-1 font-mono font-bold text-p0">→ {ev.network_status}</span>
                    )}
                    {ev.click_count && (
                      <span className="ml-1 text-p2 font-semibold">×{ev.click_count}</span>
                    )}
                  </p>
                </div>
                <span className="font-mono text-xs text-text-3 bg-surface-2 border border-border
                                 px-1.5 py-0.5 rounded shrink-0">
                  {formatTimestamp(ev.timestamp_ms)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
