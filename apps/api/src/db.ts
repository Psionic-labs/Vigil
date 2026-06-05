/**
 * @file db.ts
 * @description Database connection pool and transaction manager.
 * @how Wraps Neon PostgreSQL serverless client with a transaction helper and connection validator.
 * @why Enables clean, thread-safe transactional DB operations with automatic rollbacks.
 */
import { Pool, type PoolClient } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && process.env.NODE_ENV !== "test") {
  throw new Error("DATABASE_URL is required for @vigil/api");
}

if (databaseUrl && !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  throw new Error(
    "DATABASE_URL must start with postgresql:// (or postgres://).",
  );
}

export const pool = new Pool({
  connectionString: databaseUrl || "postgres://fake",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (originalError) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Failed to rollback transaction:", rollbackError);
    }
    throw originalError;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection() {
  const result = await pool.query("SELECT NOW() AS now");
  const row = result.rows[0];

  if (!row) {
    throw new Error("Database connection check returned no rows.");
  }

  return row.now as string;
}
