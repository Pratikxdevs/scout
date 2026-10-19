import { useEffect } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { useStore } from '../store';
import { logger } from '../lib/logger';

/**
 * Clerk ⇄ Scout state bridge. Mounted once inside ClerkProvider (main.tsx).
 *
 * Clerk is the source of truth; the store reflects it:
 *   • new Clerk session     → silent store login + server hydration
 *   • session ended         → store logout (which hands Clerk sign-out back)
 *   • boot `restoring` hold → lifts the moment Clerk settles isLoaded
 *
 * Renders nothing; mounted only when the backend layer is configured.
 */
export function AuthBridge() {
  const { userId, isLoaded, signOut } = useAuth();
  const { user } = useUser();
  const { authed, restoring, login, logout, setRestoring, setSignOutAction } = useStore();

  // Pass Clerk's sign-out down to the store's logout().
  useEffect(() => {
    if (typeof signOut !== 'function') return;
    setSignOutAction(async () => {
      await signOut();
    });
    return () => setSignOutAction(null);
  }, [signOut, setSignOutAction]);

  useEffect(() => {
    if (!isLoaded) return; // hold: boot still settling
    if (userId) {
      if (authed) {
        // Same session we already know — just lift the hold.
        if (restoring) setRestoring(false);
        return;
      }
      const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
      logger.info('clerk-sync-in', 'Clerk session active — syncing Scout state.', {});
      // Silent: keep the current deep link during restore (the view bounces
      // auth-only routes to the dashboard itself once authed lands).
      void login(email, { silent: true }).finally(() => setRestoring(false));
      return;
    }
    // Signed out on Clerk's side.
    if (authed) {
      logger.info('clerk-sync-out', 'Clerk session ended — signing Scout out.', {});
      // logout() also triggers Clerk sign-out again (idempotent); its local
      // wipes matter more than the redundant upstream call.
      logout();
    } else if (restoring) {
      setRestoring(false);
    }
  }, [isLoaded, userId, authed, restoring, user, login, logout, setRestoring]);

  return null;
}
