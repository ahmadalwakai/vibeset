import 'server-only';
import { sql } from 'drizzle-orm';
import type { AdminTransaction } from './admin-access';
import { z } from 'zod';
import { AppError } from '../errors';

export async function lockAppCatalog(tx: AdminTransaction): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(812714,2)`);
}
export async function assertAppCatalogCapacity(
  tx: AdminTransaction,
  added: number | readonly string[],
): Promise<void> {
  const extra =
    typeof added === 'number'
      ? sql`${added}::int`
      : sql`(SELECT count(*)::int FROM jsonb_array_elements_text(${JSON.stringify(added)}::jsonb) candidate(slug) WHERE NOT EXISTS(SELECT 1 FROM apps WHERE apps.slug=candidate.slug))`;
  const rows = await tx.execute(
    sql`SELECT (SELECT count(*)::int FROM apps WHERE is_active=true)+${extra} AS total`,
  );
  const total = z.object({ total: z.number().int().nonnegative() }).parse(rows.rows[0]).total;
  if (total > 5000)
    throw new AppError('VALIDATION', 'Active catalogue limit reached', { isActive: ['limit'] });
}
