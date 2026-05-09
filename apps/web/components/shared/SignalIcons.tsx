import { Zap, AlertTriangle, MousePointerClick, Wifi, Navigation, Terminal, MousePointer } from "lucide-react";
import type { EventType } from "@/lib/types";

const iconMap: Record<EventType, { icon: React.ElementType; color: string; label: string }> = {
  js_error:      { icon: AlertTriangle,      color: "text-p1",    label: "JS Error" },
  rage_click:    { icon: Zap,                color: "text-p2",    label: "Rage Click" },
  network_error: { icon: Wifi,               color: "text-p0",    label: "Network Error" },
  dead_click:    { icon: MousePointerClick,  color: "text-p3",    label: "Dead Click" },
  navigation:    { icon: Navigation,         color: "text-text-2", label: "Navigation" },
  click:         { icon: MousePointer,       color: "text-text-3", label: "Click" },
  console_error: { icon: Terminal,           color: "text-p1",    label: "Console Error" },
};

export function SignalIcon({ type, size = 14 }: { type: EventType; size?: number }) {
  const { icon: Icon, color } = iconMap[type];
  return <Icon size={size} className={color} />;
}

export function SignalLabel({ type }: { type: EventType }) {
  return iconMap[type].label;
}

export { iconMap };
