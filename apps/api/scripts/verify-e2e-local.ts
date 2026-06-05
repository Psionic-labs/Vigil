/**
 * @file verify-e2e-local.ts
 * @description Automation runner that boots the API server and worker locally, polls for readiness,
 *              executes E2E telemetry verification checks, and guarantees clean teardown of child processes.
 * @why Enables developers and CI runners to execute the integration/E2E test suite in a single command,
 *      eliminating the need to manually manage multiple running terminals.
 */

import { spawn, execSync, ChildProcess } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "../");

const children: ChildProcess[] = [];

function cleanup() {
  console.log("\nCleaning up local processes...");
  for (const child of children) {
    if (child.pid && !child.killed) {
      console.log(`  Stopping child process PID: ${child.pid}`);
      try {
        if (process.platform === "win32") {
          // Forcefully kill the process tree (including child node.exe spawned by shell)
          execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
        } else {
          process.kill(child.pid, "SIGTERM");
        }
      } catch {
        // Process might already be dead
      }
    }
  }
}

// Ensure clean exit on interrupts/errors
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(1);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(1);
});

async function main() {
  console.log("Booting API Server on port 3001...");
  const apiServer = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
  });
  children.push(apiServer);

  console.log("Booting Triage Worker in Sandbox (Mock AI) mode...");
  const worker = spawn("npx", ["tsx", "src/workers/triage-worker.ts"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, MOCK_AI: "true" },
  });
  children.push(worker);

  // Poll /health endpoint until 3001 responds with 200 OK
  console.log("Waiting for API Server to become ready...");
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://localhost:3001/health", {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (!ready) {
    console.error("❌ API Server failed to start on port 3001 within 15 seconds.");
    process.exit(1);
  }
  console.log("✅ API Server is ready.");

  console.log("Running E2E verification checks...");
  const verifyProc = spawn("npx", ["tsx", "scripts/verify-e2e.ts"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
  });

  verifyProc.on("exit", (code) => {
    cleanup();
    if (code === 0) {
      console.log("E2E Local verification passed successfully!");
      process.exit(0);
    } else {
      console.error(`❌ E2E Local verification failed with exit code: ${code}`);
      process.exit(code ?? 1);
    }
  });
}

main().catch((err) => {
  console.error("❌ Unexpected runner failure:", err);
  cleanup();
  process.exit(1);
});
