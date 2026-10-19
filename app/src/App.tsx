import { Suspense, lazy, useEffect } from 'react';
import { StoreProvider, useStore } from './store';
import { TopBar, Dock, Sidebar } from './components/shell';
import { BackToTop, ScrollProgress, SkipLink } from './components/chrome';
import { Skeleton } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthBridge } from './components/AuthBridge';
import { Login, Signup } from './features/auth/Auth';
import { Onboarding } from './features/onboarding/Onboarding';

/* Route-level code splitting — auth stays eager (first paint), everything
 * else lazy. Visual output identical; Suspense uses the existing shimmer. */
const Dashboard = lazy(() => import('./features/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const Jobs = lazy(() => import('./features/jobs/Jobs').then((m) => ({ default: m.Jobs })));
const SearchHome = lazy(() => import('./features/search/SearchHome').then((m) => ({ default: m.SearchHome })));
const JobDetail = lazy(() => import('./features/jobs/JobDetail').then((m) => ({ default: m.JobDetail })));
const Applications = lazy(() => import('./features/applications/Applications').then((m) => ({ default: m.Applications })));
const Settings = lazy(() => import('./features/settings/Settings').then((m) => ({ default: m.Settings })));

function RouteFallback() {
  return (
    <div className="card" aria-label="Loading page">
      <div className="card-pad">
        <Skeleton lines={3} />
      </div>
    </div>
  );
}

function NotFound() {
  const { go } = useStore();
  return (
    <section className="card rise" aria-labelledby="nf-title">
      <div className="card-pad" style={{ display: 'grid', gap: 10, textAlign: 'center', padding: '30px 16px' }}>
        <h1 className="t-h2" id="nf-title">Page not found</h1>
        <p className="muted t-small" style={{ margin: 0 }}>
          That address doesn&apos;t match a Scout page. Your data is untouched.
        </p>
        <div>
          <button className="btn" onClick={() => go('dashboard')}>Back to dashboard</button>
        </div>
      </div>
    </section>
  );
}

function View() {
  const { route, authed, onboarded, restoring, go } = useStore();
  useEffect(() => {
    if (authed && ((route === 'login' || route === 'signup') || (route === 'onboarding' && onboarded))) go('dashboard');
  }, [authed, onboarded, route, go]);
  // URL hygiene lives in an effect — never during render (StrictMode
  // double-renders must not fire duplicate history writes mid-paint), and
  // never while the restore probe still holds the decision.
  useEffect(() => {
    if (!authed && !restoring && route !== 'login' && route !== 'signup') window.history.replaceState({}, '', '/login');
    if (authed && !onboarded && route !== 'onboarding') window.history.replaceState({}, '', '/onboarding');
  }, [authed, restoring, onboarded, route]);
  // Landing hierarchy (production): first paint is login. Authenticated
  // users with data go to the dashboard; the search hero stays reachable
  // for signed-in users via the search actions. No route renders without
  // a session except login/signup (then onboarding for new accounts).
  if (!authed) {
    // Mid-restore (OAuth redirect-back): hold the route behind the shimmer
    // for the single boot probe instead of bouncing to /login and
    // clobbering the callback target. Settles in one round trip. The probe
    // lifts the hold only after `authed` is committed, so Login can never
    // paint underneath a live session.
    if (restoring && route !== 'login' && route !== 'signup') return <RouteFallback />;
    return route === 'signup' ? <Signup /> : <Login />;
  }
  if (!onboarded) {
    return <Onboarding />;
  }
  // Authed on an auth-only route: the bounce above is about to land.
  if (route === 'login' || route === 'signup') return <RouteFallback />;
  if (route === 'search') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <ErrorBoundary route={route}><SearchHome /></ErrorBoundary>
      </Suspense>
    );
  }
  return (
    <div className="shell">
      <SkipLink />
      <ScrollProgress />
      <TopBar />
      <div className="body-row" style={{ width: '100%' }}>
      <Sidebar />
      <main className="main" id="main" tabIndex={-1}>
        <ErrorBoundary route={route}>
        <Suspense fallback={<RouteFallback />}>
        {route === 'dashboard' ? <Dashboard /> : null}
        {route === 'jobs' ? <Jobs /> : null}
        {route === 'applications' ? <Applications /> : null}
        {route === 'settings' ? <Settings /> : null}
        {route === 'notfound' ? <NotFound /> : null}
        </Suspense>
        </ErrorBoundary>
      </main>
      </div>
      <Dock />
      <BackToTop />
      {authed && onboarded ? (
        <Suspense fallback={null}>
          <ErrorBoundary route="jobdetail"><JobDetail /></ErrorBoundary>
        </Suspense>
      ) : null}
    </div>
  );
}

export default function App({ clerk = false }: { clerk?: boolean }) {
  return (
    <StoreProvider>
      {/* Clerk must be inside StoreProvider — AuthBridge syncs Clerk's
          session into the store, and only mounts when the Clerk layer is
          configured (demo mode renders the app unwrapped). */}
      {clerk ? <AuthBridge /> : null}
      <View />
    </StoreProvider>
  );
}
