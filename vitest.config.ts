import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so the web-extension build plugin
// doesn't run during tests.
export default defineConfig({
  test: {
    environment: 'node',
  },
});
