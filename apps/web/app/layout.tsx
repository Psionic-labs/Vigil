/**
 * @file layout.tsx
 * @description Root layout wrapping Next.js page components with context providers.
 * @why Shared navigation headers, page margins, and fonts.
 */

import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import "rrweb/dist/style.css"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopBar } from "@/components/layout/TopBar"
import { ProjectsProvider } from "@/lib/projects-context"

export const metadata: Metadata = {
  title: "Vigil — AI Bug Triage",
  description: "AI-native session triage for developers",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="flex h-screen overflow-hidden bg-bg font-sans antialiased" suppressHydrationWarning>
        <ProjectsProvider>
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-y-auto bg-bg">
              {children}
            </main>
          </div>
        </ProjectsProvider>
      </body>
    </html>
  )
}
