import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// Source maps: 'hidden' — stack traces resolve in Sentry, no
// sourceMappingURL comment served to browsers. The sentry plugin uploads
// maps for staging/production builds (needs SENTRY_AUTH_TOKEN) and deletes
// the emitted .map files so they never ship in dist/.
const withSentryMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Same-origin auth in dev: /api/auth/* proxies to the Convex deployment so
  // Better Auth cookies are first-party (cross-site Set-Cookie gets blocked
  // by third-party-cookie protections → "state not found" at callback).
  // Production serves the SPA + API from one origin — no proxy needed.
  const authTarget =
    env.VITE_AUTH_PROXY_TARGET ?? 'https://healthy-oyster-548.convex.site';
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
    proxy: {
      '/api/auth': {
        target: authTarget,
        changeOrigin: true,
        secure: true,
      },
      // Same-origin data API in dev: /api/v1/* proxies to Convex so the
      // session cookie stays first-party (cross-site Set-Cookie/send gets
      // blocked → every authed call 401s). Mirrors prod single-origin.
      '/api/v1': {
        target: authTarget,
        changeOrigin: true,
        secure: true,
      },
    },
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
