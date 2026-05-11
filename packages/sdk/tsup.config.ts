import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"], // Dual CJS/ESM as specified in the roadmap
  dts: false,             // Handled separately by tsc to avoid tsup's baseUrl injection
  splitting: false,
  sourcemap: true,
  clean: true,            // Clean the dist folder before building
  treeshake: true,
  minify: true,           // Minify the output to keep it small
});
