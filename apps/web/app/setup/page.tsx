/**
 * @file page.tsx
 * @description Dedicated SDK setup/installation instructions page.
 * @why Enables developers to easily retrieve setup code snippets and configure Vigil SDK in their apps.
 */

"use client"
import { useState } from "react"
import { Code2, Terminal, Copy, Check, Eye, EyeOff } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { CodeBlock } from "@/components/ui/CodeBlock"
import { useProjects } from "@/lib/projects-context"

const getScriptCode = (key: string) => `<script src="https://cdn.usevigilhq.com/sdk/v1/vigil.min.js"></script>
<script>
  Vigil.init({
    projectKey: "${key}",
    endpoint: "http://localhost:3001/api/v1/ingest", // Remove this parameter in production
    environment: "production",
    release: "1.0.0"
  });
</script>`

const getNpmCode = (key: string) => `npm install @vigil/sdk

// In your app entry point (e.g. index.js or main.tsx):
import { init } from "@vigil/sdk";

init({
  projectKey: "${key}",
  endpoint: "http://localhost:3001/api/v1/ingest", // Remove this parameter in production
  environment: "production",
  release: "1.0.0"
});`

export default function SetupPage() {
  const { activeProject } = useProjects()
  const [keyVisible, setKeyVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyKey = async () => {
    if (!activeProject) return
    try {
      await navigator.clipboard.writeText(activeProject.publicKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy project key:", err)
    }
  }

  if (!activeProject) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto flex items-center justify-center min-h-[50vh]">
        <div className="text-center bg-surface border border-border p-8 rounded-2xl max-w-md shadow-sm">
          <p className="text-sm font-semibold text-text-2 mb-2">No Project Selected</p>
          <p className="text-xs text-text-3">
            Please select or create a project from the sidebar to view setup instructions and retrieve API keys.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-up">
      <PageHeader
        title="Setup Guide"
        subtitle="Follow these steps to integrate the Vigil SDK and start tracking session replays and errors."
      />

      <div className="space-y-6">
        {/* Project Key Section */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-text-1 mb-1.5">Project Key</h2>
          <p className="text-xs text-text-3 mb-4">
            Use this key to authenticate your SDK payload calls. Keep your keys secure.
          </p>
          
          <div className="flex items-center gap-3 px-4 py-3 bg-surface-2 border border-border rounded-xl">
            <span className="font-mono text-sm text-text-1 flex-1 truncate select-all">
              {keyVisible ? activeProject.publicKey : `pk_live_${"•".repeat(16)}`}
            </span>
            <button
              onClick={() => setKeyVisible(!keyVisible)}
              className="text-text-3 hover:text-accent transition-colors cursor-pointer"
              aria-label={keyVisible ? "Hide project key" : "Show project key"}
            >
              {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={handleCopyKey}
              className="flex items-center gap-1.5 text-xs text-text-3 hover:text-accent transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-ok" />
                  <span className="text-ok font-medium">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* CDN Script Tag */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-6 h-6 rounded-md bg-accent-light flex items-center justify-center text-accent">
              <Code2 className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-sm font-semibold text-text-1">Option 1: Integration via HTML Script Tag</h2>
          </div>
          <p className="text-xs text-text-3 mb-4">
            Best for simple static websites, WordPress, or HTML layouts. Load the CDN script and call init.
          </p>
          <CodeBlock label="html" code={getScriptCode(activeProject.publicKey)} />
        </div>

        {/* NPM Package */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-6 h-6 rounded-md bg-accent-light flex items-center justify-center text-accent">
              <Terminal className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-sm font-semibold text-text-1">Option 2: Integration via Package Manager (NPM/Yarn/PNPM)</h2>
          </div>
          <p className="text-xs text-text-3 mb-4">
            Best for modern frameworks like React, Next.js, Vue, or Angular.
          </p>
          <CodeBlock label="typescript" code={getNpmCode(activeProject.publicKey)} />
        </div>

        {/* Config Options Reference */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-text-1 mb-4">Configuration Reference</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-text-3 uppercase tracking-wider font-semibold">
                  <th className="py-2.5 px-2">Parameter</th>
                  <th className="py-2.5 px-2">Type</th>
                  <th className="py-2.5 px-2">Default</th>
                  <th className="py-2.5 px-2">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-text-2">
                <tr>
                  <td className="py-3 px-2 font-mono font-medium text-accent">projectKey</td>
                  <td className="py-3 px-2">string</td>
                  <td className="py-3 px-2">—</td>
                  <td className="py-3 px-2">Required. Authenticates telemetry calls to your project group.</td>
                </tr>
                <tr>
                  <td className="py-3 px-2 font-mono font-medium text-accent">endpoint</td>
                  <td className="py-3 px-2">string</td>
                  <td className="py-3 px-2">cloud service URL</td>
                  <td className="py-3 px-2">Optional. Use for custom or self-hosted API endpoints.</td>
                </tr>
                <tr>
                  <td className="py-3 px-2 font-mono font-medium text-accent">environment</td>
                  <td className="py-3 px-2">string</td>
                  <td className="py-3 px-2">&quot;production&quot;</td>
                  <td className="py-3 px-2">Tag sessions with environment (e.g. development, production).</td>
                </tr>
                <tr>
                  <td className="py-3 px-2 font-mono font-medium text-accent">release</td>
                  <td className="py-3 px-2">string</td>
                  <td className="py-3 px-2">—</td>
                  <td className="py-3 px-2">App release version. Correlates errors with specific deploys.</td>
                </tr>
                <tr>
                  <td className="py-3 px-2 font-mono font-medium text-accent">maskAllInputs</td>
                  <td className="py-3 px-2">boolean</td>
                  <td className="py-3 px-2">true</td>
                  <td className="py-3 px-2">Obscures all user inputs automatically in session replays to protect PII.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
