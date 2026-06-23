/**
 * @file seed.ts
 * @description Seeds the local database with initial playground user, project, and session data.
 * @why Provides a repeatable, idempotent way to initialize developer and test environments with a realistic baseline dataset.
 */

import { loadEnv, getPool } from "./setup.js";

loadEnv();
const pool = getPool();

async function seedPlayground() {
  console.log("Seeding playground user and project...");
  try {
    const { auth } = await import("../src/lib/auth.js");
    const now = Date.now();
    let ownerId = "usr_playground";

    // Check if account already exists
    const accountCheck = await pool.query(
      "SELECT user_id FROM accounts WHERE provider_id = 'credential' AND account_id = 'playground@vigil.run'"
    );

    if (accountCheck.rows.length > 0) {
      ownerId = accountCheck.rows[0].user_id;
      console.log(`Playground auth user already exists: ${ownerId}`);
    } else {
      console.log("Creating new playground auth user...");
      // Clean up any existing stale users with this email to avoid conflict
      await pool.query("DELETE FROM users WHERE email = 'playground@vigil.run'");

      // Sign up via better-auth API to hash password and set up accounts
      const result = await auth.api.signUpEmail({
        body: {
          email: "playground@vigil.run",
          password: "password",
          name: "Playground User",
        },
      });

      if (result && result.user) {
        ownerId = result.user.id;
        console.log(`Created playground auth user with ID: ${ownerId}`);

        // Link any pre-existing projects owned by usr_playground to the new ownerId
        await pool.query(
          "UPDATE projects SET owner_id = $1 WHERE owner_id = 'usr_playground'",
          [ownerId]
        );
      }
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
