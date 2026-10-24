import 'server-only';

import { and, asc, eq, or, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { dbPool } from '../../db/pool';
import { session, user } from '../../db/schema/auth';
import type { ModerationResult } from '../../lib/admin-moderation';
import type { Actor } from '../../lib/theme-status';
import {
  adminBanUserSchema,
  adminSetRoleSchema,
  adminUnbanUserSchema,
} from '../../lib/validation/admin-moderation';
import { auditInsert } from '../audit';
import { AppError } from '../errors';
import { requireAdminPrincipal, type AdminPrincipal, type AdminTransaction } from './admin-access';
import { archiveOwnedThemes, moderationLock, moderationUser } from './moderation';

const roleInputSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(['user', 'admin']),
  actor: z.literal('system'),
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError('VALIDATION');
  return result.data;
}

/** The advisory lock serializes this predicate with every role/ban mutation. */
async function protectLastAdmin(
  tx: AdminTransaction,
  target: typeof user.$inferSelect,
): Promise<void> {
  if (target.role !== 'admin' || target.banned) return;
  const usable = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, 'admin'), or(eq(user.banned, false), isNull(user.banned))));
  if (usable.length <= 1) throw new AppError('CONFLICT', 'The last available admin is protected');
}
async function changeRole(
  tx: AdminTransaction,
  target: typeof user.$inferSelect,
  role: 'user' | 'admin',
  actorId: string | null,
): Promise<boolean> {
  if (target.role === role) return false;
  if (role === 'user') await protectLastAdmin(tx, target);
  await tx.update(user).set({ role }).where(eq(user.id, target.id));
  await tx.delete(session).where(eq(session.userId, target.id));
  await tx.execute(
    auditInsert({
      actorId,
      action: 'user.role.set',
      entityType: 'user',
      entityId: target.id,
      meta: {
        ...(actorId === null ? { actor: 'system' } : {}),
        before: { role: target.role },
        after: { role },
      },
    }),
  );
  return true;
}

/** Internal composition: caller holds moderationLock, fresh principal and target UPDATE lock. */
export async function banUserInTransaction(
  tx: AdminTransaction,
  target: typeof user.$inferSelect,
  principal: AdminPrincipal,
  reason: string,
  archiveThemes: boolean,
): Promise<ModerationResult & { tags: string[] }> {
  if (target.id === principal.userId)
    throw new AppError('FORBIDDEN', 'Self moderation is not allowed');
  if (!target.banned) {
    await protectLastAdmin(tx, target);
    await tx
      .update(user)
      .set({ banned: true, banReason: reason, banExpires: null })
      .where(eq(user.id, target.id));
    await tx.delete(session).where(eq(session.userId, target.id));
    await tx.execute(
      auditInsert({
        actorId: principal.userId,
        action: 'user.banned',
        entityType: 'user',
        entityId: target.id,
        meta: { reason, before: { banned: false }, after: { banned: true } },
      }),
    );
  }
  const archived = archiveThemes
    ? await archiveOwnedThemes(tx, target.id, principal)
    : { archived: 0, tags: [] };
  return { ok: true, ...archived };
}

export async function adminSetRole(
  input: unknown,
  actor: Actor,
): Promise<{ data: { ok: true }; tags: string[] }> {
  const value = parse(adminSetRoleSchema, input);
  return dbPool.transaction(async (tx) => {
    await moderationLock(tx);
    const principal = await requireAdminPrincipal(tx, actor);
    if (value.userId === principal.userId) throw new AppError('FORBIDDEN');
    const target = await moderationUser(tx, value.userId);
    await changeRole(tx, target, value.role, principal.userId);
    return { data: { ok: true as const }, tags: [] };
  });
}
export async function adminBanUser(
  input: unknown,
  actor: Actor,
): Promise<{ data: ModerationResult; tags: string[] }> {
  const value = parse(adminBanUserSchema, input);
  return dbPool.transaction(async (tx) => {
    await moderationLock(tx);
    const principal = await requireAdminPrincipal(tx, actor);
    const target = await moderationUser(tx, value.userId);
    const { tags, ...data } = await banUserInTransaction(
      tx,
      target,
      principal,
      value.reason,
      value.archiveThemes,
    );
    return { data, tags };
  });
}
export async function adminUnbanUser(
  input: unknown,
  actor: Actor,
): Promise<{ data: { ok: true }; tags: string[] }> {
  const value = parse(adminUnbanUserSchema, input);
  return dbPool.transaction(async (tx) => {
    await moderationLock(tx);
    const principal = await requireAdminPrincipal(tx, actor);
    if (value.userId === principal.userId) throw new AppError('FORBIDDEN');
    const target = await moderationUser(tx, value.userId);
    if (target.banned) {
      await tx
        .update(user)
        .set({ banned: false, banReason: null, banExpires: null })
        .where(eq(user.id, target.id));
      await tx.delete(session).where(eq(session.userId, target.id));
      await tx.execute(
        auditInsert({
          actorId: principal.userId,
          action: 'user.unbanned',
          entityType: 'user',
          entityId: target.id,
          meta: { before: { banned: true }, after: { banned: false } },
        }),
      );
    }
    return { data: { ok: true as const }, tags: [] };
  });
}

export async function setRoleByEmail(
  email: string,
  role: 'user' | 'admin',
  actor: 'system',
): Promise<{
  data: { id: string; email: string; role: 'user' | 'admin'; changed: boolean };
  tags: string[];
}> {
  const input = roleInputSchema.safeParse({ email, role, actor });
  if (!input.success)
    throw new AppError('VALIDATION', 'A valid email, role and system actor are required');
  return dbPool.transaction(
    async (tx) => {
      await moderationLock(tx);
      const [target] = await tx
        .select()
        .from(user)
        .where(eq(user.email, input.data.email))
        .for('update');
      if (!target) throw new AppError('NOT_FOUND', 'No registered user matches that email');
      const changed = await changeRole(tx, target, input.data.role, null);
      return {
        data: { id: target.id, email: target.email, role: input.data.role, changed },
        tags: [],
      };
    },
    { isolationLevel: 'read committed' },
  );
}
export async function listAdmins(): Promise<{ id: string; email: string; name: string }[]> {
  return dbPool
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(eq(user.role, 'admin'))
    .orderBy(asc(user.email));
}
