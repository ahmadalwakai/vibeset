import 'server-only';

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index';

const inputSchema = z.object({
  key: z.string().min(1),
  limit: z.number().int().positive().max(2_147_483_647),
  windowSec: z.number().int().positive().max(2_147_483_647),
});
const countSchema = z.object({ count: z.number().int().positive() });

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ allowed: boolean; count: number }> {
  const input = inputSchema.parse({ key, limit, windowSec });
  const result = await db.execute(sql`
    INSERT INTO app_rate_limits (key, count, window_start) VALUES (${input.key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN app_rate_limits.window_start < now() - make_interval(secs => ${input.windowSec})
        THEN 1 ELSE app_rate_limits.count + 1 END,
      window_start = CASE WHEN app_rate_limits.window_start < now() - make_interval(secs => ${input.windowSec})
        THEN now() ELSE app_rate_limits.window_start END
    RETURNING count
  `);
  const { count } = countSchema.parse(result.rows[0]);
  return { allowed: count <= input.limit, count };
}
