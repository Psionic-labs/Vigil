export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${rem}s`;
}

export function formatRelativeTime(unixMs: number): string {
  const diff = Math.max(0, Date.now() - unixMs);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function formatTimestampOffset(ms: number): string {
  const sign = ms >= 0 ? "+" : "";
  const s = (ms / 1000).toFixed(1);
  return `${sign}${s}s`;
}

export function frictionColor(score: number): string {
  if (score < 30) return "#22c55e";
  if (score < 60) return "#eab308";
  if (score < 80) return "#f97316";
  return "#ef4444";
}

export function frictionLabel(score: number): string {
  if (score < 30) return "Low friction";
  if (score < 60) return "Medium friction";
  if (score < 80) return "High friction";
  return "Critical friction";
}
