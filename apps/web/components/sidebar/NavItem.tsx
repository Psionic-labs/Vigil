"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-100 ${
        active
          ? "bg-accent/10 text-accent border border-accent/20"
          : "text-text-2 hover:text-text-1 hover:bg-surface-2"
      }`}
    >
      <span className="w-4 h-4 flex-shrink-0">{icon}</span>
      {label}
    </Link>
  );
}
