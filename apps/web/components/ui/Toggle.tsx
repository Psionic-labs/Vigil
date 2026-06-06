"use client"
export function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch" aria-checked={checked} onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200
                  ${checked ? "bg-accent" : "bg-border"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white
                        shadow-sm transition-transform duration-200
                        ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  )
}
