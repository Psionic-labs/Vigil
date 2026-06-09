/**
 * @file track-size.js
 * @description Measures compiled output bundle sizes.
 * @why Helps maintain a lightweight SDK footprint to minimize host page impact.
 */

/* global console, process */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const bundlePath = path.join(distDir, "index.js");

const BUDGET_KB = 250; // Size budget limit in KB (including rrweb dependency)

console.log("⏳ Running bundle size audit build...");
try {
  // Build with TSUP_BUNDLE_AUDIT=true using cross-platform env injection
  execSync("npx tsup", {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, TSUP_BUNDLE_AUDIT: "true" }
  });

  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Bundle not found at: ${bundlePath}`);
  }

  const stats = fs.statSync(bundlePath);
  const sizeBytes = stats.size;
  const sizeKb = (sizeBytes / 1024).toFixed(2);

  console.log("\n====================================");
  console.log(`SDK Bundle Size: ${sizeKb} KB`);
  console.log(`Size Budget:     ${BUDGET_KB} KB`);
  console.log("====================================");

  if (sizeBytes > BUDGET_KB * 1024) {
    console.error(`❌ FAILURE: SDK bundle size exceeds the ${BUDGET_KB} KB budget!`);
    process.exit(1);
  }

  console.log("✅ SUCCESS: SDK bundle size is within budget.");
  
  // Re-run normal build to restore standard clean workspace dist output
  console.log("\n⏳ Restoring clean standard build...");
  execSync("pnpm run build", { cwd: rootDir, stdio: "ignore" });
  
  process.exit(0);
} catch (err) {
  console.error("❌ Bundle size tracking failed:", err.message);
  process.exit(1);
}
