"use client"
import { useState } from "react"
import { Code2, FolderOpen, Copy, Check, Eye, EyeOff } from "lucide-react"
import { Github } from "@/components/ui/GithubIcon"
import { PageHeader } from "@/components/ui/PageHeader"
import { Toggle } from "@/components/ui/Toggle"
import { CodeBlock } from "@/components/ui/CodeBlock"

function Section({ icon: Icon, title, description, children }: {
  icon: React.ElementType; title: string; description: string; children: React.ReactNode
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden mb-6">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface-2">
        <div className="w-8 h-8 rounded-xl bg-accent-light flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-1">{title}</p>
          <p className="text-xs text-text-3">{description}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

const KEY = "pk_live_vg_c8f2a91d3e4b5f6a"

const SCRIPT_CODE = `<script src="https://cdn.vigil.dev/sdk.js" defer></script>
<script>
  Vigil.init({
    projectKey: "pk_live_vg_c8f2a91d3e4b5f6a",
    environment: "production",
    release: process.env.NEXT_PUBLIC_RELEASE,
  });
</script>`

const NPM_CODE = `npm install @vigil/sdk

// In your app entry point:
import { Vigil } from "@vigil/sdk";
Vigil.init({ projectKey: "pk_live_vg_c8f2a91d3e4b5f6a" });`

export default function SettingsPage() {
  const [keyVisible, setKeyVisible] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [autoRaise, setAutoRaise] = useState(true)
  const [followUp,  setFollowUp]  = useState(true)
  const [severity,  setSeverity]  = useState<"P0" | "P0+P1">("P0+P1")
  const [conf,      setConf]      = useState(90)

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <button onClick={() => copy(text, id)}
      className="flex items-center gap-1.5 text-xs text-text-3 hover:text-accent transition-colors cursor-pointer">
      {copied === id
        ? <Check className="w-3.5 h-3.5 text-ok" />
        : <Copy className="w-3.5 h-3.5" />}
      {copied === id ? "Copied!" : "Copy"}
    </button>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader title="Settings" subtitle="Manage configuration, API keys, and repository integrations." />

      <Section icon={Code2} title="SDK Installation" description="Add Vigil to your app with one script tag or npm package.">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">Via Script Tag</p>
        <CodeBlock label="html" code={SCRIPT_CODE} />
        <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2 mt-5">Via NPM</p>
        <CodeBlock label="typescript" code={NPM_CODE} />
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">Project Key</p>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-2 border border-border rounded-xl">
            <span className="font-mono text-sm text-text-1 flex-1 truncate">
              {keyVisible ? KEY : `pk_live_${"•".repeat(16)}`}
            </span>
            <button onClick={() => setKeyVisible(v => !v)} className="text-text-3 hover:text-accent transition-colors cursor-pointer">
              {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <CopyBtn text={KEY} id="key" />
          </div>
        </div>
      </Section>

      <Section icon={Github} title="GitHub Integration" description="Connect a repository to auto-raise issues from Vigil's dashboard.">
        <div className="flex items-center justify-between p-4 bg-surface-2 border border-border rounded-xl mb-5">
          <div className="flex items-center gap-3">
            <Github className="w-4 h-4 text-text-2" />
            <div>
              <p className="text-sm font-semibold text-text-1">acme/checkout-app</p>
              <span className="text-xs font-semibold text-ok bg-ok-bg border border-green-200 px-2 py-0.5 rounded-full">
                Connected
              </span>
            </div>
          </div>
          <button className="text-xs text-p0 hover:text-red-800 font-medium transition-colors
                             px-3 py-1.5 rounded-lg hover:bg-red-50 cursor-pointer">
            Disconnect
          </button>
        </div>

        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text-1">Auto-raise Issues</p>
              <p className="text-xs text-text-3 mt-0.5">Automatically raise GitHub issues for high-severity bugs</p>
            </div>
            <Toggle checked={autoRaise} onChange={() => setAutoRaise(v => !v)} />
          </div>

          {autoRaise && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2.5">Severity Threshold</p>
                <div className="flex gap-3">
                  {(["P0", "P0+P1"] as const).map(s => (
                    <button key={s} onClick={() => setSeverity(s)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all cursor-pointer
                        ${severity === s
                          ? "bg-accent-light border-accent text-accent"
                          : "bg-surface border-border text-text-2 hover:border-accent/40"}`}>
                      <span className={`w-2 h-2 rounded-full ${severity === s ? "bg-accent" : "bg-border"}`} />
                      {s} only
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-3">Micro-Triage Confidence</p>
                  <span className="text-sm font-bold font-mono text-accent">{conf}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <input type="range" min={50} max={100} value={conf}
                    onChange={e => setConf(Number(e.target.value))}
                    className="flex-1 accent-accent cursor-pointer" />
                  <input type="number" min={50} max={100} value={conf}
                    onChange={e => setConf(Math.min(100, Math.max(50, Number(e.target.value))))}
                    className="w-16 text-center text-sm font-mono border border-border rounded-lg
                               py-1.5 bg-surface text-text-1 focus:outline-none focus:ring-2
                               focus:ring-accent/30 focus:border-accent" />
                  <span className="text-sm text-text-2">%</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div>
              <p className="text-sm font-semibold text-text-1">AI Follow-up Comments</p>
              <p className="text-xs text-text-3 mt-0.5">Post batched comments when more sessions hit the same issue</p>
            </div>
            <Toggle checked={followUp} onChange={() => setFollowUp(v => !v)} />
          </div>
        </div>
      </Section>

      <Section icon={FolderOpen} title="Project Details" description="General project attributes and naming config.">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-text-3 block mb-1.5">Project Name</label>
            <input defaultValue="Checkout App"
              className="w-full px-4 py-2.5 text-sm bg-surface border border-border rounded-xl
                         text-text-1 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-text-3 block mb-1.5">Project ID</label>
            <div className="px-4 py-2.5 text-sm font-mono bg-surface-2 border border-border rounded-xl text-text-3 select-all">
              proj_a1b2c3
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
