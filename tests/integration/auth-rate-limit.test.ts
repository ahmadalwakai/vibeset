import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { rateLimit } from '../../db/schema/auth';
import type { hashAuthIdentifier as hash } from '../../server/auth-privacy';
import type { consumeAuthRateLimit as consume } from '../../server/auth-rate-limit';

vi.mock('server-only', () => ({}));
vi.mock('../../lib/env.server', () => ({
  env: { IP_HASH_SALT: 'auth-rate-limit-isolated-test-salt'.repeat(2) },
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
let database: ReturnType<typeof drizzle>;
let consumeAuthRateLimit: typeof consume;
let hashAuthIdentifier: typeof hash;
const insertedKeys = new Set<string>();

describe.skipIf(!testDatabaseUrl)('atomic private authentication rate limits', () => {
  beforeAll(async () => {
    if (!testDatabaseUrl)
      throw new Error('TEST_DATABASE_URL must identify an isolated test branch');
    database = drizzle(neon(testDatabaseUrl));
    vi.doMock('../../db/index', () => ({ db: database }));
    ({ consumeAuthRateLimit } = await import('../../server/auth-rate-limit'));
    ({ hashAuthIdentifier } = await import('../../server/auth-privacy'));
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    if (insertedKeys.size > 0) {
      await database.delete(rateLimit).where(inArray(rateLimit.key, [...insertedKeys]));
    }
    vi.doUnmock('../../db/index');
  });

  function newKey(): string {
    const key = `203.0.113.7:/auth-rate-limit-test/${randomUUID()}`;
    insertedKeys.add(hashAuthIdentifier(key));
    return key;
  }

  it('allows exactly the limit under concurrent first requests and persists only hashes', async () => {
    const key = newKey();
    const rule = { window: 60, max: 3 };
    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, () => consumeAuthRateLimit(key, rule)),
    );
    const results = outcomes.map((outcome) => {
      if (outcome.status === 'rejected') throw outcome.reason;
      return outcome.value;
    });

    expect(results.filter((result) => result.allowed)).toHaveLength(3);
    for (const result of results.filter((result) => !result.allowed)) {
      expect(result.retryAfter).toBeGreaterThanOrEqual(1);
      expect(result.retryAfter).toBeLessThanOrEqual(rule.window);
    }
    const [stored] = await database
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.key, hashAuthIdentifier(key)));
    expect(stored).toMatchObject({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      key: hashAuthIdentifier(key),
      count: 3,
    });
    expect(JSON.stringify(stored)).not.toContain('203.0.113.7');
    expect(await database.select().from(rateLimit).where(eq(rateLimit.key, key))).toEqual([]);
  });

  it('slides on acceptance, leaves blocked requests unchanged, and resets at the exact boundary', async () => {
    const key = newKey();
    const rule = { window: 10, max: 2 };
    const start = 1_800_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    expect((await consumeAuthRateLimit(key, rule)).allowed).toBe(true);
    now.mockReturnValue(start + 1_000);
    expect((await consumeAuthRateLimit(key, rule)).allowed).toBe(true);
    now.mockReturnValue(start + 10_000);
    expect(await consumeAuthRateLimit(key, rule)).toEqual({ allowed: false, retryAfter: 1 });
    const [blocked] = await database
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.key, hashAuthIdentifier(key)));
    expect(blocked).toMatchObject({ count: 2, lastRequest: start + 1_000 });
    now.mockReturnValue(start + 11_000);
    expect(await consumeAuthRateLimit(key, rule)).toEqual({ allowed: true, retryAfter: null });
    const [reset] = await database
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.key, hashAuthIdentifier(key)));
    expect(reset).toMatchObject({ count: 1, lastRequest: start + 11_000 });
  });
});
