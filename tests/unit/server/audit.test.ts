import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

vi.mock('server-only', () => ({}));
vi.mock('../../../db/index', async () => {
  const { drizzle } = await import('drizzle-orm/neon-http');
  return { db: drizzle.mock() };
});

import { auditInsert } from '../../../server/audit';

describe('batchable audit insert', () => {
  it('constructs a parameterized pending query with a nullable system actor', () => {
    const query = auditInsert({
      actorId: null,
      action: 'user.role.set',
      entityType: 'user',
      entityId: 'user-id',
      meta: { before: { role: 'user' }, after: { role: 'admin' } },
    }).toSQL();
    expect(query.sql).toContain('insert into "audit_log"');
    expect(query.sql).not.toContain('user-id');
    expect(query.params).toContain(null);
    expect(query.params).toContain('user.role.set');
    expect(query.params).toContain('user-id');
  });

  it('defaults metadata to a JSON object', () => {
    expect(
      auditInsert({
        actorId: 'actor-id',
        action: 'settings.updated',
        entityType: 'settings',
      }).toSQL().params,
    ).toContain('{}');
  });

  it.each([Number.NaN, undefined, new Date(), () => undefined])(
    'rejects non-JSON metadata: %s',
    (invalid) => {
      expect(() =>
        auditInsert({
          actorId: null,
          action: 'settings.updated',
          entityType: 'settings',
          meta: { invalid },
        }),
      ).toThrow(ZodError);
    },
  );

  it('rejects an empty actor identity rather than treating it as system', () => {
    expect(() =>
      auditInsert({ actorId: '', action: 'settings.updated', entityType: 'settings' }),
    ).toThrow(ZodError);
  });
});
