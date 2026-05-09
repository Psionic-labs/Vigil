import { Pool } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load local .env file manually to avoid requiring dotenv package
const envPath = join(__dirname, "../.env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      value = value.replace(/^(['"])(.*)\1$/, "$2");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function runMigrations() {
  console.log("⏳ Running migrations...");
  try {
    const migrationPath = join(__dirname, "../migrations/0000_initial.sql");
    const migrationSql = readFileSync(migrationPath, "utf8");

    // Execute raw SQL using Pool
    await pool.query(migrationSql);

    console.log("✅ Migrations completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
}

runMigrations();
