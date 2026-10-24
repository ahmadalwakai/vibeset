import { DrizzleQueryError } from 'drizzle-orm/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../server/errors';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../db/pool', () => ({ dbPool: { transaction: mocks.transaction } }));
vi.mock('../../../server/audit', () => ({ auditInsert: vi.fn() }));
import { contentTransaction } from '../../../server/services/admin-content-common';

const actor = { kind: 'user', userId: 'admin-fixture', role: 'admin', isCreator: false } as const;
const violation = (code: string): Error =>
  Object.assign(new Error('fixture database error'), { code });
const wrap = (cause: Error): DrizzleQueryError => new DrizzleQueryError('fixture SQL', [], cause);

beforeEach(() => vi.resetAllMocks());

describe('admin content transaction error classification', () => {
  it.each([violation('23505'), wrap(violation('23505')), wrap(wrap(violation('23505')))])(
    'returns CONFLICT for direct or Drizzle-wrapped unique violations',
    async (error) => {
      mocks.transaction.mockRejectedValue(error);
      await expect(contentTransaction(actor, async () => true)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    },
  );

  it('preserves existing application errors', async () => {
    const error = new AppError('FORBIDDEN');
    mocks.transaction.mockRejectedValue(error);
    await expect(contentTransaction(actor, async () => true)).rejects.toBe(error);
  });

  it.each([wrap(violation('23503')), new Error('fixture transport failure')])(
    'does not misclassify foreign-key or transport failures as duplicate content',
    async (error) => {
      mocks.transaction.mockRejectedValue(error);
      await expect(contentTransaction(actor, async () => true)).rejects.toBe(error);
    },
  );
});
