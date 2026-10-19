import type { AuthConfig } from 'convex/server';

/**
 * Scout auth: Clerk. The JWT template "convex" in the Clerk application
 * mints tokens; its issuer domain lands here via
 * `npx convex env set CLERK_JWT_ISSUER_DOMAIN …`.
 * applicationID "convex" is the fixed audience Clerk uses for Convex.
 */
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN ?? '',
      applicationID: 'convex',
    },
  ],
};

export default authConfig satisfies AuthConfig;
