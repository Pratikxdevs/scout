/**
 * OAuth failure codes (better-auth `?error=` on the callback) → honest,
 * actionable UI copy. Unknown codes fall back to a generic line — the raw
 * code is appended so bug reports stay precise.
 */
export function oauthErrorCopy(code: string | null): string | null {
  if (code === null || code === '') return null;
  switch (code) {
    case 'account_not_linked':
    case 'unable_to_link_account':
      return 'This Google/GitHub email already has a password account here. Log in with your email and password, then connect it in Settings → Connected logins.';
    case 'state_mismatch':
      return 'The login handshake expired — usually a different localhost address (use http://localhost:2992, not 127.0.0.1) or blocked cookies. Try again.';
    case 'invalid_code':
    case 'unable_to_get_user_info':
      return 'Google/GitHub did not finish the handshake — try again.';
    case 'oauth_provider_not_found':
      return 'That login provider is not configured on this server yet.';
    case 'email_not_found':
      return 'The provider did not share an email address — check its email privacy settings and retry.';
    default:
      return `Social sign-in failed (${code}) — try again or use email.`;
  }
}

/** Read a one-shot `?error=` param WITHOUT clearing (StrictMode-safe). */
export function readQueryError(param = 'error'): string | null {
  try {
    return new URLSearchParams(window.location.search).get(param);
  } catch {
    return null;
  }
}

/** Read + clear a one-shot `?error=` param (login/settings return targets). */
export function takeQueryError(param = 'error'): string | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const code = q.get(param);
    if (code === null) return null;
    q.delete(param);
    const rest = q.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : window.location.hash));
    return code;
  } catch {
    return null;
  }
}
