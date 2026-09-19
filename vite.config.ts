import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: 'manifest.json',
      disableAutoLaunch: true, // load dist/ manually in chrome://extensions
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Sourcemaps help during dev; omit for prod builds
    sourcemap: process.env.NODE_ENV !== 'production',
  },
});
