"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavItem({ 
  href, 
  icon, 
  label, 
  badge 
}: { 
  href: string; 
  icon: React.ReactNode; 
  label: string;
  badge?: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-100 group ${
        active
          ? "bg-accent/10 text-accent border border-accent/20 font-medium shadow-sm"
          : "text-text-2 hover:text-text-1 hover:bg-surface-2 border border-transparent"
      }`}
    >
      <span className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${active ? "scale-110" : "group-hover:scale-110"}`}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full flex-shrink-0 ${
          active 
            ? "bg-accent/20 text-accent" 
            : "bg-surface-2 text-text-3 group-hover:text-text-2 border border-border"
        }`}>
          {badge}
        </span>
      )}
    </Link>
  );
}
