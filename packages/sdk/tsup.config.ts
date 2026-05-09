import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"], // Dual CJS/ESM as specified in the roadmap
  dts: true,              // Generate TypeScript declaration files
  splitting: false,
  sourcemap: true,
  clean: true,            // Clean the dist folder before building
  treeshake: true,
  minify: true,           // Minify the output to keep it small
});
