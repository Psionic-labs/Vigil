"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, Eye, EyeOff, GitBranch, Check } from "lucide-react";
import { MOCK_PROJECT } from "@/lib/mock-data";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { useToast } from "@/components/shared/Toast";

const INSTALL_SCRIPT = `<script src="https://cdn.vigil.dev/sdk.js" defer></script>
<script>
  Vigil.init({
    projectKey: "${MOCK_PROJECT.public_key}",
    environment: "production",
    release: process.env.NEXT_PUBLIC_RELEASE,
  });
</script>`;

const INSTALL_NPM = `npm install @vigil/sdk

// In your app entry point:
import { Vigil } from "@vigil/sdk";
Vigil.init({ projectKey: "${MOCK_PROJECT.public_key}" });`;

export default function SettingsPage() {
  const { toast } = useToast();
  const [keyVisible, setKeyVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [autoRaise, setAutoRaise] = useState(MOCK_PROJECT.github_auto_raise_enabled);
  const [aiComments, setAiComments] = useState(MOCK_PROJECT.github_comment_enabled);
  const [connected, setConnected] = useState(true);
  const [severity, setSeverity] = useState(MOCK_PROJECT.github_auto_raise_severity);
  const [confidence, setConfidence] = useState<number | "">(Math.round(MOCK_PROJECT.github_auto_raise_min_confidence * 100));
  const [projectName, setProjectName] = useState(MOCK_PROJECT.name);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confidenceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!navigator.clipboard) {
      const message = "Clipboard access is not available in this browser.";
      setCopied(false);
      setCopyError(message);
      toast(message, "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(MOCK_PROJECT.public_key);
      setCopyError(null);
      setCopied(true);
      toast("Project key copied", "success");
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy project key", error);
      setCopied(false);
      setCopyError("Unable to copy project key.");
      toast("Unable to copy project key", "error");
    }
  };

  const handleDisconnect = () => {
    setConnected(false);
    toast("GitHub repository disconnected", "success");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-6 py-4 border-b border-border sticky top-0 bg-bg z-10">
        <h1 className="text-lg font-bold text-text-1">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-6 py-8 space-y-10">

          {/* SDK Installation */}
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-text-1">SDK Installation</h2>
              <p className="text-sm text-text-2 mt-1">Add Vigil to your app in under 2 minutes.</p>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-text-3 uppercase tracking-wider font-semibold">Via Script Tag</p>
              <CodeBlock code={INSTALL_SCRIPT} language="html" />
            </div>

            <div className="space-y-3">
              <p className="text-xs text-text-3 uppercase tracking-wider font-semibold">Via npm</p>
              <CodeBlock code={INSTALL_NPM} language="typescript" />
            </div>

            {/* Project key */}
            <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
              <p className="text-xs text-text-3 uppercase tracking-wider font-semibold">Project Key</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-surface-2 border border-border rounded-md px-3 py-2 font-mono text-sm">
                  <span className="flex-1 text-text-1">
                    {keyVisible ? MOCK_PROJECT.public_key : "pk_live_" + "•".repeat(16)}
                  </span>
                </div>
                <button onClick={() => setKeyVisible(!keyVisible)} className="p-2 text-text-3 hover:text-text-1 transition-colors">
                  {keyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-surface-2 border border-border text-xs text-text-2 hover:text-text-1 hover:border-text-3 transition-colors">
                  {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              {copyError && <p className="text-xs text-p0">{copyError}</p>}
            </div>
          </section>

          <div className="h-px bg-border" />

          {/* GitHub Integration */}
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-text-1">GitHub Integration</h2>
              <p className="text-sm text-text-2 mt-1">Connect a repo to raise issues directly from Vigil.</p>
            </div>

            {connected ? (
              <div className="space-y-4">
                {/* Connected repo */}
                <div className="rounded-lg border border-border bg-surface p-4 flex items-center gap-3">
                  <GitBranch size={16} className="text-text-1" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-1">{MOCK_PROJECT.github_repo}</p>
                    <p className="text-xs text-success mt-0.5">Connected</p>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="text-xs text-text-3 hover:text-p0 transition-colors px-3 py-1.5 rounded border border-border hover:border-p0/30"
                  >
                    Disconnect
                  </button>
                </div>

                {/* Auto-raise toggle */}
                <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-1">Auto-raise Issues</p>
                      <p className="text-xs text-text-2 mt-0.5">Automatically raise GitHub issues for high-severity bugs</p>
                    </div>
                    <button
                      onClick={() => setAutoRaise(!autoRaise)}
                      role="switch"
                      aria-checked={autoRaise}
                      aria-label="Toggle auto-raise issues"
                      className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${autoRaise ? "bg-accent" : "bg-surface-2 border border-border"}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${autoRaise ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>

                  {autoRaise && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <div className="space-y-2">
                        <p className="text-xs text-text-3">Severity Threshold</p>
                        <div className="flex gap-3">
                          {["P0", "P0+P1"].map(opt => (
                            <label key={opt} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="severity"
                                value={opt}
                                checked={severity === opt}
                                onChange={(e) => setSeverity(e.target.value as typeof severity)}
                                className="accent-accent"
                              />
                              <span className="text-sm text-text-1">{opt} only</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-text-3 font-semibold uppercase tracking-wider">
                            Minimum Confidence <span className="text-[10px] text-text-3 font-normal normal-case">(50% - 100%)</span>
                          </p>
                          <div 
                            onClick={() => confidenceInputRef.current?.focus()}
                            className="flex items-center gap-1 bg-surface border border-border rounded-md px-2 py-1 text-xs cursor-text"
                          >
                            <input
                              ref={confidenceInputRef}
                              type="text"
                              inputMode="numeric"
                              value={confidence}
                              onFocus={(e) => e.target.select()}
                              onDoubleClick={(e) => e.currentTarget.select()}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "") {
                                  setConfidence("" as any);
                                  return;
                                }
                                if (/^\d+$/.test(val)) {
                                  const num = Number(val);
                                  if (num > 100) {
                                    setConfidence(100);
                                  } else if (val.length >= 2 && num < 50) {
                                    setConfidence(50);
                                  } else {
                                    setConfidence(num);
                                  }
                                }
                              }}
                              onBlur={() => {
                                const num = Number(confidence);
                                if (isNaN(num) || num < 50 || confidence === "") {
                                  setConfidence(50);
                                } else if (num > 100) {
                                  setConfidence(100);
                                }
                              }}
                              className="w-8 text-right bg-transparent focus:outline-none font-mono font-semibold text-text-1 selection:bg-accent selection:text-white"
                            />
                            <span className="text-text-3 font-mono font-semibold select-none pointer-events-none">%</span>
                          </div>
                        </div>
                        <input
                          type="range"
                          min={50}
                          max={100}
                          value={confidence === "" ? 50 : confidence}
                          onChange={(e) => setConfidence(Number(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* AI follow-up comments */}
                <div className="rounded-lg border border-border bg-surface p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-1">AI Follow-up Comments</p>
                    <p className="text-xs text-text-2 mt-0.5">Post batched comments when more sessions hit the same issue</p>
                  </div>
                  <button
                    onClick={() => setAiComments(!aiComments)}
                    role="switch"
                    aria-checked={aiComments}
                    aria-label="Toggle AI follow-up comments"
                    className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${aiComments ? "bg-accent" : "bg-surface-2 border border-border"}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${aiComments ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </div>
            ) : (
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-surface border border-border text-sm text-text-1 hover:border-text-3 transition-colors">
                <GitBranch size={14} />
                Connect GitHub
              </button>
            )}
          </section>

          <div className="h-px bg-border" />

          {/* Project Details */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-text-1">Project Details</h2>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs text-text-3 uppercase tracking-wider font-semibold">Project Name</label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-text-3 uppercase tracking-wider font-semibold">Project ID</label>
                <div className="bg-surface-2 border border-border rounded-md px-3 py-2 font-mono text-sm text-text-2">
                  {MOCK_PROJECT.id}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

