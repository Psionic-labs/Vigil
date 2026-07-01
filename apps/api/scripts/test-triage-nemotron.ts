import { loadEnv } from "./setup.js";
loadEnv();

async function runTest() {
  const { getPool } = await import("./setup.js");
  const { buildSessionTimeline } = await import("../src/workers/triage/timeline");
  const { findCandidateIssueGroups } = await import("../src/workers/triage/candidate-groups");
  const { buildTriagePrompt } = await import("../src/workers/triage-prompts");
  const { OpenRouterProvider } = await import("../src/lib/ai/openrouter-provider");

  const pool = getPool();

  try {
    const sessionId = "fe793d80-7018-4ccc-b90f-9bb27d3deda1";
    console.log("Fetching session:", sessionId);
    const sessionRes = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
    if (sessionRes.rows.length === 0) {
      console.error("Session not found!");
      await pool.end();
      return;
    }
    const sessionRow = sessionRes.rows[0];

    const timeline = await buildSessionTimeline(sessionId);
    const candidates = await findCandidateIssueGroups(sessionRow.project_id, timeline.rawFingerprints);

    const context = {
      session: {
        id: sessionRow.id,
        url: sessionRow.url,
        duration_ms: sessionRow.duration_ms,
        started_at: Number(sessionRow.started_at),
        release: sessionRow.release,
        commit_sha: sessionRow.commit_sha,
        environment: sessionRow.environment,
      },
      timeline,
      candidate_issue_groups: candidates.slice(0, 10),
    };

    const prompt = buildTriagePrompt(context);
    console.log("\n=== CONSTRUCTED PROMPT ===");
    console.log(prompt);

    const provider = new OpenRouterProvider({
      apiKey: process.env.OPENROUTER_API_KEY!,
      model: "meta-llama/llama-3.2-3b-instruct:free",
      maxTokens: 2000,
      timeoutMs: 60000,
    });

    console.log("\nCalling Nvidia Nemotron model on OpenRouter...");
    const result = await provider.invoke(prompt);
    
    console.log("\n=== RAW LLM RESPONSE ===");
    console.log(result.rawContent);

    try {
      const parsed = JSON.parse(result.rawContent.trim().replace(/^```json\n/, "").replace(/\n```$/, ""));
      console.log("\n=== PARSED JSON ===");
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e: any) {
      console.log("\nJSON parsing failed:", e.message);
    }

    await pool.end();
  } catch (err) {
    console.error("Error executing test:", err);
    await pool.end();
  }
}

runTest();
