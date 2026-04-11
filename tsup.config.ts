import { defineConfig } from 'tsup'

// CLI build config. The published artifact is a single bundled
// `dist/cli.js` so `npx @coji/ldash-cli` only has to fetch one file
// and Node has nothing to resolve from `node_modules`.
export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['esm'],
  target: 'node18.2',
  outDir: 'dist',
  // Wipe dist before each build so stale artifacts (like the old
  // `dist/schemas.*` from a previous draft) can never ride along.
  clean: true,
  splitting: false,
  // Sourcemaps are kept so stack traces in errors point at the original
  // src files instead of the bundled blob.
  sourcemap: true,
  shims: false,
  // Bundle every dependency we declare so the published package has zero
  // runtime install footprint — `node:*` built-ins stay external because
  // tsup leaves Node built-ins alone regardless of this setting.
  noExternal: [/.*/],
})
