import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/ });

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: httpUrl,
  NEXT_PUBLIC_CDN_URL: httpUrl,
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    httpUrl.optional(),
  ),
});

export type ClientEnvironment = z.infer<typeof clientSchema>;

export function parseClientEnv(source: unknown): ClientEnvironment {
  return clientSchema.parse(source);
}

export const env: ClientEnvironment = parseClientEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_CDN_URL: process.env.NEXT_PUBLIC_CDN_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});
