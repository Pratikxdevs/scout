import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import App from './App';
import './system.css';
import { observePerf } from './lib/perf';
import { initSentry, stagingErrorProbe } from './lib/sentry';
import { captureUtm } from './lib/utm';
import { enforceCanonicalLoopback } from './lib/origin';
import { authClient } from './lib/authClient';

// OAuth state/PKCE cookies bind to the origin that STARTS the flow while
// the provider callback is pinned to localhost:2992 — booting on 127.0.0.1
// loops every social login (state_mismatch). Normalize first; when a
// bounce is issued this boot ends here (replace() unloads the page, so the
// render below never commits on the alias origin).
if (!enforceCanonicalLoopback()) {
  initSentry();
  captureUtm();
  if (import.meta.env.VITE_ENVIRONMENT === 'staging') {
    (window as unknown as { __jw_probe?: () => string }).__jw_probe = stagingErrorProbe;
  }
  observePerf();

  boot();
}

function boot(): void {
  function Root(): React.JSX.Element {
    const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
    // No backend configured (fresh checkout): render unwrapped demo.
    if (!url) return <App />;
    const convex = new ConvexReactClient(url);
    // Sanctioned escape (docs/RULES.md §1 pattern): @convex-dev/better-auth
    // 0.12.5's AuthClient generics were compiled against an earlier
    // better-auth 1.6.x than our pinned 1.6.33, so identical-shape clients
    // mismatch at type level only. Same package instance at runtime.
    const client = authClient as never;
    return (
      <ConvexBetterAuthProvider client={convex} authClient={client}>
        <App />
      </ConvexBetterAuthProvider>
    );
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode><Root /></StrictMode>,
  );
}
