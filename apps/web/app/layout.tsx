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
import { LayoutWrapper } from "@/components/layout/LayoutWrapper"

export const metadata: Metadata = {
  title: "Vigil — AI Bug Triage",
  description: "AI-native session triage for developers",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
          try {
            const theme = localStorage.getItem('theme');
            if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          } catch (_) {}
        ` }} />
      </head>
      <body className="flex h-screen overflow-hidden bg-bg font-sans antialiased" suppressHydrationWarning>
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  )
}
