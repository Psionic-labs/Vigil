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

export const pool = new Pool({ connectionString: databaseUrl || "postgres://fake" });

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
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
