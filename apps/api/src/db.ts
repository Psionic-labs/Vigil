import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for @vigil/api");
}

if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  throw new Error(
    "DATABASE_URL must start with postgresql:// (or postgres://).",
  );
}

export const sql = neon(databaseUrl);

export async function checkDatabaseConnection() {
  const rows = (await sql`SELECT NOW() AS now`) as { now: string }[];
  const row = rows[0];

  if (!row) {
    throw new Error("Database connection check returned no rows.");
  }

  return row.now;
}
