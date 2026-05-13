"use client";

import { useMemo } from "react";
import { AlertTriangle, Users, ArrowUpRight, Zap, LayoutDashboard } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/shared/Card";
import { MOCK_ISSUES, MOCK_SESSIONS } from "@/lib/mock-data";
import { IssueRow } from "@/components/issues/IssueRow";
import { SessionRow } from "@/components/sessions/SessionRow";

export default function OverviewDashboard() {
  const stats = useMemo(() => {
    const openIssues = MOCK_ISSUES.filter(i => i.status === "open" || i.status === "linked").length;
    const totalSessions = MOCK_SESSIONS.length;
    const avgFriction = Math.round(
      MOCK_SESSIONS.reduce((acc, s) => acc + (s.ai_friction_score || 0), 0) / MOCK_SESSIONS.length
    );
    const p0Count = MOCK_ISSUES.filter(i => i.severity === "P0" && (i.status === "open" || i.status === "linked")).length;
    const p1Count = MOCK_ISSUES.filter(i => i.severity === "P1" && (i.status === "open" || i.status === "linked")).length;
    const p2Count = MOCK_ISSUES.filter(i => i.severity === "P2" && (i.status === "open" || i.status === "linked")).length;
    const p3Count = MOCK_ISSUES.filter(i => i.severity === "P3" && (i.status === "open" || i.status === "linked")).length;
    
    return { openIssues, totalSessions, avgFriction, p0Count, p1Count, p2Count, p3Count };
  }, []);

  const recentIssues = MOCK_ISSUES.slice(0, 4);
  const recentSessions = MOCK_SESSIONS.slice(0, 3); // Fit in card better

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-bg">
      <div className="px-6 py-6 border-b border-border bg-surface sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center shadow-sm">
            <LayoutDashboard size={16} className="text-text-2" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-1 tracking-tight">Overview Dashboard</h1>
            <p className="text-xs text-text-3 mt-0.5">Here's a summary of your app's health and recent AI triage results.</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-7xl">
        {/* Top Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card variant="elevated">
            <CardHeader className="pb-2 border-none">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-text-2">Open Issues</CardTitle>
                <AlertTriangle size={16} className="text-amber-500" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold text-text-1">{stats.openIssues}</div>
              <div className="text-xs text-text-3 mt-1 flex items-center gap-1">
                <span className="text-success flex items-center"><ArrowUpRight size={12} /> 12%</span> from last week
              </div>
            </CardContent>
          </Card>
          
          <Card variant="elevated">
            <CardHeader className="pb-2 border-none">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-text-2">Avg Friction Score</CardTitle>
                <Zap size={16} className="text-accent" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold text-text-1">{stats.avgFriction}</div>
              <div className="text-xs text-text-3 mt-1 flex items-center gap-1">
                <span className="text-error flex items-center"><ArrowUpRight size={12} /> 4</span> points since latest release
              </div>
            </CardContent>
          </Card>
          
          <Card variant="elevated">
            <CardHeader className="pb-2 border-none">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-text-2">Total Sessions</CardTitle>
                <Users size={16} className="text-text-3" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold text-text-1">{stats.totalSessions}</div>
              <div className="text-xs text-text-3 mt-1 flex items-center gap-1">
                <span className="text-text-2 flex items-center">Last 24 hours</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Breakdown & Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Severity */}
          <div className="lg:col-span-1 space-y-6">
            <Card variant="inset">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Severity Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <SeverityBar label="P0 Critical" count={stats.p0Count} total={stats.openIssues} color="bg-error" />
                <SeverityBar label="P1 High" count={stats.p1Count} total={stats.openIssues} color="bg-amber-500" />
                <SeverityBar label="P2 Medium" count={stats.p2Count} total={stats.openIssues} color="bg-blue-500" />
                <SeverityBar label="P3 Low" count={stats.p3Count} total={stats.openIssues} color="bg-text-3" />
              </CardContent>
            </Card>
            
            <Card variant="accent">
              <CardHeader className="py-3 bg-accent/5">
                <CardTitle className="text-sm text-accent flex items-center gap-2">
                  <Zap size={14} />
                  Vigil AI Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-text-2 space-y-3">
                <p>
                  <strong className="text-text-1">Checkout Friction:</strong> High friction detected in recent <code className="text-xs bg-surface-2 px-1 rounded text-accent">/checkout</code> sessions due to a 503 error from the payment API.
                </p>
                <p>
                  <strong className="text-text-1">JS Errors:</strong> <code className="text-xs bg-surface-2 px-1 rounded text-error">TypeError: Cannot read properties</code> is spiking on mobile devices.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Right: Activity Feed */}
          <div className="lg:col-span-2 space-y-6">
            <Card variant="elevated" className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between py-3 bg-surface-2/50">
                <CardTitle className="text-sm">Recent Triage Inbox</CardTitle>
              </CardHeader>
              <div className="divide-y divide-border">
                {recentIssues.map(issue => (
                  <IssueRow key={issue.id} issue={issue} />
                ))}
              </div>
            </Card>
            
            <Card variant="elevated" className="overflow-hidden overflow-x-auto">
              <CardHeader className="flex flex-row items-center justify-between py-3 bg-surface-2/50">
                <CardTitle className="text-sm">Recent High-Friction Sessions</CardTitle>
              </CardHeader>
              <table className="w-full text-sm">
                <thead className="bg-surface border-b border-border">
                  <tr>
                    {["Session ID", "URL", "Friction", "Goal", "Issues", "Signals", "Duration", "Env", "Started", ""].map(h => (
                      <th key={h} className="text-left px-4 py-2 text-[10px] font-semibold text-text-3 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.map(session => (
                    <SessionRow key={session.id} session={session} />
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function SeverityBar({ label, count, total, color }: { label: string, count: number, total: number, color: string }) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-text-2 font-medium">{label}</span>
        <span className="text-text-1 font-mono">{count}</span>
      </div>
      <div className="h-1.5 w-full bg-border rounded-full overflow-hidden shadow-inner">
        <div className={`h-full ${color} rounded-full transition-all duration-1000`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
