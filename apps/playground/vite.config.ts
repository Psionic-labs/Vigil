/**
 * @file vite.config.ts
 * @description Vite bundler configuration for the playground sandbox application.
 * @why Specifies dev server parameters and static build output details.
 */

import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  resolve: {
    alias: {
      '@vigil/sdk': path.resolve(__dirname, '../../packages/sdk/src/index.ts')
    }
  }
});
