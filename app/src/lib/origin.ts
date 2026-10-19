/**
 * Loopback origin canonicalization (OAuth correctness).
 *
 * better-auth binds the OAuth `state`/PKCE cookies to the origin that
 * STARTS the flow, while the provider callback always returns to the
 * single registered redirect origin (`http://localhost:2992/...`). Start
 * on 127.0.0.1 and the callback arrives without its cookies → every social
 * login ends in `state_mismatch` → back to the login page. Same split
 * corrupts localStorage sessions and Bearer refresh in parallel.
 *
 * Fix: when the app boots on the 127.0.0.1 loopback twin, bounce once to
 * the identical localhost URL (port/path/query/hash preserved). localhost
 * itself, LAN IPs, staging ports, and prod domains are NEVER touched —
 * bouncing a remote host would strand a different machine's session, and
 * non-loopback origins need their own provider registration anyway.
 */

export function canonicalLoopbackRedirect(current: string): string | null {
  let u: URL;
  try {
    u = new URL(current);
  } catch {
    return null;
  }
  if (u.hostname !== '127.0.0.1') return null;
  u.hostname = 'localhost';
  const next = u.toString();
  return next === current ? null : next;
}

/** App-boot redirect. Returns true when a navigation was issued. */
export function enforceCanonicalLoopback(): boolean {
  try {
    const next = canonicalLoopbackRedirect(window.location.href);
    if (next === null) return false;
    window.console.info(`[scout] canonical origin → ${next}`);
    window.location.replace(next);
    return true;
  } catch {
    return false;
  }
}
