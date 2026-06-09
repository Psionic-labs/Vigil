/**
 * @file verify-e2e-local.ts
 * @description Executes end-to-end verification tests against the locally running server.
 * @why Validates integration flows locally before pushing changes.
 */


import "dotenv/config";
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
  const isWin = process.platform === "win32";
  const cmd = "npx";
  const spawnOpts = {
    cwd: projectRoot,
    stdio: "inherit" as const,
    shell: isWin,
  };

  console.log("Booting API Server on port 3001...");
  const apiServer = spawn(cmd, ["tsx", "src/index.ts"], spawnOpts);
  children.push(apiServer);

  const mockAi = process.env.MOCK_AI !== "false";
  console.log(`Booting Triage Worker in ${mockAi ? "Sandbox (Mock AI)" : "Real AI"} mode...`);
  const worker = spawn(cmd, ["tsx", "src/workers/triage-worker.ts"], {
    ...spawnOpts,
    env: { ...process.env, MOCK_AI: mockAi ? "true" : "false" },
  });
  children.push(worker);

  // Poll /health endpoint until 3001 responds with 200 OK
  console.log("Waiting for API Server to become ready...");
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://localhost:3001/health/ready", {
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
  const verifyProc = spawn(cmd, ["tsx", "scripts/verify-e2e.ts"], spawnOpts);
  children.push(verifyProc);

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
