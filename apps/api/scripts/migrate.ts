import { Pool } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "fs";
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
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)?\s*$/);
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
    // Create tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id    SERIAL PRIMARY KEY,
        name  TEXT NOT NULL UNIQUE,
        run_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Read all .sql files from migrations/ in sorted order
    const migrationsDir = join(__dirname, "../migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    // Check which migrations have already been applied
    const { rows: applied } = await pool.query(
      "SELECT name FROM _migrations"
    );
    const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

    let ranCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  ⏭️  ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), "utf8");
      await pool.query(sql);
      await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
      console.log(`  ✅ ${file}`);
      ranCount++;
    }

    if (ranCount === 0) {
      console.log("✅ All migrations already applied.");
    } else {
      console.log(`✅ Ran ${ranCount} migration(s) successfully.`);
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    await pool.end();
    process.exit(1);
  }
}

runMigrations();
