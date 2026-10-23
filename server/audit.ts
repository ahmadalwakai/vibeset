import 'server-only';

import { z } from 'zod';
import { db } from '../db/index';
import { auditLog } from '../db/schema/system';
import type { NeonHttpQueryResultHKT } from 'drizzle-orm/neon-http';
import type { PgInsertBase } from 'drizzle-orm/pg-core';
import type { AuditEntry } from '../lib/audit';

const entrySchema = z.strictObject({
  actorId: z.string().min(1).nullable(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1).nullable().optional(),
  meta: z.record(z.string(), z.json()).default({}),
});

export function auditInsert(
  entry: AuditEntry,
): PgInsertBase<typeof auditLog, NeonHttpQueryResultHKT> {
  return db.insert(auditLog).values(entrySchema.parse(entry));
}

export async function audit(entry: AuditEntry): Promise<void> {
  await auditInsert(entry);
}
