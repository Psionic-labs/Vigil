import { MOCK_SESSIONS } from "@/lib/mock-data";
import { notFound } from "next/navigation";
import { ReplayPlayer } from "@/components/sessions/ReplayPlayer";
import { ArrowLeft, Clock, Monitor, Globe } from "lucide-react";
import Link from "next/link";

export default async function SessionReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const session = MOCK_SESSIONS.find(s => s.id === resolvedParams.id);
  
  if (!session) {
    notFound();
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col p-6 max-w-7xl mx-auto w-full gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 shrink-0">
        <div>
          <Link href="/sessions" className="inline-flex items-center text-sm text-text-3 hover:text-text-1 mb-3 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Sessions
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-text-1">Session {session.id}</h1>
          
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-text-3">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-text-2" />
              {Math.round(session.duration_ms / 1000)}s
            </div>
            <div className="flex items-center gap-1.5">
              <Monitor className="w-4 h-4 text-text-2" />
              {session.screen_width} × {session.screen_height}
            </div>
            <div className="flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-text-2" />
              {session.user_agent.split(" ")[0]}
            </div>
          </div>
        </div>
        
        {/* AI Summary Card */}
        <div className="sm:max-w-md bg-surface-2 border border-border rounded-lg p-3.5 text-sm shadow-sm">
          <div className="font-medium text-text-1 mb-1.5 flex items-center gap-1.5">
            <span className="text-blue-500">✨</span> AI Summary
          </div>
          <p className="text-text-2 leading-relaxed">
            {session.ai_session_summary}
          </p>
        </div>
      </div>

      {/* Player */}
      <div className="flex-1 min-h-0">
        <ReplayPlayer session={session} />
      </div>
    </div>
  );
}
