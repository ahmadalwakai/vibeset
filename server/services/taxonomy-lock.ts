import 'server-only';
import { sql } from 'drizzle-orm';
import type { AdminTransaction } from './admin-access';

/** Acquire before theme/tag locks; taxonomy operations need a stable membership set. */
export async function lockTaxonomy(
  tx: AdminTransaction,
  mode: 'shared' | 'exclusive',
): Promise<void> {
  await tx.execute(
    mode === 'shared'
      ? sql`SELECT pg_advisory_xact_lock_shared(812714, 1)`
      : sql`SELECT pg_advisory_xact_lock(812714, 1)`,
  );
}
