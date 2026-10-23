import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { appRateLimits } from '../../db/schema/system';
import type { rateLimit as limitRequest } from '../../server/rate-limit';

vi.mock('server-only', () => ({}));
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
let database: ReturnType<typeof drizzle>;
let rateLimit: typeof limitRequest;
const keys = new Set<string>();

describe.skipIf(!testDatabaseUrl)(
  'atomic application rate limits on isolated test database',
  () => {
    beforeAll(async () => {
      const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(testDatabaseUrl);
      database = drizzle(neon(url));
      vi.doMock('../../db/index', () => ({ db: database }));
      ({ rateLimit } = await import('../../server/rate-limit'));
    });

    afterAll(async () => {
      if (keys.size > 0)
        await database.delete(appRateLimits).where(inArray(appRateLimits.key, [...keys]));
      vi.doUnmock('../../db/index');
    });

    function newKey(): string {
      const key = `integration:${randomUUID()}`;
      keys.add(key);
      return key;
    }

    async function race(key: string): Promise<{ allowed: boolean; count: number }[]> {
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, () => rateLimit(key, 7, 60)),
      );
      return results.map((result) => {
        if (result.status === 'rejected') throw result.reason;
        return result.value;
      });
    }

    it('counts all 20 concurrent requests exactly and admits only seven', async () => {
      const key = newKey();
      const results = await race(key);
      expect(results.map(({ count }) => count).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 20 }, (_, index) => index + 1),
      );
      expect(results.filter(({ allowed }) => allowed)).toHaveLength(7);
      const [stored] = await database
        .select()
        .from(appRateLimits)
        .where(eq(appRateLimits.key, key));
      expect(stored?.count).toBe(20);
      expect(await rateLimit(key, 7, 60)).toEqual({ allowed: false, count: 21 });
      const [denied] = await database
        .select()
        .from(appRateLimits)
        .where(eq(appRateLimits.key, key));
      expect(denied?.windowStart).toEqual(stored?.windowStart);
    }, 30_000);

    it('resets an expired fixed window only once under concurrent requests', async () => {
      const key = newKey();
      await database
        .insert(appRateLimits)
        .values({ key, count: 99, windowStart: sql`now() - interval '61 seconds'` });
      const results = await race(key);
      expect(results.map(({ count }) => count).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 20 }, (_, index) => index + 1),
      );
      expect(results.filter(({ allowed }) => allowed)).toHaveLength(7);
    }, 30_000);
  },
);
