"use client";
import { useState, useEffect } from "react";
import { Code2, FolderOpen, Copy, Check, Eye, EyeOff } from "lucide-react";
import { Github } from "@/components/ui/GithubIcon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Toggle } from "@/components/ui/Toggle";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { apiFetch } from "@/lib/utils";
import { useProjects } from "@/lib/projects-context";

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
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
  );
}

const getScriptCode = (
  key: string,
) => `<script src="https://cdn.vigil.dev/sdk.js" defer></script>
<script>
  Vigil.init({
    projectKey: "${key}",
    environment: "production",
    release: "1.0.0", // Replace with your release/version
  });
</script>`;

const getNpmCode = (key: string) => `npm install @vigil/sdk

// In your app entry point:
import { Vigil } from "@vigil/sdk";
Vigil.init({ projectKey: "${key}" });`;

function CopyBtn({
  text,
  id,
  copied,
  onCopy,
}: {
  text: string;
  id: string;
  copied: string | null;
  onCopy: (text: string, id: string) => void;
}) {
  const isCopied = copied === id;
  return (
    <button
      onClick={() => text && onCopy(text, id)}
      disabled={!text}
      className={`flex items-center gap-1.5 text-xs transition-colors ${
        !text
          ? "opacity-40 cursor-not-allowed text-text-3"
          : "text-text-3 hover:text-accent cursor-pointer"
      }`}
    >
      {isCopied ? (
        <Check className="w-3.5 h-3.5 text-ok" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
      {isCopied ? "Copied!" : "Copy"}
    </button>
  );
}

interface GitHubStatus {
  connected: boolean;
  connectionStatus?:
    "active" | "expired" | "revoked" | "rate_limited" | "error";
  githubUsername?: string;
  lastError?: string;
  repoSelected?: boolean;
  defaultRepo?: string | null;
  hasGithubLogin: boolean;
}

interface GitHubRepo {
  owner: string;
  name: string;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
}

export function SettingsForm() {
  const { activeProject } = useProjects();
  const [keyVisible, setKeyVisible] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // GitHub Integration States
  const [integrationStatus, setIntegrationStatus] =
    useState<GitHubStatus | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);

  // Settings States
  const [autoRaise, setAutoRaise] = useState(false);
  const [followUp, setFollowUp] = useState(false);
  const [severity, setSeverity] = useState<"P0" | "P0+P1">("P0");
  const [conf, setConf] = useState(90);
  const [triageModel, setTriageModel] = useState("nvidia/nemotron-3-ultra-550b-a55b:free");

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  // Load configuration and connection status on mount or when active project changes
  useEffect(() => {
    if (!activeProject) return;

    async function loadGitHubStatus() {
      try {
        const res = await apiFetch(
          `/api/v1/github/status?projectId=${activeProject!.id}`,
        );
        if (res.ok) {
          const { data } = await res.json();
          setIntegrationStatus(data);

          if (data.connected && !data.repoSelected) {
            loadRepos();
          }
        }
      } catch (err) {
        console.error("Failed to fetch GitHub integration status:", err);
      }
    }

    async function loadRepos() {
      setReposLoading(true);
      try {
        const res = await apiFetch(
          `/api/v1/github/repos?projectId=${activeProject!.id}`,
        );
        if (res.ok) {
          const { data } = await res.json();
          setRepos(data);
        }
      } catch (err) {
        console.error("Failed to load GitHub repositories:", err);
      } finally {
        setReposLoading(false);
      }
    }

    async function loadProjectSettings() {
      try {
        const res = await apiFetch(`/api/v1/projects/${activeProject!.id}`);
        if (res.ok) {
          const { data } = await res.json();
          setAutoRaise(data.githubAutoRaiseEnabled);
          setSeverity(data.githubAutoRaiseSeverity as "P0" | "P0+P1");
          setConf(Math.round((data.githubAutoRaiseMinConfidence ?? 0.9) * 100));
          setFollowUp(data.githubCommentEnabled);
          if (data.triageModel) setTriageModel(data.triageModel);
        }
      } catch (err) {
        console.error("Failed to load project details:", err);
      }
    }

    setIntegrationStatus(null);
    setRepos([]);
    loadGitHubStatus();
    loadProjectSettings();
  }, [activeProject]);

  const loadRepos = async () => {
    if (!activeProject) return;
    setReposLoading(true);
    try {
      const res = await apiFetch(
        `/api/v1/github/repos?projectId=${activeProject.id}`,
      );
      if (res.ok) {
        const { data } = await res.json();
        setRepos(data);
      }
    } catch (err) {
      console.error("Failed to load repositories:", err);
    } finally {
      setReposLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!activeProject) return;
    try {
      const res = await apiFetch(
        `/api/v1/github/connect?projectId=${activeProject.id}`,
      );
      if (res.ok) {
        const { data } = await res.json();
        window.location.href = data.authorizeUrl;
      }
    } catch (err) {
      console.error("Failed to initiate connect:", err);
    }
  };

  const handleDisconnect = async () => {
    if (!activeProject) return;
    if (
      !confirm(
        "Are you sure you want to disconnect GitHub? This will delete all repository settings.",
      )
    )
      return;
    try {
      const res = await apiFetch(
        `/api/v1/github/disconnect?projectId=${activeProject.id}`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        setIntegrationStatus((prev) =>
          prev
            ? {
                ...prev,
                connected: false,
                repoSelected: false,
                defaultRepo: null,
              }
            : null,
        );
      }
    } catch (err) {
      console.error("Failed to disconnect:", err);
    }
  };

  const handleSelectRepo = async (repoFullName: string) => {
    if (!activeProject) return;
    const repo = repos.find((r) => r.fullName === repoFullName);
    if (!repo) return;

    try {
      const res = await apiFetch("/api/v1/github/select-repo", {
        method: "POST",
        body: JSON.stringify({
          projectId: activeProject.id,
          repoOwner: repo.owner,
          repoName: repo.name,
          fullName: repo.fullName,
          isPrivate: repo.isPrivate,
          defaultBranch: repo.defaultBranch,
        }),
      });

      if (res.ok) {
        setIntegrationStatus((prev) =>
          prev
            ? { ...prev, repoSelected: true, defaultRepo: repo.fullName }
            : null,
        );
      }
    } catch (err) {
      console.error("Failed to select repository:", err);
    }
  };

  const saveSettings = async (updates: {
    autoRaiseEnabled?: boolean;
    autoRaiseSeverity?: string;
    autoRaiseMinConfidence?: number;
    commentEnabled?: boolean;
    triageModel?: string;
  }) => {
    if (!activeProject) return;

    const payload: Record<string, unknown> = {
      projectId: activeProject.id,
      autoRaiseEnabled:
        updates.autoRaiseEnabled !== undefined
          ? updates.autoRaiseEnabled
          : autoRaise,
      autoRaiseSeverity:
        updates.autoRaiseSeverity !== undefined
          ? updates.autoRaiseSeverity
          : severity,
      autoRaiseMinConfidence:
        (updates.autoRaiseMinConfidence !== undefined
          ? updates.autoRaiseMinConfidence
          : conf) / 100,
      commentEnabled:
        updates.commentEnabled !== undefined
          ? updates.commentEnabled
          : followUp,
    };

    if (updates.triageModel !== undefined) {
      payload.triageModel = updates.triageModel;
    }

    try {
      await apiFetch("/api/v1/github/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader
        title="Settings"
        subtitle="Manage configuration, API keys, and repository integrations."
      />

      <Section
        icon={Code2}
        title="SDK Installation"
        description="Add Vigil to your app with one script tag or npm package."
      >
        {!activeProject ? (
          <div className="flex flex-col items-center justify-center py-6 px-4 border border-dashed border-border rounded-2xl bg-surface-2 text-center">
            <p className="text-sm font-semibold text-text-2 mb-1">
              No Project Selected
            </p>
            <p className="text-xs text-text-3 max-w-sm">
              Please select or create a project from the sidebar to view
              integration snippets and retrieve API keys.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">
              Via Script Tag
            </p>
            <CodeBlock
              label="html"
              code={getScriptCode(activeProject.publicKey)}
            />
            <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2 mt-5">
              Via NPM
            </p>
            <CodeBlock
              label="typescript"
              code={getNpmCode(activeProject.publicKey)}
            />
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">
                Project Key
              </p>
              <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-2 border border-border rounded-xl">
                <span className="font-mono text-sm text-text-1 flex-1 truncate">
                  {keyVisible
                    ? activeProject.publicKey
                    : `pk_live_${"•".repeat(16)}`}
                </span>
                <button
                  onClick={() => setKeyVisible((v) => !v)}
                  aria-label={
                    keyVisible ? "Hide project key" : "Show project key"
                  }
                  className="text-text-3 hover:text-accent transition-colors cursor-pointer"
                >
                  {keyVisible ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
                <CopyBtn
                  text={activeProject.publicKey}
                  id="key"
                  copied={copied}
                  onCopy={copy}
                />
              </div>
            </div>
          </>
        )}
      </Section>

      <Section
        icon={Github}
        title="GitHub Integration"
        description="Connect a repository to auto-raise issues from Vigil's dashboard."
      >
        {!activeProject ? (
          <div className="text-center py-4 text-xs text-text-3">
            Please select a project to manage integrations.
          </div>
        ) : !integrationStatus ? (
          <div className="text-xs text-text-3 py-2 animate-pulse">
            Loading GitHub integration status...
          </div>
        ) : (
          <>
            {integrationStatus.connected ? (
              integrationStatus.repoSelected ? (
                <div className="flex flex-col gap-2.5 mb-5">
                  <div className="flex items-center justify-between p-4 bg-surface-2 border border-border rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <Github className="w-5 h-5 text-accent" />
                      <div>
                        <p className="text-sm font-semibold text-text-1">
                          {integrationStatus.defaultRepo}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              integrationStatus.connectionStatus === "active"
                                ? "bg-ok"
                                : integrationStatus.connectionStatus ===
                                    "rate_limited"
                                  ? "bg-p2"
                                  : "bg-p0"
                            }`}
                          />
                          <span className="text-xxs font-semibold text-text-2 uppercase tracking-wider">
                            {integrationStatus.connectionStatus === "active"
                              ? "Connected"
                              : integrationStatus.connectionStatus ===
                                  "rate_limited"
                                ? "Rate Limited"
                                : integrationStatus.connectionStatus ===
                                    "expired"
                                  ? "Connection Expired"
                                  : "Error"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleDisconnect}
                      className="text-xs text-p0 hover:text-red-800 font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>
                  {integrationStatus.lastError && (
                    <div className="p-3 bg-p0-bg border border-red-200 text-p0 text-xs font-mono rounded-xl break-all">
                      <strong>Connection Error:</strong>{" "}
                      {integrationStatus.lastError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-surface-2 border border-border rounded-xl mb-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-2 font-medium">
                      GitHub Account:{" "}
                      <strong>{integrationStatus.githubUsername}</strong>
                    </span>
                    <button
                      onClick={handleDisconnect}
                      className="text-xs text-text-3 hover:text-p0 font-medium transition-colors px-2 py-1 rounded-md hover:bg-red-50 cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>
                  {reposLoading ? (
                    <div className="text-xs text-text-3 py-2 animate-pulse">
                      Loading repositories...
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold text-text-3 uppercase tracking-wider">
                        Select Target Repository
                      </label>
                      <div className="flex gap-2">
                        <select
                          onChange={(e) => handleSelectRepo(e.target.value)}
                          defaultValue=""
                          className="flex-1 px-4 py-2.5 text-sm bg-surface border border-border rounded-xl text-text-1 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                        >
                          <option value="" disabled>
                            -- Select a repository --
                          </option>
                          {repos.map((r) => (
                            <option key={r.fullName} value={r.fullName}>
                              {r.fullName}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={loadRepos}
                          className="px-3 text-xs bg-surface-2 border border-border hover:bg-surface hover:text-accent rounded-xl font-medium transition-colors cursor-pointer"
                        >
                          Reload
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="flex flex-col gap-3 py-2 mb-5">
                <p className="text-sm text-text-3">
                  {integrationStatus.hasGithubLogin
                    ? "You are signed in to Vigil with GitHub. Link a repository to start tracking and raising issues."
                    : "Link your GitHub account to automatically raise and track issues from Vigil's dashboard."}
                </p>
                <button
                  onClick={handleConnect}
                  className="flex items-center gap-2 self-start bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2.5 rounded-xl cursor-pointer transition-colors shadow-sm"
                >
                  <Github className="w-4 h-4 text-white" />
                  {integrationStatus.hasGithubLogin
                    ? "Connect Repository"
                    : "Connect GitHub"}
                </button>
              </div>
            )}

            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-1">
                    Auto-raise Issues
                  </p>
                  <p className="text-xs text-text-3 mt-0.5">
                    Automatically raise GitHub issues for high-severity bugs
                  </p>
                </div>
                <Toggle
                  checked={autoRaise}
                  onChange={() => {
                    const val = !autoRaise;
                    setAutoRaise(val);
                    saveSettings({ autoRaiseEnabled: val });
                  }}
                />
              </div>

              {autoRaise && (
                <div className="space-y-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2.5">
                      Severity Threshold
                    </p>
                    <div className="flex gap-3">
                      {(["P0", "P0+P1"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            setSeverity(s);
                            saveSettings({ autoRaiseSeverity: s });
                          }}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all cursor-pointer
                            ${
                              severity === s
                                ? "bg-accent-light border-accent text-accent"
                                : "bg-surface border-border text-text-2 hover:border-accent/40"
                            }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${severity === s ? "bg-accent" : "bg-border"}`}
                          />
                          {s} only
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-text-3">
                        Micro-Triage Confidence
                      </p>
                      <span className="text-sm font-bold font-mono text-accent">
                        {conf}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={50}
                        max={100}
                        value={conf}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) setConf(val);
                        }}
                        onMouseUp={() =>
                          saveSettings({ autoRaiseMinConfidence: conf })
                        }
                        onTouchEnd={() =>
                          saveSettings({ autoRaiseMinConfidence: conf })
                        }
                        className="flex-1 accent-accent cursor-pointer"
                      />
                      <input
                        type="number"
                        min={50}
                        max={100}
                        value={conf}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) setConf(val);
                        }}
                        onBlur={() => {
                          const val = Math.min(100, Math.max(50, conf));
                          setConf(val);
                          saveSettings({ autoRaiseMinConfidence: val });
                        }}
                        className="w-16 text-center text-sm font-mono border border-border rounded-lg
                                   py-1.5 bg-surface text-text-1 focus:outline-none focus:ring-2
                                   focus:ring-accent/30 focus:border-accent"
                      />
                      <span className="text-sm text-text-2">%</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div>
                  <p className="text-sm font-semibold text-text-1">
                    AI Follow-up Comments
                  </p>
                  <p className="text-xs text-text-3 mt-0.5">
                    Post batched comments when more sessions hit the same issue
                  </p>
                </div>
                <Toggle
                  checked={followUp}
                  onChange={() => {
                    const val = !followUp;
                    setFollowUp(val);
                    saveSettings({ commentEnabled: val });
                  }}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <label className="text-xs font-semibold uppercase tracking-wider text-text-3 block mb-2">
                AI Triage Model
              </label>
              <p className="text-xs text-text-3 mb-2.5">
                Model used for AI triage analysis.
              </p>
              <div className="px-4 py-2.5 text-sm bg-surface-2 border border-border rounded-xl text-text-3 font-mono font-medium select-all">
                nvidia/nemotron-3-ultra-550b-a55b:free
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 font-medium flex items-center gap-1">
                <span>⚠</span> Custom model switching is currently in development.
              </p>
            </div>
          </>
        )}
      </Section>

      <Section
        icon={FolderOpen}
        title="Project Details"
        description="General project attributes and naming config."
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-text-3 block mb-1.5">
              Project Name
            </label>
            <input
              value={activeProject?.name || ""}
              readOnly
              className="w-full px-4 py-2.5 text-sm bg-surface border border-border rounded-xl
                         text-text-1 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all opacity-75 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-text-3 block mb-1.5">
              Project ID
            </label>
            <div className="px-4 py-2.5 text-sm font-mono bg-surface-2 border border-border rounded-xl text-text-3 select-all">
              {activeProject?.id || "..."}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-text-3 block mb-1.5">
              Created
            </label>
            <div className="px-4 py-2.5 text-sm bg-surface-2 border border-border rounded-xl text-text-3">
              {activeProject?.createdAt
                ? new Date(activeProject.createdAt).toLocaleDateString()
                : "..."}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
