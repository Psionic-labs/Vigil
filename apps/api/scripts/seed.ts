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

async function seedPlayground() {
  console.log("⏳ Seeding playground user and project...");
  try {
    const now = Date.now();
    await pool.query(`
      INSERT INTO users (id, email, name, created_at)
      VALUES ('usr_playground', 'playground@vigil.run', 'Playground User', $1)
      ON CONFLICT (id) DO NOTHING;
    `, [now]);

    await pool.query(`
      INSERT INTO projects (id, name, public_key, owner_id, is_active, created_at)
      VALUES ('proj_playground', 'Playground Project', 'pk_playground', 'usr_playground', true, $1)
      ON CONFLICT (id) DO NOTHING;
    `, [now]);

    console.log("✅ Playground project seeded successfully.");
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    await pool.end();
    process.exit(1);
  }
}

seedPlayground();
