/**
 * @file reset.ts
 * @description Truncates or drops database tables to perform a clean state reset.
 * @why Provides a fast way to wipe stale or corrupt local data and restart migration/seeding routines during development and testing.
 */

import { loadEnv, getPool } from "./setup.js";

loadEnv();
const pool = getPool();

async function resetDatabase() {
  console.log("Dropping and recreating public schema...");
  try {
    await pool.query(`
      BEGIN;
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      COMMIT;
    `);
    console.log("✅ Database schema reset successfully.");
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Reset failed:", err);
    await pool.end();
    process.exit(1);
  }
}

resetDatabase();
