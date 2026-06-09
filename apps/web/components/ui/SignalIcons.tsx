/**
 * @file SignalIcons.tsx
 * @description Visual icons showing connectivity or warning states.
 * @why UI indicators for session lifecycle events.
 */

import { AlertTriangle, WifiOff, MousePointerClick, MousePointer } from "lucide-react"

interface Signals {
  has_js_error: boolean; has_network_err: boolean
  has_rage_click: boolean; has_dead_click: boolean
}

export function SignalIcons({ signals }: { signals: Signals }) {
  return (
    <div className="flex items-center gap-1.5">
      {signals.has_js_error    && <span title="JS Error"><AlertTriangle      className="w-3.5 h-3.5 text-p1" /></span>}
      {signals.has_network_err && <span title="Network Error"><WifiOff            className="w-3.5 h-3.5 text-p0" /></span>}
      {signals.has_rage_click  && <span title="Rage Click"><MousePointerClick  className="w-3.5 h-3.5 text-p2" /></span>}
      {signals.has_dead_click  && <span title="Dead Click"><MousePointer       className="w-3.5 h-3.5 text-text-3" /></span>}
      {!signals.has_js_error && !signals.has_network_err && !signals.has_rage_click && !signals.has_dead_click && (
        <span className="text-xs text-text-3">—</span>
      )}
    </div>
  )
}
