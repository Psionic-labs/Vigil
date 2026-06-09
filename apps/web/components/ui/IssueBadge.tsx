/**
 * @file IssueBadge.tsx
 * @description Small badge showing issue severity and priority labels.
 * @why Enhances scanability of issue lists.
 */

import { severityColor } from "@/lib/utils"

export function IssueBadge({ severity }: { severity: string }) {
  const c = severityColor(severity)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                      text-xs font-bold border whitespace-nowrap
                      ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
      {severity}
    </span>
  )
}
