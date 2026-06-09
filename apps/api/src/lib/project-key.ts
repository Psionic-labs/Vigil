import crypto from "crypto";
import type { Pool } from "@neondatabase/serverless";

/**
 * Generates a cryptographically secure, 128-bit project key.
 * Formatted as pk_live_<base64url>.
 */
function generateToken(): string {
  const bytes = crypto.randomBytes(16); // 128-bit entropy
  const base64Url = bytes.toString("base64url");
  return `pk_live_${base64Url}`;
}

/**
 * Generates a unique project key, checking the database to prevent collisions.
 * Uses a safe retry limit.
 */
export async function generateUniqueProjectKey(pool: Pool, maxRetries = 5): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const key = generateToken();
    const result = await pool.query("SELECT 1 FROM projects WHERE public_key = $1 LIMIT 1", [key]);
    if (result.rowCount === 0) {
      return key;
    }
  }
  throw new Error("Failed to generate a unique project key after maximum retries");
}
