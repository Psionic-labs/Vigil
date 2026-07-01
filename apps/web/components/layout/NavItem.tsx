/**
 * @file NavItem.tsx
 * @description Renders sidebar navigational links.
 * @why Unified styling for link navigation.
 */

"use client"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"

interface NavItemProps {
  href: string
  label: string
  icon: LucideIcon
  isActive: boolean
  badge?: number
}

export function NavItem({ href, label, icon: Icon, isActive, badge }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium
        ${isActive
          ? "bg-sidebar-active text-white shadow-sm"
          : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
        }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
          ${isActive ? "bg-white/20 text-white" : "bg-surface-2 text-text-2"}`}>
          {badge}
        </span>
      )}
    </Link>
  )
}
