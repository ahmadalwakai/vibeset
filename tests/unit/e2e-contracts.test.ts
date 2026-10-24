import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { normalizeE2eDatabaseIdentity } from '../../lib/e2e';
import { e2ePasswordSignInSchema } from '../../lib/validation/auth';
import { e2eManifestSchema, E2E_PROJECT_NAMES, E2E_ROLES } from '../e2e/manifest';
import { fingerprintE2eDatabase } from '../../server/e2e';
import { retryAfterMilliseconds } from '../e2e/auth-rate-limit';

vi.mock('server-only', () => ({}));

function fixture(): unknown {
  const runId = randomUUID();
  return {
    v: 1,
    runId,
    mode: 'local',
    baseURL: 'http://localhost:3000',
    assetOrigin: 'http://localhost:3001',
    fixturePrefix: `e2e-${runId}`,
    databaseFingerprint: 'a'.repeat(64),
    createdAt: new Date().toISOString(),
    projects: Object.fromEntries(
      E2E_PROJECT_NAMES.map((project) => [
        project,
        {
          accounts: Object.fromEntries(
            E2E_ROLES.map((role) => [
              role,
              {
                id: `${project}-${role}`,
                email: `e2e-${project}-${role}-${runId}@example.invalid`,
                password: 'p'.repeat(40),
              },
            ]),
          ),
        },
      ]),
    ),
    themes: Array.from({ length: 25 }, (_, index) => ({
      id: randomUUID(),
      slug: `e2e-${runId}-theme-${index}`,
      nameEn: `Theme ${index}`,
    })),
    aestheticSlug: `e2e-${runId}`,
    aestheticNameEn: 'Test aesthetic',
    searchTerm: 'Test',
    editorialCollection: null,
    generationRunId: null,
    publishEnabled: false,
  };
}
describe('test-only authentication and deployment identity', () => {
  it('honours bounded standard and Better Auth retry delays without retrying early', () => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    expect(retryAfterMilliseconds('10', now)).toBe(10_100);
    expect(retryAfterMilliseconds('Sat, 24 Oct 2026 12:00:15 GMT', now)).toBe(15_100);
    expect(retryAfterMilliseconds('0', now)).toBe(1100);
    for (const invalid of [undefined, '', '61', '-1', '1.5', 'malformed'])
      expect(retryAfterMilliseconds(invalid, now)).toBeNull();
  });
  it('matches pooled/direct credentials for one endpoint while distinguishing databases and ports', () => {
    const pooled =
      'postgresql://first:secret@ep-test-pooler.eu.neon.tech/test%20db?sslmode=require';
    const direct = 'postgres://second:other@ep-test.eu.neon.tech:5432/test%20db';
    expect(normalizeE2eDatabaseIdentity(pooled)).toBe(normalizeE2eDatabaseIdentity(direct));
    expect(fingerprintE2eDatabase(pooled)).toBe(fingerprintE2eDatabase(direct));
    expect(fingerprintE2eDatabase(direct)).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintE2eDatabase(direct)).not.toBe(
      fingerprintE2eDatabase(direct.replace('test%20db', 'different')),
    );
    expect(fingerprintE2eDatabase(direct)).not.toBe(
      fingerprintE2eDatabase(direct.replace(':5432/', ':5433/')),
    );
    expect(() => normalizeE2eDatabaseIdentity('https://example.com/db')).toThrow();
    expect(() => normalizeE2eDatabaseIdentity('postgresql://test.neon.tech')).toThrow();
  });
  it('bounds passwords without trimming meaningful password characters', () => {
    expect(
      e2ePasswordSignInSchema.parse({ email: ' user@example.invalid ', password: ' 12345678 ' })
        .password,
    ).toBe(' 12345678 ');
    for (const password of ['', 'short', 'x'.repeat(129)])
      expect(
        e2ePasswordSignInSchema.safeParse({ email: 'user@example.invalid', password }).success,
      ).toBe(false);
    expect(
      e2ePasswordSignInSchema.safeParse({ email: 'bad', password: 'x'.repeat(32) }).success,
    ).toBe(false);
  });
  it('requires unique disposable accounts and enough published rows to exercise pagination', () => {
    const valid = e2eManifestSchema.parse(fixture());
    expect(valid.themes).toHaveLength(25);
    const reused = structuredClone(valid);
    reused.projects.android.accounts.user = reused.projects.iphone.accounts.user;
    expect(e2eManifestSchema.safeParse(reused).success).toBe(false);
    expect(
      e2eManifestSchema.safeParse({ ...valid, themes: valid.themes.slice(0, 24) }).success,
    ).toBe(false);
    expect(
      e2eManifestSchema.safeParse({ ...valid, fixturePrefix: 'e2e-another-run' }).success,
    ).toBe(false);
    expect(e2eManifestSchema.safeParse({ ...valid, baseURL: 'https://vibeset.app' }).success).toBe(
      false,
    );
    const unrelated = structuredClone(valid);
    unrelated.themes[0] = {
      ...valid.themes[0],
      id: randomUUID(),
      slug: 'unrelated-theme',
      nameEn: 'Other',
    };
    expect(e2eManifestSchema.safeParse(unrelated).success).toBe(false);
    expect(
      e2eManifestSchema.safeParse({
        ...valid,
        editorialCollection: { id: randomUUID(), slug: 'unrelated-collection' },
      }).success,
    ).toBe(false);
  });
});
