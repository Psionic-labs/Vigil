/**
 * @file seed.ts
 * @description Seeds the local database with initial playground user, project, and session data.
 * @why Provides a repeatable, idempotent way to initialize developer and test environments with a realistic baseline dataset.
 */

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
  console.log("Seeding playground user and project...");
  try {
    const now = Date.now();
    const userCheck = await pool.query(
      "SELECT id FROM users WHERE email = 'playground@vigil.run'"
    );
    let ownerId = "usr_playground";
    if (userCheck.rows.length > 0) {
      ownerId = userCheck.rows[0].id;
    } else {
      await pool.query(`
        INSERT INTO users (id, email, name, created_at)
        VALUES ('usr_playground', 'playground@vigil.run', 'Playground User', $1)
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
      `, [now]);
    }

    const projCheck = await pool.query(
      "SELECT id FROM projects WHERE public_key = 'pk_playground'"
    );
    if (projCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO projects (id, name, public_key, owner_id, is_active, created_at)
        VALUES ('proj_playground', 'Playground Project', 'pk_playground', $1, true, $2)
        ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id;
      `, [ownerId, now]);
    }

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
