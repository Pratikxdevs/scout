import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// Source maps: 'hidden' — stack traces resolve in Sentry, no
// sourceMappingURL comment served to browsers. The sentry plugin uploads
// maps for staging/production builds (needs SENTRY_AUTH_TOKEN) and deletes
// the emitted .map files so they never ship in dist/.
const withSentryMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default defineConfig(({ mode }) => {
  return {
    plugins: [
    react(),
    ...(withSentryMaps
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: {
              name: process.env.SENTRY_RELEASE ?? 'jobwzrd-app@dev',
              deploy: { env: process.env.SENTRY_ENVIRONMENT ?? 'staging' },
            },
            sourcemaps: {
              assets: 'dist/**/*.js',
              filesToDeleteAfterUpload: 'dist/**/*.map',
            },
          }),
        ]
      : []),
  ],
  appType: 'spa',
  server: {
    port: 2992,
    host: '0.0.0.0',
    // Clerk + Convex talk to their first-party hosts directly (no
    // same-origin proxy needed). Legacy /api/auth + /api/v1 proxies were
    // removed with the Better Auth stack.
  },
  preview: { port: 2992, host: '0.0.0.0' },
  build: {
    // No sourcemaps without an upload token: 'hidden' maps would ship in
    // dist/ (≈1.6MB on the index chunk alone) serving nobody.
    sourcemap: withSentryMaps ? 'hidden' : false,
    chunkSizeWarningLimit: 600,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          icons: ['@heroicons/react'],
          sentry: ['@sentry/react'],
        },
      },
    },
  },
  };
});
