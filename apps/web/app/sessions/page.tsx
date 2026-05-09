import { MOCK_SESSIONS } from "@/lib/mock-data";
import { SessionRow } from "@/components/sessions/SessionRow";

const SORT_OPTIONS = ["Friction Score", "Date", "Issue Count", "Duration"];
const FILTER_CHIPS = ["All", "Has Issues", "Goal Failed", "Has JS Error", "Has Rage Click", "Production only"];

export default function SessionsPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border sticky top-0 bg-bg z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-text-1">Sessions</h1>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-surface text-text-2 border border-border">
            {MOCK_SESSIONS.length} total
          </span>
        </div>
        <div className="flex-1" />
        <select className="text-sm bg-surface border border-border rounded-md text-text-2 px-2 py-1.5 focus:outline-none focus:border-accent">
          {SORT_OPTIONS.map(o => <option key={o}>Sort: {o}</option>)}
        </select>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border overflow-x-auto">
        {FILTER_CHIPS.map((chip, i) => (
          <button key={chip} className={`flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors ${
            i === 0 ? "bg-accent/10 text-accent border-accent/30" : "text-text-2 border-border hover:border-text-3 hover:text-text-1"
          }`}>
            {chip}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[900px]">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="border-b border-border">
              {["Session ID", "URL", "Friction", "Goal", "Issues", "Signals", "Duration", "Env", "Started", ""].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-text-3 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_SESSIONS.map((session, i) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
