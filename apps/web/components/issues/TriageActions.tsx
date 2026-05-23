"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, UserPlus, EyeOff, User } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import type { IssueGroup } from "@/lib/types";

export function TriageActions({ issue }: { issue: IssueGroup }) {
  const { toast } = useToast();
  const [isAssigned, setIsAssigned] = useState(false);
  const [isResolved, setIsResolved] = useState(issue.status === "resolved");

  useEffect(() => {
    setIsResolved(issue.status === "resolved");
  }, [issue.status]);

  const handleAssign = () => {
    const newState = !isAssigned;
    setIsAssigned(newState);
    if (newState) {
      toast("Issue assigned to you", "success");
    } else {
      toast("Issue unassigned", "info");
    }
  };

  const handleResolve = () => {
    setIsResolved(true);
    toast("Issue marked as resolved", "success");
  };

  const handleIgnore = () => {
    toast("Issue ignored", "info");
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <p className="text-xs font-medium text-text-2 uppercase tracking-wider">Triage Actions</p>
      
      <div className="flex flex-col gap-2">
        <button
          onClick={handleAssign}
          className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
            isAssigned 
              ? "bg-accent/10 border-accent/20 text-accent hover:bg-accent/20" 
              : "bg-surface-2 border-border text-text-1 hover:border-text-3"
          }`}
        >
          {isAssigned ? <User size={14} /> : <UserPlus size={14} />}
          {isAssigned ? "Assigned to me" : "Assign to me"}
        </button>

        {!isResolved ? (
          <button
            onClick={handleResolve}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-success/10 border border-success/20 text-success text-sm font-medium hover:bg-success/20 transition-colors"
          >
            <CheckCircle2 size={14} />
            Mark as Resolved
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-surface-2 border border-border text-text-3 text-sm font-medium">
            <CheckCircle2 size={14} />
            Resolved
          </div>
        )}

        <button
          onClick={handleIgnore}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-border bg-transparent text-text-3 text-sm font-medium hover:text-text-1 hover:bg-surface-2 transition-colors"
        >
          <EyeOff size={14} />
          Ignore Issue
        </button>
      </div>
    </div>
  );
}
