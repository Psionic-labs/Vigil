"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"
import { ProjectsProvider } from "@/lib/projects-context"

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/sign-in" || pathname === "/sign-up";

  if (isAuthPage) {
    return (
      <main className="flex-1 h-screen overflow-y-auto bg-slate-950">
        {children}
      </main>
    );
  }

  return (
    <ProjectsProvider>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-bg">
          {children}
        </main>
      </div>
    </ProjectsProvider>
  );
}
