"use client";
import { formatRelativeTime } from "@/lib/utils";
import { useEffect, useState } from "react";

export function RelativeTime({ unixMs }: { unixMs: number }) {
  const [label, setLabel] = useState(formatRelativeTime(unixMs));
  useEffect(() => {
    setLabel(formatRelativeTime(unixMs));
    const t = setInterval(() => setLabel(formatRelativeTime(unixMs)), 30000);
    return () => clearInterval(t);
  }, [unixMs]);
  return <span className="text-text-3 text-xs font-mono">{label}</span>;
}
