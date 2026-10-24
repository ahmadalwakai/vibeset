import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountCleanupPlan } from '../../../lib/account';
import type { ObjectStorage } from '../../../lib/validation/storage';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  revalidateTag: vi.fn(),
  deleteMany: vi.fn(),
  deletePrefix: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock('../../../server/storage/r2', () => ({
  defaultStorage: { deleteMany: mocks.deleteMany, deletePrefix: mocks.deletePrefix },
}));
import { removeAccountObjects, scheduleAccountCleanup } from '../../../server/account-cleanup';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.deleteMany.mockResolvedValue(undefined);
  mocks.deletePrefix.mockResolvedValue(undefined);
});
describe('post-deletion cache and object cleanup', () => {
  const plan: AccountCleanupPlan = {
    userId: 'deleted',
    keys: ['uploads/wallpapers/fixture/full.jpg'],
    prefixes: ['themes/fixture/'],
    tags: ['themes', 'collections', 'creator:fixture'],
  };
  it('cleans every captured prefix even if another storage operation fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const storage: ObjectStorage = {
      put: vi.fn(),
      head: vi.fn(),
      getBytes: vi.fn(),
      listPrefixes: vi.fn(),
      presignPut: vi.fn(),
      deleteMany: vi.fn().mockRejectedValue(new Error('Provider details must not leak')),
      deletePrefix: vi.fn().mockResolvedValue(undefined),
    };
    await expect(removeAccountObjects(plan, storage)).resolves.toBeUndefined();
    expect(storage.deleteMany).toHaveBeenCalledWith(plan.keys);
    expect(storage.deletePrefix).toHaveBeenCalledWith(plan.prefixes[0]);
    expect(log).toHaveBeenCalledExactlyOnceWith({ scope: 'account.storage-cleanup', failures: 1 });
    log.mockRestore();
  });
  it('expires public attribution immediately before scheduling object cleanup', async () => {
    await scheduleAccountCleanup(plan);
    expect(mocks.revalidateTag.mock.calls).toEqual(plan.tags.map((tag) => [tag, { expire: 0 }]));
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.after.mock.calls[0]?.[0]).toBeTypeOf('function');
    expect(mocks.revalidateTag.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.after.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
  it('expires tags even when there are no objects, and skips an entirely empty plan', async () => {
    await scheduleAccountCleanup({
      userId: 'deleted',
      keys: [],
      prefixes: [],
      tags: ['themes', 'themes'],
    });
    expect(mocks.revalidateTag).toHaveBeenCalledExactlyOnceWith('themes', { expire: 0 });
    expect(mocks.after).not.toHaveBeenCalled();
    await scheduleAccountCleanup({ userId: 'deleted', keys: [], prefixes: [], tags: [] });
    expect(mocks.revalidateTag).toHaveBeenCalledOnce();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it('keeps expiring other tags and schedules objects if one cache expiration fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.revalidateTag.mockImplementationOnce(() => {
      throw new Error('Cache provider details');
    });
    await expect(scheduleAccountCleanup(plan)).resolves.toBeUndefined();
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(plan.tags.length);
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledExactlyOnceWith({ scope: 'account.cache-cleanup', failures: 1 });
    log.mockRestore();
  });
  it('still cleans objects outside a Next response lifecycle', async () => {
    mocks.after.mockImplementation(() => {
      throw new Error('No response lifecycle');
    });
    await expect(scheduleAccountCleanup(plan)).resolves.toBeUndefined();
    expect(mocks.deleteMany).toHaveBeenCalledExactlyOnceWith(plan.keys);
    expect(mocks.deletePrefix).toHaveBeenCalledExactlyOnceWith(plan.prefixes[0]);
    expect(mocks.revalidateTag.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.deleteMany.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
