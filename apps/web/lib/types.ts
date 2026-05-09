export type Severity = "P0" | "P1" | "P2" | "P3";
export type IssueStatus = "open" | "linked" | "ignored" | "resolved";
export type Environment = "development" | "preview" | "production";
export type EventType = "js_error" | "rage_click" | "network_error" | "dead_click" | "navigation" | "click" | "console_error";

export type Project = {
  id: string;
  name: string;
  public_key: string;
  github_repo: string | null;
  github_auto_raise_enabled: boolean;
  github_auto_raise_severity: "P0" | "P0+P1";
  github_auto_raise_min_confidence: number;
  github_comment_enabled: boolean;
};

export type IssueGroup = {
  id: string;
  project_id: string;
  fingerprint: string;
  title: string;
  root_cause: string;
  suggested_fix: string;
  severity: Severity;
  status: IssueStatus;
  confidence: number;
  reproduction_steps_json: string;
  evidence_summary: string;
  affected_session_count: number;
  first_seen_at: number;
  last_seen_at: number;
  github_issue_url: string | null;
  github_issue_number: number | null;
  github_auto_raised: boolean;
};

export type Session = {
  id: string;
  project_id: string;
  url: string;
  user_agent: string;
  screen_width: number;
  screen_height: number;
  release: string | null;
  commit_sha: string | null;
  environment: Environment | null;
  duration_ms: number;
  started_at: number;
  ended_at: number;
  has_js_error: boolean;
  has_rage_click: boolean;
  has_network_err: boolean;
  has_dead_click: boolean;
  error_count: number;
  issue_instance_count: number;
  issue_group_count: number;
  ai_analyzed_at: number;
  ai_analysis_skipped: boolean;
  ai_session_summary: string;
  ai_goal_completed: boolean;
  ai_friction_score: number;
  ai_triage_confidence: number;
};

export type IssueInstance = {
  id: string;
  issue_group_id: string;
  session_id: string;
  title: string;
  root_cause: string;
  suggested_fix: string;
  severity: Severity;
  timestamp_ms: number;
  confidence: number;
  evidence_json: string;
  reproduction_json: string;
  dev_comment: string | null;
};

export type EventSummary = {
  id: string;
  session_id: string;
  type: EventType;
  timestamp_ms: number;
  target: string | null;
  error_message: string | null;
  error_stack: string | null;
  network_url: string | null;
  network_status: number | null;
  network_method: string | null;
  click_count: number | null;
  nav_to: string | null;
  fingerprint: string | null;
};
