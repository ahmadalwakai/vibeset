import 'server-only';

import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index';
import { rateLimit } from '../db/schema/auth';
import { hashAuthIdentifier } from './auth-privacy';
import type { AuthRateLimitDecision, AuthRateLimitRule } from '../lib/auth';

const inputSchema = z.object({
  key: z.string().min(1),
  rule: z.object({
    window: z.number().int().positive().max(2_147_483_647),
    max: z.number().int().positive().max(2_147_483_647),
  }),
});

export async function consumeAuthRateLimit(
  key: string,
  rule: AuthRateLimitRule,
): Promise<AuthRateLimitDecision> {
  const input = inputSchema.parse({ key, rule });
  const hashedKey = hashAuthIdentifier(input.key);
  const now = Date.now();
  const cutoff = now - input.rule.window * 1_000;
  const accepted = await db
    .insert(rateLimit)
    .values({ id: randomUUID(), key: hashedKey, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`CASE WHEN ${rateLimit.lastRequest} <= ${cutoff} THEN 1 ELSE ${rateLimit.count} + 1 END`,
        lastRequest: now,
      },
      setWhere: sql`${rateLimit.lastRequest} <= ${cutoff} OR ${rateLimit.count} < ${input.rule.max}`,
    })
    .returning({ id: rateLimit.id });

  if (accepted.length > 0) return { allowed: true, retryAfter: null };

  // The UPSERT decides atomically. This denial-only read never changes the bucket.
  const [blocked] = await db
    .select({ lastRequest: rateLimit.lastRequest })
    .from(rateLimit)
    .where(eq(rateLimit.key, hashedKey))
    .limit(1);
  const remaining = blocked
    ? Math.ceil((blocked.lastRequest + input.rule.window * 1_000 - Date.now()) / 1_000)
    : input.rule.window;

  // A concurrent reset/deletion or clock skew must not produce an invalid Retry-After.
  return {
    allowed: false,
    retryAfter: Math.max(1, Math.min(input.rule.window, remaining)),
  };
}
