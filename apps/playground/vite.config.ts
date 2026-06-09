/**
 * @file vite.config.ts
 * @description Vite bundler configuration for the playground sandbox application.
 * @why Specifies dev server parameters and static build output details.
 */

import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true
  }
});
