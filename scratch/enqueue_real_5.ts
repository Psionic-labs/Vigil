import 'dotenv/config';
import { pool } from '../apps/api/src/db';

async function main() {
  const sessionId = 'sess_testing_real_5';
  const projectId = 'proj_np0umdemq6br7mh';
  const now = Date.now();
  
  await pool.query(
    "UPDATE sessions SET ai_analysis_skipped = false, ai_skip_reason = NULL, duration_ms = 12000 WHERE id = $1",
    [sessionId]
  );
  
  await pool.query(
    "INSERT INTO triage_jobs (session_id, project_id, status, created_at, updated_at) VALUES ($1, $2, 'pending', $3, $3) ON CONFLICT (session_id) DO UPDATE SET status = 'pending', attempts = 0",
    [sessionId, projectId, now]
  );
  
  console.log('Job successfully enqueued!');
  pool.end();
}

main().catch(err => {
  console.error(err);
  pool.end();
});
