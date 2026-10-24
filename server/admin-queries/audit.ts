import 'server-only';

import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { user } from '../../db/schema/auth';
import { auditLog } from '../../db/schema/system';
import type { AdminAuditEntry, AdminPage } from '../../lib/admin';
import { adminAuditQuerySchema } from '../../lib/validation/admin-operations';
import { adminQueryInput } from '../../lib/validation/admin-queries';
import { requireAdmin } from '../guards';
import { auditColumns, auditDto, offsetPage } from './admin-shared';

export async function listAdminAudit(raw: unknown = {}): Promise<AdminPage<AdminAuditEntry>> {
  await requireAdmin();
  const query = adminAuditQuerySchema.parse(adminQueryInput(raw));
  const where = and(
    query.actor ? eq(auditLog.actorId, query.actor) : undefined,
    query.action ? sql`starts_with(${auditLog.action},${query.action})` : undefined,
    query.entityType ? eq(auditLog.entityType, query.entityType) : undefined,
    query.entityId ? eq(auditLog.entityId, query.entityId) : undefined,
    query.from ? gte(auditLog.createdAt, new Date(query.from + 'T00:00:00.000Z')) : undefined,
    query.to
      ? lt(
          auditLog.createdAt,
          new Date(new Date(query.to + 'T00:00:00.000Z').getTime() + 86_400_000),
        )
      : undefined,
  );
  const { db } = await import('../../db');
  const [rows, totals] = await Promise.all([
    db
      .select(auditColumns)
      .from(auditLog)
      .leftJoin(user, eq(auditLog.actorId, user.id))
      .where(where)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(50)
      .offset((query.page - 1) * 50),
    db.select({ total: count() }).from(auditLog).where(where),
  ]);
  return offsetPage(rows.map(auditDto), totals[0]?.total ?? 0, query.page, 50);
}
