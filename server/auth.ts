import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { admin, magicLink } from 'better-auth/plugins';
import { env } from '../lib/env.server';
import type { AuthRateLimitDecision } from '../lib/auth';
import { dbPool } from '../db/pool';
import * as schema from '../db/schema/index';

if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
  throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together');
}

export const auth = betterAuth({
  appName: 'Vibeset',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.NEXT_PUBLIC_SITE_URL, ...env.BETTER_AUTH_TRUSTED_ORIGINS],
  database: drizzleAdapter(dbPool, { provider: 'pg', schema }),
  emailAndPassword: { enabled: env.E2E_TEST_AUTH === '1' },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: 'select_account',
          },
        }
      : {},
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  rateLimit: {
    enabled: true,
    storage: 'database',
    customStorage: {
      consume: async (key, rule): Promise<AuthRateLimitDecision> => {
        const { consumeAuthRateLimit } = await import('./auth-rate-limit');
        return consumeAuthRateLimit(key, rule);
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session): Promise<{ data: typeof session }> => {
          const { hashAuthIdentifier } = await import('./auth-privacy');
          return {
            data: {
              ...session,
              ipAddress: session.ipAddress ? hashAuthIdentifier(session.ipAddress) : null,
            },
          };
        },
      },
    },
  },
  user: {
    additionalFields: {
      locale: { type: 'string', required: false, defaultValue: 'en', input: true },
    },
    deleteUser: {
      enabled: true,
      beforeDelete: async (user): Promise<void> => {
        const { cleanupUserContent } = await import('./services/account');
        await cleanupUserContent(user.id);
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 600,
      sendMagicLink: async ({ email, url }): Promise<void> => {
        const { sendMagicLinkEmail } = await import('./email');
        await sendMagicLinkEmail({ to: email, url });
      },
    }),
    admin({ defaultRole: 'user', adminRoles: ['admin'] }),
    nextCookies(),
  ],
});
