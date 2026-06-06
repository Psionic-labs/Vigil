import type { LucideIcon } from "lucide-react"

export function EmptyState({ icon: Icon, title, description }: {
  icon: LucideIcon; title: string; description: string
}) {
  return (
    <div className="py-20 flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-2xl bg-accent-light flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-accent" />
      </div>
      <p className="text-sm font-semibold text-text-1">{title}</p>
      <p className="text-xs text-text-3 mt-1.5 max-w-xs leading-relaxed">{description}</p>
    </div>
  )
}
