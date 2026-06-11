/**
 * @file setup.ts
 * @description Shared setup for database scripts: loads .env, connects pool.
 * @why Eliminates duplicate env-loading boilerplate across scripts.
 */

import { Pool } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function loadEnv() {
  const envPath = join(__dirname, "../.env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)?\s*$/);
      if (match) {
        const key = match[1];
        if (key) {
          let value = match[2] || "";
          value = value.replace(/^(['"])(.*)\1$/, "$2");
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  }
}

export function getPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL is not set.");
    process.exit(1);
  }
  return new Pool({ connectionString: databaseUrl });
}
