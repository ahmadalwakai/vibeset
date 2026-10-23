import { z } from 'zod';

if (typeof window !== 'undefined') {
  throw new Error('server env imported on client');
}

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

const optionalText = z.preprocess(blankToUndefined, z.string().trim().min(1).optional());
const httpUrl = z.url({ protocol: /^https?$/ });
const postgresUrl = z.url({ protocol: /^postgres(?:ql)?$/ });
const optionalHttpUrl = z.preprocess(blankToUndefined, httpUrl.optional());
const secret = z.string().trim().min(32, 'Must contain at least 32 characters');
const flag = z.preprocess(blankToUndefined, z.enum(['0', '1']).default('0'));

const trustedOrigin = httpUrl
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return (
          url.pathname === '/' &&
          url.search === '' &&
          url.hash === '' &&
          url.username === '' &&
          url.password === ''
        );
      } catch {
        return false;
      }
    },
    { error: 'Must be an HTTP(S) origin without a path, credentials, query, or fragment' },
  )
  .transform((value) => new URL(value).origin);

const trustedOrigins = z.preprocess(
  blankToUndefined,
  z
    .string()
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(trustedOrigin))
    .default([]),
);

const emailFrom = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .refine(
      (value) => {
        const address = value.match(/^[^<>\r\n]+<([^<>\r\n]+)>$/)?.[1] ?? value;
        return !/[\r\n]/.test(value) && z.email().safeParse(address.trim()).success;
      },
      { error: 'Must be an email address or a display name followed by <email>' },
    )
    .optional(),
);

const runtimeSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL_ENV: z.preprocess(
    blankToUndefined,
    z.enum(['development', 'preview', 'production']).optional(),
  ),
  E2E_TEST_AUTH: flag,
  SKIP_ENV_VALIDATION: flag,
});

type RuntimeEnvironment = z.infer<typeof runtimeSchema>;

function refuseProductionTestAuth(value: RuntimeEnvironment, context: z.RefinementCtx): void {
  if (value.E2E_TEST_AUTH === '1' && value.VERCEL_ENV === 'production') {
    context.addIssue({
      code: 'custom',
      path: ['E2E_TEST_AUTH'],
      message: 'E2E_TEST_AUTH=1 is forbidden in production',
    });
  }
}

const serverSchema = z
  .object({
    ...runtimeSchema.shape,
    NEXT_PUBLIC_SITE_URL: httpUrl,
    DATABASE_URL: postgresUrl,
    DATABASE_URL_UNPOOLED: postgresUrl,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: httpUrl,
    BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins,
    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,
    RESEND_API_KEY: optionalText,
    EMAIL_FROM: emailFrom,
    R2_ACCOUNT_ID: optionalText,
    R2_ACCESS_KEY_ID: optionalText,
    R2_SECRET_ACCESS_KEY: optionalText,
    R2_BUCKET: optionalText,
    IP_HASH_SALT: secret,
    CRON_SECRET: secret,
    INTERNAL_API_SECRET: secret,
    TEST_DATABASE_URL: z.preprocess(blankToUndefined, postgresUrl.optional()),
    SENTRY_DSN: optionalHttpUrl,
  })
  .superRefine(refuseProductionTestAuth);

export type ServerEnvironment = z.infer<typeof serverSchema>;

function deferValidation(source: EnvironmentSource): ServerEnvironment {
  // CI tooling may load this module without secrets. Reading a value still validates it.
  const descriptors = Object.fromEntries(
    Object.entries(serverSchema.shape).map(([key, schema]) => [
      key,
      { enumerable: true, get: (): unknown => schema.parse(source[key]) },
    ]),
  );

  return Object.defineProperties({}, descriptors) as ServerEnvironment;
}

export function parseServerEnv(source: EnvironmentSource): ServerEnvironment {
  const runtime = runtimeSchema.superRefine(refuseProductionTestAuth).parse(source);

  if (runtime.SKIP_ENV_VALIDATION === '1') {
    const isCi = source.CI === 'true' || source.CI === '1';
    const isStaticCheck =
      source.npm_lifecycle_event === 'lint' || source.npm_lifecycle_event === 'typecheck';

    if (!isCi || !isStaticCheck) {
      throw new Error('SKIP_ENV_VALIDATION=1 is only allowed for lint/typecheck-only CI');
    }

    return deferValidation({ ...source });
  }

  return serverSchema.parse(source);
}

export const env: ServerEnvironment = parseServerEnv(process.env);
