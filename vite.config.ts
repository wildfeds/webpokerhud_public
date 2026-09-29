import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';

// TARGET_BROWSER=firefox builds the Firefox variant into dist-firefox/;
// default is the Chrome build into dist/. Per-browser manifest fields use
// {{chrome}}./{{firefox}}. key prefixes in manifest.json.
const browser = process.env.TARGET_BROWSER ?? 'chrome';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: 'manifest.json',
      browser,
      disableAutoLaunch: true, // load dist/ manually, or use `npm run run:firefox`
    }),
  ],
  build: {
    outDir: browser === 'firefox' ? 'dist-firefox' : 'dist',
    emptyOutDir: true,
    // Sourcemaps help during dev; omit for prod builds
    sourcemap: process.env.NODE_ENV !== 'production',
  },
});
