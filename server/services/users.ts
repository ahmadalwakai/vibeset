import 'server-only';

import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { dbPool } from '../../db/pool';
import { user } from '../../db/schema/auth';
import { auditInsert } from '../audit';
import { AppError } from '../errors';

const roleInputSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(['user', 'admin']),
  actor: z.literal('system'),
});

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
      // Serialize grants and revocations before reading any role state. A row lock alone
      // would allow two different admins to concurrently observe and demote each other.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended('vibeset:admin-roles', 0))`,
      );

      const [target] = await tx
        .select({ id: user.id, email: user.email, role: user.role })
        .from(user)
        .where(eq(user.email, input.data.email))
        .for('update');
      if (!target) throw new AppError('NOT_FOUND', 'No registered user matches that email');

      if (target.role === input.data.role) {
        return { data: { ...target, role: input.data.role, changed: false }, tags: [] };
      }

      if (target.role === 'admin' && input.data.role === 'user') {
        const admins = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.role, 'admin'))
          .for('update');
        if (admins.length <= 1) throw new AppError('CONFLICT', 'The last admin cannot be demoted');
      }

      const [updated] = await tx
        .update(user)
        .set({ role: input.data.role })
        .where(eq(user.id, target.id))
        .returning({ id: user.id, email: user.email });
      if (!updated) throw new AppError('CONFLICT', 'The user changed during the role update');

      await tx.execute(
        auditInsert({
          actorId: null,
          action: 'user.role.set',
          entityType: 'user',
          entityId: target.id,
          meta: {
            actor: input.data.actor,
            before: { role: target.role },
            after: { role: input.data.role },
          },
        }),
      );

      return { data: { ...updated, role: input.data.role, changed: true }, tags: [] };
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
