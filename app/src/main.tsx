import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ClerkProvider, useAuth } from '@clerk/react';
import { AuthBridge } from './components/AuthBridge';
import App from './App';
import './system.css';
import { observePerf } from './lib/perf';
import { initSentry, stagingErrorProbe } from './lib/sentry';
import { captureUtm } from './lib/utm';
import { enforceCanonicalLoopback } from './lib/origin';

// OAuth state cookies now live with Clerk; the canonical-loopback guard
// still prevents 127.0.0.1/localhost origin mismatch loops.
if (!enforceCanonicalLoopback()) {
  initSentry();
  captureUtm();
  if (import.meta.env.VITE_ENVIRONMENT === 'staging') {
    (window as unknown as { __scout_probe?: () => string }).__scout_probe = stagingErrorProbe;
  }
  observePerf();

  boot();
}

function boot(): void {
  function Root(): React.JSX.Element {
    const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
    const pk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
    // No backend configured (fresh checkout): render unwrapped demo.
    if (!url || !pk) {
      console.warn('[scout] demo mode — VITE_CONVEX_URL / VITE_CLERK_PUBLISHABLE_KEY missing');
      return <App />;
    }
    const convex = new ConvexReactClient(url);
    // Clerk owns identity; ConvexProviderWithClerk feeds Convex the JWT
    // (`convex` template) so ctx.auth resolves inside every function.
    return (
      <ClerkProvider publishableKey={pk}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <AuthBridge />
          <App />
        </ConvexProviderWithClerk>
      </ClerkProvider>
    );
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode><Root /></StrictMode>,
  );
}
