export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 bg-surface border border-border rounded-2xl px-5 py-4 animate-pulse">
      <div className="w-16 h-6 bg-surface-2 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-surface-2 rounded w-1/3" />
        <div className="h-3 bg-surface-2 rounded w-1/2" />
      </div>
      <div className="w-20 h-6 bg-surface-2 rounded shrink-0" />
      <div className="w-12 h-6 bg-surface-2 rounded shrink-0" />
    </div>
  )
}
