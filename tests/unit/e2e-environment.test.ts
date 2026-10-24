import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertOwnedE2ePath, e2eEnvironment, verifyE2eApp } from '../../scripts/e2e/environment';

const source = {
  TEST_DATABASE_URL: 'postgresql://secret@ep-test-pooler.eu.aws.neon.tech/neondb',
  DATABASE_URL: 'postgresql://ordinary@ep-dev.eu.aws.neon.tech/neondb',
  DATABASE_URL_UNPOOLED: 'postgresql://ordinary@ep-dev.eu.aws.neon.tech/neondb',
  R2_ACCESS_KEY_ID: 'keep-out-of-local-app',
  GOOGLE_CLIENT_SECRET: 'keep-out-of-local-app',
};
const remoteSource = {
  ...source,
  VERCEL_ENV: 'preview',
  E2E_ALLOWED_REMOTE_ORIGIN: 'https://qa.example.com',
  INTERNAL_API_SECRET: 'fixture-internal-secret-'.repeat(2),
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_ACCESS_KEY_ID: 'fixture-access-key',
  R2_SECRET_ACCESS_KEY: 'fixture-secret-key',
  R2_BUCKET: 'vibeset-e2e-fixture',
  E2E_ALLOWED_STORAGE_BUCKET: 'vibeset-e2e-fixture',
};
afterEach(() => vi.unstubAllGlobals());
describe('E2E isolation before server imports', () => {
  it('binds only the explicit isolated test DB and clears live providers locally', () => {
    const env = e2eEnvironment(source, 'local', 'http://localhost:3000', 'http://localhost:3001');
    expect(env.DATABASE_URL).toBe(source.TEST_DATABASE_URL);
    expect(env.DATABASE_URL_UNPOOLED).toBe('postgresql://secret@ep-test.eu.aws.neon.tech/neondb');
    expect(env.E2E_TEST_AUTH).toBe('1');
    expect(env.R2_ACCESS_KEY_ID).toBe('');
    expect(env.GOOGLE_CLIENT_SECRET).toBe('');
    expect(source.DATABASE_URL).toContain('ep-dev');
  });
  it('changes only the hostname when deriving a direct URL', () => {
    const pooled =
      'postgresql://fixture:secret-pooler.example@ep-test-pooler.eu.aws.neon.tech/neondb?sslmode=require';
    const env = e2eEnvironment(
      { ...source, TEST_DATABASE_URL: pooled },
      'local',
      'http://localhost:3000',
      'http://127.0.0.1:3001',
    );
    const direct = new URL(env.DATABASE_URL_UNPOOLED ?? '');
    expect(direct.hostname).toBe('ep-test.eu.aws.neon.tech');
    expect(direct.password).toBe(new URL(pooled).password);
    expect(direct.search).toBe('?sslmode=require');
  });
  it.each([
    ['http://127.0.0.1:3000', 'http://localhost:3001'],
    ['http://[::1]:3000', 'http://localhost:3001'],
    ['https://localhost:3000', 'http://localhost:3001'],
    ['http://localhost:3000', 'https://localhost:3001'],
    ['http://localhost:3000', 'http://other.example.com:3001'],
  ])(
    'rejects local origins incompatible with the canonical app or HTTP asset listener',
    (app, assets) => {
      expect(() => e2eEnvironment(source, 'local', app, assets)).toThrow('HTTP localhost');
    },
  );
  it.each([
    { ...source, VERCEL_ENV: 'production' },
    { ...source, NODE_ENV: 'production' },
    { ...source, TEST_DATABASE_URL: undefined },
    { ...source, TEST_DATABASE_URL: 'postgresql://other@EP-DEV-pooler.eu.aws.neon.tech/otherdb' },
    {
      ...source,
      E2E_DATABASE_URL_UNPOOLED: 'postgresql://secret@ep-other.eu.aws.neon.tech/neondb',
    },
  ])('refuses unsafe database configuration without mutation', (env) => {
    expect(() =>
      e2eEnvironment(env, 'local', 'http://localhost:3000', 'http://localhost:3001'),
    ).toThrow();
  });
  it('requires an exact approved remote origin and preview context', () => {
    const env = remoteSource;
    expect(() =>
      e2eEnvironment(env, 'remote', 'https://wrong.example.com', 'https://cdn.example.com'),
    ).toThrow();
    expect(
      e2eEnvironment(env, 'remote', 'https://qa.example.com', 'https://cdn.example.com').VERCEL_ENV,
    ).toBe('preview');
    expect(() =>
      e2eEnvironment(source, 'local', 'https://qa.example.com', 'http://localhost:3001'),
    ).toThrow();
  });
  it.each([
    { INTERNAL_API_SECRET: '' },
    { INTERNAL_API_SECRET: 'short' },
    { R2_ACCOUNT_ID: '' },
    { R2_ACCESS_KEY_ID: '' },
    { R2_SECRET_ACCESS_KEY: '' },
    { R2_BUCKET: '' },
    { E2E_ALLOWED_STORAGE_BUCKET: '' },
    { E2E_ALLOWED_STORAGE_BUCKET: 'other-bucket' },
    { R2_BUCKET: 'vibeset-assets', E2E_ALLOWED_STORAGE_BUCKET: 'vibeset-assets' },
  ])(
    'refuses missing remote credentials, unapproved buckets and production storage',
    (override) => {
      expect(() =>
        e2eEnvironment(
          { ...remoteSource, ...override },
          'remote',
          'https://qa.example.com',
          'https://cdn.example.com',
        ),
      ).toThrow();
    },
  );
  it('never generates a replacement internal secret remotely and refuses mixed-content assets', () => {
    const env = e2eEnvironment(
      remoteSource,
      'remote',
      'https://qa.example.com',
      'https://cdn.example.com',
    );
    expect(env.INTERNAL_API_SECRET).toBe(remoteSource.INTERNAL_API_SECRET);
    expect(env.R2_BUCKET).toBe(remoteSource.E2E_ALLOWED_STORAGE_BUCKET);
    expect(() =>
      e2eEnvironment(remoteSource, 'remote', 'https://qa.example.com', 'http://cdn.example.com'),
    ).toThrow('HTTPS');
  });
  it('refuses cleanup paths escaping the validated UUID run directory', () => {
    const id = '10000000-0000-4000-8000-000000000001';
    expect(() => assertOwnedE2ePath('.env.local', id)).toThrow();
    expect(() => assertOwnedE2ePath(`.tmp/e2e/${id}/../other/journal.json`, id)).toThrow();
    expect(assertOwnedE2ePath(`.tmp/e2e/${id}/journal.json`, id)).toMatch(/journal\.json$/);
  });
  it('requires both server-rendered gate markers and never follows a redirect', async () => {
    const fingerprint = 'a'.repeat(64),
      fetcher = vi.fn().mockResolvedValue(new Response('ordinary sign-in'));
    vi.stubGlobal('fetch', fetcher);
    await expect(verifyE2eApp({ baseURL: 'https://qa.example.com', fingerprint })).rejects.toThrow(
      'fingerprint',
    );
    fetcher.mockResolvedValue(
      new Response(
        `<form data-e2e-enabled="true" data-database-fingerprint="${fingerprint}"></form>`,
      ),
    );
    await verifyE2eApp({
      baseURL: 'https://qa.example.com',
      fingerprint,
      bypass: 'test-only-bypass',
    });
    expect(fetcher).toHaveBeenLastCalledWith(
      new URL('https://qa.example.com/sign-in'),
      expect.objectContaining({
        redirect: 'error',
        headers: { 'x-vercel-protection-bypass': 'test-only-bypass' },
      }),
    );
  });
});
