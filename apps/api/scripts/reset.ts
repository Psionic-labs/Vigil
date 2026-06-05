import { Pool } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load local .env file manually
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

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function resetDatabase() {
  console.log("⏳ Dropping and recreating public schema...");
  try {
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    console.log("✅ Database schema reset successfully.");
  } catch (err) {
    console.error("❌ Reset failed:", err);
  } finally {
    await pool.end();
  }
}

resetDatabase();
