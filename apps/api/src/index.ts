/**
 * @file index.ts
 * @description Entrypoint to boot the API server and start the reconciliation worker.
 * @why Launches the Express API server listening on the configured port and starts background processes.
 */

import { serve } from "@hono/node-server";
import "dotenv/config";
import app from "./app";
import { startReconciliationWorker, stopReconciliationWorker } from "./lib/reconciliation";
import { startLimiterCleanup, stopLimiterCleanup } from "./lib/rate-limit-store";

const DEFAULT_SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_RECONCILIATION_INTERVAL_MS = 60 * 1000;

function readPositiveMilliseconds(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number(value);
  if (Number.isSafeInteger(parsed) && parsed > 0) {
    return parsed;
  }

  console.warn(`Invalid ${name} environment variable "${value}". Falling back to ${fallback}ms.`);
  return fallback;
}

let PORT = 3001;
if (process.env.PORT) {
  const parsed = parseInt(process.env.PORT, 10);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
    PORT = parsed;
  } else {
    console.warn(`Invalid PORT environment variable "${process.env.PORT}". Falling back to 3001.`);
  }
}

console.log(`Starting Vigil API on port ${PORT}...`);

serve({
  fetch: app.fetch,
  port: PORT,
});

if (process.env.NODE_ENV !== "test") {
  const timeoutMs = readPositiveMilliseconds(
    "SESSION_TIMEOUT_MS",
    DEFAULT_SESSION_TIMEOUT_MS,
  );
  const intervalMs = readPositiveMilliseconds(
    "RECONCILIATION_INTERVAL_MS",
    DEFAULT_RECONCILIATION_INTERVAL_MS,
  );

  const bucketTtlMs = readPositiveMilliseconds(
    "RATE_LIMIT_BUCKET_TTL_MS",
    900000,
  );

  startReconciliationWorker(intervalMs, timeoutMs);
  startLimiterCleanup(bucketTtlMs, 60000);

  const handleShutdown = (signal: string) => {
    console.log(`Received ${signal}. Shutting down workers gracefully...`);
    stopReconciliationWorker();
    stopLimiterCleanup();
    process.exit(0);
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}
