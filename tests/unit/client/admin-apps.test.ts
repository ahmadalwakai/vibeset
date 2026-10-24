import { beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  order: vi.fn(),
  reorder: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('../../../server/actions/admin/apps', () => ({
  adminUpsertApp: calls.save,
  adminDeleteApp: calls.remove,
  getAdminAppOrder: calls.order,
  adminReorderApps: calls.reorder,
}));
vi.mock('../../../lib/client/app-catalog', () => ({ invalidateAppCatalog: calls.invalidate }));
import { saveAdminApp, deleteAdminApp, moveAdminAppToFront } from '../../../lib/client/admin-apps';
beforeEach(() => vi.resetAllMocks());
describe('admin app mutation lifecycle', () => {
  it('does not start a reorder mutation after its account is abandoned during the read', async () => {
    let resolve: (value: unknown) => void = () => {
      throw new Error('No pending read');
    };
    calls.order.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const controller = new AbortController(),
      pending = moveAdminAppToFront('app', controller.signal);
    controller.abort();
    resolve({ ok: true, data: [{ id: 'app', slug: 'app', rank: 2 }] });
    expect(await pending).toBeNull();
    expect(calls.reorder).not.toHaveBeenCalled();
    expect(calls.invalidate).not.toHaveBeenCalled();
  });
  it('moves the selected app to the front and preserves all other rank order', async () => {
    calls.order.mockResolvedValue({
      ok: true,
      data: [{ id: 'one' }, { id: 'app' }, { id: 'three' }],
    });
    calls.reorder.mockResolvedValue({ ok: true, data: { count: 2 } });
    expect(await moveAdminAppToFront('app', new AbortController().signal)).toEqual({
      ok: true,
      data: { count: 2 },
    });
    expect(calls.reorder).toHaveBeenCalledExactlyOnceWith({ ids: ['app', 'one', 'three'] });
    expect(calls.invalidate).toHaveBeenCalledOnce();
  });
  it('invalidates committed public changes even when the account unmounts during the write', async () => {
    let finish: (value: unknown) => void = () => {
      throw new Error('No pending write');
    };
    calls.order.mockResolvedValue({ ok: true, data: [{ id: 'app' }] });
    calls.reorder.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController(),
      pending = moveAdminAppToFront('app', controller.signal);
    await vi.waitFor(() => expect(calls.reorder).toHaveBeenCalledOnce());
    controller.abort();
    finish({ ok: true, data: { count: 1 } });
    expect(await pending).toBeNull();
    expect(calls.invalidate).toHaveBeenCalledOnce();
  });
  it('invalidates successful saves/deletes without depending on a mounted UI callback', async () => {
    calls.save.mockResolvedValue({ ok: true, data: { id: 'app' } });
    calls.remove.mockResolvedValue({ ok: false, error: { code: 'FORBIDDEN', message: 'Denied' } });
    expect(await saveAdminApp({})).toMatchObject({ ok: true });
    expect(await deleteAdminApp({ id: 'app' })).toMatchObject({ ok: false });
    expect(calls.invalidate).toHaveBeenCalledOnce();
    calls.remove.mockResolvedValue({ ok: true, data: { id: 'app' } });
    await deleteAdminApp({ id: 'app' });
    expect(calls.invalidate).toHaveBeenCalledTimes(2);
  });
});
