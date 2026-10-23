import { randomUUID } from 'node:crypto';
import { neon, type Pool } from '@neondatabase/serverless';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { user } from '../../db/schema/auth';
import { auditLog } from '../../db/schema/system';

vi.mock('server-only', () => ({}));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();

describe.skipIf(!TEST_DATABASE_URL)('admin role concurrency', () => {
  let poolToClose: Pool | undefined;

  afterAll(async () => {
    try {
      await poolToClose?.end();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('allows exactly one of two concurrent admin demotions and audits only committed changes', async (context) => {
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
    const db = drizzle({ client: neon(url) });
    const existingAdmins = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, 'admin'));
    if (existingAdmins.length > 0) {
      context.skip('Requires an isolated test database without existing admins');
    }

    vi.stubEnv('DATABASE_URL', url);
    vi.stubEnv('DATABASE_URL_UNPOOLED', url);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('SKIP_ENV_VALIDATION', undefined);

    const people = [randomUUID(), randomUUID()].map((id) => ({
      id: `integration-role-${id}`,
      email: `integration-role-${id}@example.com`,
      name: 'Disposable role test account',
      role: 'user',
    }));
    const [first, second] = people;
    if (!first || !second) throw new Error('Two disposable test accounts are required');
    const ids = people.map(({ id }) => id);

    try {
      const { pool } = await import('../../db/pool');
      poolToClose = pool;
      const { setRoleByEmail } = await import('../../server/services/users');
      await db.insert(user).values(people);
      await setRoleByEmail(first.email, 'admin', 'system');
      await setRoleByEmail(second.email, 'admin', 'system');
      expect((await setRoleByEmail(first.email, 'admin', 'system')).data.changed).toBe(false);

      const outcomes = await Promise.allSettled([
        setRoleByEmail(first.email, 'user', 'system'),
        setRoleByEmail(second.email, 'user', 'system'),
      ]);
      expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          expect(outcome.reason as unknown).toMatchObject({ code: 'CONFLICT' });
        }
      }

      expect(
        await db
          .select({ id: user.id })
          .from(user)
          .where(and(inArray(user.id, ids), eq(user.role, 'admin'))),
      ).toHaveLength(1);
      const audit = await db
        .select({ actorId: auditLog.actorId, entityType: auditLog.entityType, meta: auditLog.meta })
        .from(auditLog)
        .where(and(inArray(auditLog.entityId, ids), eq(auditLog.action, 'user.role.set')));
      expect(audit).toHaveLength(3);
      expect(audit.map(({ meta }) => meta)).toContainEqual({
        actor: 'system',
        before: { role: 'admin' },
        after: { role: 'user' },
      });
      for (const entry of audit) {
        expect(entry.actorId).toBeNull();
        expect(entry.entityType).toBe('user');
        expect(JSON.stringify(entry.meta)).not.toContain('@example.com');
      }
    } finally {
      await db.delete(auditLog).where(inArray(auditLog.entityId, ids));
      await db.delete(user).where(inArray(user.id, ids));
    }
  }, 30_000);
});
