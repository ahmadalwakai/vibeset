import 'server-only';

import { eq } from 'drizzle-orm';
import type { dbPool } from '../../db/pool';
import { user } from '../../db/schema/auth';
import { actorSchema, type Actor } from '../../lib/theme-status';
import { AppError } from '../errors';

export type AdminTransaction = Parameters<Parameters<typeof dbPool.transaction>[0]>[0];
export type AdminPrincipal = Extract<Actor, { kind: 'user' }>;

/** Fresh authority remains locked until the surrounding mutation and audit commit. */
export async function requireAdminPrincipal(
  tx: AdminTransaction,
  actor: Actor,
): Promise<AdminPrincipal> {
  const principal = actorSchema.safeParse(actor);
  if (!principal.success) throw new AppError('VALIDATION');
  if (principal.data.kind !== 'user') throw new AppError('FORBIDDEN');
  const [current] = await tx
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, principal.data.userId))
    .for('share');
  if (!current) throw new AppError('UNAUTHENTICATED');
  if (current.role !== 'admin' || current.banned) throw new AppError('FORBIDDEN');
  return { ...principal.data, role: 'admin' };
}
