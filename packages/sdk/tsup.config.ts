import { defineConfig } from "tsup";

declare const process: any;

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"], // Dual CJS/ESM as specified in the roadmap
  dts: false,             // .d.ts files are generated separately by `tsc` in the package build scripts (for example, `types` / `build:types`)
  splitting: false,
  sourcemap: true,
  clean: true,            // Clean the dist folder before building
  treeshake: true,
  minify: true,           // Minify the output to keep it small
  noExternal: process.env.TSUP_BUNDLE_AUDIT === "true" ? ["rrweb"] : undefined, // Enable only for bundle-size audit builds
  metafile: true,         // Generate metafile for bundle analysis
});
