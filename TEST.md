# Vigil Monorepo Testing & Execution Guide

This document describes how to boot, run, and verify each component of the Vigil observability platform.

---

## 🛠️ Prerequisites

Ensure you have the following installed on your local machine:
- **Node.js**: `v22` or higher (pnpm requires at least v22.13)
- **pnpm**: `v10` or higher
- **PostgreSQL CLI** (optional, for direct database CLI query access)

Initialize dependencies at the root of the monorepo:
```bash
pnpm install
```

---

## 📦 1. Client-Side SDK (`packages/sdk`)

The SDK is a client-side library that captures and bundles rrweb mutations, console logs, network payloads, and unhandled errors.

### Build the SDK
To bundle the SDK code:
```bash
pnpm --filter @vigil/sdk build
```

### Run Unit Tests
To run the SDK unit test suite (via Vitest):
```bash
pnpm --filter @vigil/sdk test
```

---

## 🎛️ 2. Ingest API & AI Triage Worker (`apps/api`)

The backend API server handles ingestion requests, and the Triage Worker pulls jobs from the queue to process them with AI.

### Environment Configuration
Make sure `apps/api/.env` is configured. Example:
```env
DATABASE_URL="postgresql://neondb_owner:...@ep-jolly-waterfall-....neon.tech/neondb?sslmode=require"
OPENROUTER_API_KEY="your_openrouter_key"
```

### Database Migrations & Seeding
To reset/migrate schemas and seed the default playground project:
```bash
# Apply migrations
pnpm --filter @vigil/api db:migrate

# Seed playground project & user
pnpm --filter @vigil/api db:seed
```

> [!WARNING]
> Running a migration on a fresh database requires a seeded project key (`pk_playground`) for the Ingest API to authorize requests. Always run `db:seed` before starting tests.

---

### Run Ingest API Server
Starts Hono API on `http://localhost:3001`:
```bash
pnpm --filter @vigil/api dev
```

---

### Run Triage Worker
The triage worker pulls pending jobs from the database queue and analyzes them. You can run the worker in two modes:

#### Option A: Sandbox (Mock AI) Mode (Recommended for Offline Testing)
Runs without requiring an external AI API key or network request:
* **PowerShell**: `$env:MOCK_AI="true"; pnpm --filter @vigil/api worker:dev`
* **Bash/Linux/macOS**: `MOCK_AI=true pnpm --filter @vigil/api worker:dev`

#### Option B: Real AI Mode
Queries the live OpenRouter LLM (`openrouter/owl-alpha`) using the `OPENROUTER_API_KEY` defined in `.env`:
```bash
pnpm --filter @vigil/api worker:dev
```

---

### Automated E2E Telemetry Verification
To verify the complete ingestion-to-triage pipeline automatically:
1. Ensure the **Ingest API Server** (Step 2.3) and the **Triage Worker** (Step 2.4) are both running.
2. In a separate terminal, execute:
   ```bash
   pnpm --filter @vigil/api test:e2e
   ```

> [!NOTE]
   > The E2E script sends a non-final payload, waits **5.2 seconds** (to satisfy the session duration threshold), and then sends a final payload with a JS Error and Rage Click to trigger triage. Finally, it polls the database to verify successful processing.

---

## 🛢️ 2.5. Neon Database Verification (SQL Cheat Sheet)

Copy-paste these queries into your Neon Console SQL Editor to inspect E2E test results:

### A. View Triaged Sessions
Verifies session metrics, friction scores, and AI-generated summaries:
```sql
SELECT 
  id, 
  duration_ms, 
  has_js_error, 
  has_rage_click, 
  ai_session_summary, 
  ai_friction_score, 
  ai_goal_completed 
FROM sessions 
ORDER BY created_at DESC 
LIMIT 5;
```

### B. View Deduplicated Issue Groups
Checks the consolidated bug definitions and how many user sessions were affected:
```sql
SELECT 
  id, 
  title, 
  root_cause, 
  suggested_fix, 
  severity, 
  status, 
  affected_session_count 
FROM issue_groups 
ORDER BY created_at DESC;
```

### C. View Individual Issue Instances
Verifies individual occurrences of bugs inside user sessions:
```sql
SELECT 
  id, 
  issue_group_id, 
  session_id, 
  title, 
  severity, 
  confidence 
FROM issue_instances 
ORDER BY created_at DESC;
```

### D. View AI Run Logs
Tracks OpenAI/OpenRouter model performance latency and token metrics:
```sql
SELECT 
  session_id, 
  model, 
  status, 
  input_tokens, 
  output_tokens, 
  duration_ms 
FROM ai_triage_runs 
ORDER BY created_at DESC;
```

### E. View Triage Job Queue
Tracks the processing state of enqueued triage jobs:
```sql
SELECT 
  session_id, 
  status, 
  attempts, 
  last_error 
FROM triage_jobs 
ORDER BY created_at DESC;
```

---

## 💻 3. Web Dashboard & Playground

### Vite Playground (`apps/playground`)
A Vanilla TS playground loaded with the `@vigil/sdk` package configured to send events to `http://localhost:3001/api/v1/ingest`.
```bash
pnpm --filter @vigil/playground dev
```
Open `http://localhost:3000` (or the printed Vite port) in your browser. Click the trigger buttons to throw JS errors, console errors, or simulate rage clicks, then close the tab or click **Trigger Final Flush** to send the final payload to the server.

### Next.js Dashboard (`apps/web`)
The dashboard interface that displays session replays, issues, and AI summaries:
```bash
pnpm --filter @vigil/web dev
```
Open `http://localhost:3002` (or Next.js port) in your browser.

---

## 🧪 4. Running Monorepo Tests & Local CI

To execute the entire CI validation suite locally (linting, typechecking, running SDK/API unit tests, building, and bundle size auditing) with a single command:
```bash
pnpm run test:local
```

You can also execute individual checks separately:
- **Linting & Formatting**: `pnpm run lint`
- **TypeScript Compiler Check**: `pnpm run typecheck`
- **SDK Unit Tests**: `pnpm --filter @vigil/sdk test`
- **API Unit Tests**: `pnpm --filter @vigil/api test`
- **SDK Bundle Size Audit**: `pnpm --filter @vigil/sdk track-size`

---

## 🚀 5. CI Workflow & GitHub Configuration

Vigil uses GitHub Actions for continuous integration (automated testing and bundle auditing).

### 5.1 CI Workflow (`.github/workflows/ci.yml`)
On every pull request and push to the `main` branch, the CI pipeline automatically runs:
1. **Linting & Type-Checking**: Executes `pnpm lint` and `pnpm typecheck`.
2. **Testing**: Executes `vitest run` on both the SDK and API packages.
3. **Builds**: Bundles both packages and confirms compilations succeed.
4. **SDK Bundle Size Auditing**: Runs `pnpm --filter @vigil/sdk track-size` to enforce a maximum bundle budget of **250 KB** (including embedded dependencies like `rrweb`).

### 5.2 Enforcing Branch Protection Rules
To guarantee regressions are not introduced silently, set up a branch protection rule on GitHub:
1. Go to your repository settings -> **Branches**.
2. Click **Add rule** on the `main` branch.
3. Check **Require status checks to pass before merging**.
4. Search for and select the following status checks:
   - `Lint & Type-Check`
   - `Test, Build & Audit Size`
5. Check **Require branches to be up to date before merging**.

