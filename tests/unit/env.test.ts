import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ClientEnvironment } from '../../lib/env.client';
import type { EnvironmentSource, ServerEnvironment } from '../../lib/env.server';

const validSource: Record<string, string> = {
  NODE_ENV: 'test',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/vibeset',
  DATABASE_URL_UNPOOLED: 'postgres://user:password@localhost:5432/vibeset',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  IP_HASH_SALT: 'b'.repeat(32),
  CRON_SECRET: 'c'.repeat(32),
  INTERNAL_API_SECRET: 'd'.repeat(32),
};

let parseServerEnv: (source: EnvironmentSource) => ServerEnvironment;
let parseClientEnv: (source: unknown) => ClientEnvironment;

beforeAll(async () => {
  for (const [key, value] of Object.entries(validSource)) {
    vi.stubEnv(key, value);
  }
  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('E2E_TEST_AUTH', undefined);
  vi.stubEnv('SKIP_ENV_VALIDATION', undefined);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://vibeset.app');
  vi.stubEnv('NEXT_PUBLIC_CDN_URL', 'https://cdn.vibeset.app');
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', undefined);

  ({ parseServerEnv } = await import('../../lib/env.server'));
  ({ parseClientEnv } = await import('../../lib/env.client'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('server environment', () => {
  it('accepts the core bootstrap configuration without later service credentials', () => {
    const env = parseServerEnv(validSource);

    expect(env.DATABASE_URL).toBe(validSource.DATABASE_URL);
    expect(env.BETTER_AUTH_SECRET).toHaveLength(32);
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([]);
    expect(env.E2E_TEST_AUTH).toBe('0');
    expect(env.SKIP_ENV_VALIDATION).toBe('0');
  });

  it('names the missing required key without including secret values', () => {
    const source = { ...validSource, DATABASE_URL: undefined };

    expect(() => parseServerEnv(source)).toThrow(/DATABASE_URL/);
    expect(() => parseServerEnv(source)).not.toThrow(validSource.BETTER_AUTH_SECRET);
  });

  it.each(['BETTER_AUTH_SECRET', 'IP_HASH_SALT', 'CRON_SECRET', 'INTERNAL_API_SECRET'])(
    'rejects short or whitespace-only %s',
    (key) => {
      expect(() => parseServerEnv({ ...validSource, [key]: 'x'.repeat(31) })).toThrow(key);
      expect(() => parseServerEnv({ ...validSource, [key]: ' '.repeat(32) })).toThrow(key);
    },
  );

  it.each(['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'TEST_DATABASE_URL'])(
    'rejects a non-Postgres %s',
    (key) => {
      expect(() =>
        parseServerEnv({ ...validSource, [key]: 'https://database.example.com/vibeset' }),
      ).toThrow(key);
    },
  );

  it('requires an HTTP(S) auth URL', () => {
    expect(() =>
      parseServerEnv({ ...validSource, BETTER_AUTH_URL: 'javascript:alert(1)' }),
    ).toThrow(/BETTER_AUTH_URL/);
  });

  it('normalizes blank future service credentials to undefined', () => {
    const env = parseServerEnv({
      ...validSource,
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '  ',
      RESEND_API_KEY: '',
      EMAIL_FROM: '',
      R2_ACCOUNT_ID: '',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
      R2_BUCKET: '',
      TEST_DATABASE_URL: '',
      SENTRY_DSN: '',
      BETTER_AUTH_TRUSTED_ORIGINS: '',
    });

    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.EMAIL_FROM).toBeUndefined();
    expect(env.R2_ACCOUNT_ID).toBeUndefined();
    expect(env.R2_ACCESS_KEY_ID).toBeUndefined();
    expect(env.R2_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.R2_BUCKET).toBeUndefined();
    expect(env.TEST_DATABASE_URL).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([]);
  });

  it('parses and normalizes comma-separated trusted origins', () => {
    const env = parseServerEnv({
      ...validSource,
      BETTER_AUTH_TRUSTED_ORIGINS: ' https://staging.vibeset.app/, http://localhost:3001 ',
    });

    expect(env.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([
      'https://staging.vibeset.app',
      'http://localhost:3001',
    ]);
  });

  it.each([
    'https://staging.vibeset.app/path',
    'https://staging.vibeset.app?next=/',
    'https://user:password@staging.vibeset.app',
    'https://staging.vibeset.app,',
    '*',
  ])('rejects an invalid trusted origin: %s', (origin) => {
    expect(() => parseServerEnv({ ...validSource, BETTER_AUTH_TRUSTED_ORIGINS: origin })).toThrow(
      /BETTER_AUTH_TRUSTED_ORIGINS/,
    );
  });

  it('validates optional email and monitoring values when supplied', () => {
    expect(
      parseServerEnv({ ...validSource, EMAIL_FROM: 'Vibeset <hello@vibeset.app>' }).EMAIL_FROM,
    ).toBe('Vibeset <hello@vibeset.app>');
    expect(() => parseServerEnv({ ...validSource, EMAIL_FROM: 'invalid' })).toThrow(/EMAIL_FROM/);
    expect(() => parseServerEnv({ ...validSource, SENTRY_DSN: 'invalid' })).toThrow(/SENTRY_DSN/);
  });

  it('allows test auth in development and production-mode Vercel previews', () => {
    expect(
      parseServerEnv({
        ...validSource,
        NODE_ENV: 'production',
        VERCEL_ENV: 'preview',
        E2E_TEST_AUTH: '1',
      }).E2E_TEST_AUTH,
    ).toBe('1');
  });

  it('refuses test auth in a Vercel production deployment', () => {
    expect(() =>
      parseServerEnv({ ...validSource, VERCEL_ENV: 'production', E2E_TEST_AUTH: '1' }),
    ).toThrow(/E2E_TEST_AUTH=1 is forbidden in production/);
  });

  it('checks the production test-auth ban before a requested validation skip', () => {
    expect(() =>
      parseServerEnv({
        VERCEL_ENV: 'production',
        E2E_TEST_AUTH: '1',
        SKIP_ENV_VALIDATION: '1',
        CI: 'true',
        npm_lifecycle_event: 'typecheck',
      }),
    ).toThrow(/E2E_TEST_AUTH=1 is forbidden in production/);
  });

  it.each(['NODE_ENV', 'VERCEL_ENV', 'E2E_TEST_AUTH', 'SKIP_ENV_VALIDATION'])(
    'validates the %s runtime flag',
    (key) => {
      expect(() => parseServerEnv({ ...validSource, [key]: 'unexpected' })).toThrow(key);
    },
  );

  it.each(['lint', 'typecheck'])('supports a secret-free %s CI import', (command) => {
    const env = parseServerEnv({
      SKIP_ENV_VALIDATION: '1',
      CI: 'true',
      npm_lifecycle_event: command,
    });

    expect(env.SKIP_ENV_VALIDATION).toBe('1');
    expect(() => env.BETTER_AUTH_SECRET).toThrow();
    expect(() => env.DATABASE_URL).toThrow();
  });

  it.each([
    { CI: undefined, npm_lifecycle_event: 'typecheck' },
    { CI: 'true', npm_lifecycle_event: 'build' },
    { CI: 'true', npm_lifecycle_event: 'dev' },
    { CI: 'true', npm_lifecycle_event: 'start' },
    { CI: 'true', npm_lifecycle_event: 'test' },
  ])('refuses a skip outside static-check CI: %j', (context) => {
    expect(() => parseServerEnv({ ...validSource, ...context, SKIP_ENV_VALIDATION: '1' })).toThrow(
      /lint\/typecheck-only CI/,
    );
  });

  it('refuses importing the server environment in a browser', async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();

    await expect(import('../../lib/env.server')).rejects.toThrow('server env imported on client');
  });
});

describe('client environment', () => {
  it('exposes only the validated public values', () => {
    const env = parseClientEnv({
      NEXT_PUBLIC_SITE_URL: 'https://vibeset.app',
      NEXT_PUBLIC_CDN_URL: 'https://cdn.vibeset.app',
      NEXT_PUBLIC_SENTRY_DSN: '',
      BETTER_AUTH_SECRET: validSource.BETTER_AUTH_SECRET,
    });

    expect(env).toEqual({
      NEXT_PUBLIC_SITE_URL: 'https://vibeset.app',
      NEXT_PUBLIC_CDN_URL: 'https://cdn.vibeset.app',
      NEXT_PUBLIC_SENTRY_DSN: undefined,
    });
  });

  it.each(['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_CDN_URL'])(
    'names a missing or invalid %s',
    (key) => {
      const source = {
        NEXT_PUBLIC_SITE_URL: 'https://vibeset.app',
        NEXT_PUBLIC_CDN_URL: 'https://cdn.vibeset.app',
      };

      expect(() => parseClientEnv({ ...source, [key]: undefined })).toThrow(key);
      expect(() => parseClientEnv({ ...source, [key]: 'ftp://vibeset.app' })).toThrow(key);
    },
  );
});
