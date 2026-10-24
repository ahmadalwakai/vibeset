import 'server-only';

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AdminCounts } from '../../lib/admin';
import { requireAdmin } from '../guards';

const countsSchema = z.object({
  pendingReview: z.number().int().nonnegative(),
  openReports: z.number().int().nonnegative(),
  pendingCreators: z.number().int().nonnegative(),
});

export async function getAdminCounts(): Promise<AdminCounts> {
  await requireAdmin();
  const { db } = await import('../../db');
  const result = await db.execute(sql`SELECT
    (SELECT count(*)::int FROM themes WHERE status = 'pending_review') AS "pendingReview",
    (SELECT count(*)::int FROM reports WHERE status = 'open') AS "openReports",
    (SELECT count(*)::int FROM creator_profiles WHERE status = 'pending') AS "pendingCreators"`);
  return countsSchema.parse(result.rows[0]);
}
