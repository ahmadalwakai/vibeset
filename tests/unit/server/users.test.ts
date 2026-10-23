import { SQL, sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  execute: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  auditInsert: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../../db/pool', () => ({
  dbPool: { transaction: mocks.transaction, select: mocks.list },
}));
vi.mock('../../../server/audit', () => ({ auditInsert: mocks.auditInsert }));

import { listAdmins, setRoleByEmail } from '../../../server/services/users';

const target = { id: 'selected-user', email: 'selected@example.com', role: 'user' };
const tx = { execute: mocks.execute, select: mocks.select, update: mocks.update };

function selection(rows: { id: string; email?: string; role?: string | null }[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockResolvedValue(rows),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (run: (transaction: typeof tx) => Promise<unknown>) =>
    run(tx),
  );
  mocks.execute.mockResolvedValue({ rows: [] });
  mocks.auditInsert.mockReturnValue(sql`INSERT INTO audit_log DEFAULT VALUES`);
  mocks.update.mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: target.id, email: target.email }]),
  });
});

describe('system role service', () => {
  it('validates the selected email and actor before opening a transaction', async () => {
    await expect(setRoleByEmail('invalid', 'admin', 'system')).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(setRoleByEmail(target.email, 'admin', 'user' as 'system')).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('locks role mutations before looking up the chosen user and audits the grant in the same transaction', async () => {
    const query = selection([target]);
    mocks.select.mockReturnValueOnce(query);

    const result = await setRoleByEmail(' SELECTED@EXAMPLE.COM ', 'admin', 'system');

    expect(result).toEqual({ data: { ...target, role: 'admin', changed: true }, tags: [] });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'read committed',
    });
    const lock: unknown = mocks.execute.mock.calls[0]?.[0];
    expect(lock).toBeInstanceOf(SQL);
    if (lock instanceof SQL) {
      expect(new PgDialect().sqlToQuery(lock).sql).toContain('pg_advisory_xact_lock');
    }
    const predicate: unknown = query.where.mock.calls[0]?.[0];
    expect(predicate).toBeInstanceOf(SQL);
    if (predicate instanceof SQL) {
      expect(new PgDialect().sqlToQuery(predicate).params).toEqual([target.email]);
    }
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(
      query.for.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(mocks.auditInsert).toHaveBeenCalledWith({
      actorId: null,
      action: 'user.role.set',
      entityType: 'user',
      entityId: target.id,
      meta: { actor: 'system', before: { role: 'user' }, after: { role: 'admin' } },
    });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.execute).toHaveBeenLastCalledWith(mocks.auditInsert.mock.results[0]?.value);
  });

  it('fails for an unknown user without creating an account or an audit event', async () => {
    mocks.select.mockReturnValueOnce(selection([]));

    await expect(setRoleByEmail(target.email, 'admin', 'system')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditInsert).not.toHaveBeenCalled();
  });

  it('treats an existing role as an idempotent no-op', async () => {
    mocks.select.mockReturnValueOnce(selection([{ ...target, role: 'admin' }]));

    await expect(setRoleByEmail(target.email, 'admin', 'system')).resolves.toEqual({
      data: { ...target, role: 'admin', changed: false },
      tags: [],
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditInsert).not.toHaveBeenCalled();
  });

  it('refuses to demote the last admin without updating or auditing', async () => {
    mocks.select
      .mockReturnValueOnce(selection([{ ...target, role: 'admin' }]))
      .mockReturnValueOnce(selection([{ id: target.id }]));

    await expect(setRoleByEmail(target.email, 'user', 'system')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The last admin cannot be demoted',
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditInsert).not.toHaveBeenCalled();
  });

  it('allows a demotion when another locked admin remains', async () => {
    mocks.select
      .mockReturnValueOnce(selection([{ ...target, role: 'admin' }]))
      .mockReturnValueOnce(selection([{ id: target.id }, { id: 'remaining-admin' }]));

    await expect(setRoleByEmail(target.email, 'user', 'system')).resolves.toEqual({
      data: { ...target, role: 'user', changed: true },
      tags: [],
    });
    expect(mocks.auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: { actor: 'system', before: { role: 'admin' }, after: { role: 'user' } },
      }),
    );
  });

  it('propagates an audit failure so the transaction cannot commit a role without its audit', async () => {
    mocks.select.mockReturnValueOnce(selection([target]));
    mocks.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('audit failed'));

    await expect(setRoleByEmail(target.email, 'admin', 'system')).rejects.toThrow('audit failed');
  });

  it('lists only admins with a deterministic order', async () => {
    const admins = [{ id: target.id, email: target.email, name: 'Selected user' }];
    const query = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(admins),
    };
    mocks.list.mockReturnValueOnce(query);

    await expect(listAdmins()).resolves.toEqual(admins);
    expect(mocks.transaction).not.toHaveBeenCalled();
    const predicate: unknown = query.where.mock.calls[0]?.[0];
    expect(predicate).toBeInstanceOf(SQL);
    if (predicate instanceof SQL) {
      expect(new PgDialect().sqlToQuery(predicate).params).toEqual(['admin']);
    }
    expect(query.orderBy).toHaveBeenCalledOnce();
  });
});
