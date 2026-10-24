import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), connect: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../db/index', () => ({
  db: { $client: { query: mocks.read } },
}));
vi.mock('../../../db/pool', () => ({ pool: { connect: mocks.connect } }));
import {
  cleanup,
  reconcileCounters,
  recomputePopularity,
  runDailyMaintenance,
} from '../../../server/services/maintenance';

const empty = { themeIds: [], uploadIds: [], appRateKeys: [], authRateKeys: [] };
const id = '12345678-1234-4234-8234-123456789012';
const scoped = { scope: { ...empty, themeIds: [id] } };
type ClientQuery = (statement: string | { text: string }) => Promise<unknown>;
function client(): { query: Mock<ClientQuery>; release: Mock<() => void> } {
  return {
    query: vi.fn(async (statement: string | { text: string }): Promise<unknown> => {
      const text = typeof statement === 'string' ? statement : statement.text;
      return { rows: text.includes('WITH clock') ? [{ updated: 1, lockedIds: [id] }] : [] };
    }),
    release: vi.fn(),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue([]);
  mocks.connect.mockResolvedValue(client());
});
afterEach(() => vi.useRealTimers());
describe('maintenance service entrypoints', () => {
  it.each([recomputePopularity, reconcileCounters, cleanup, runDailyMaintenance])(
    'rejects incomplete internal scope before DB work',
    async (service) => {
      await expect(
        Reflect.apply(service, undefined, [{ scope: { themeIds: [] } }]),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.connect).not.toHaveBeenCalled();
    },
  );
  it('preserves a fully empty fixture scope and never opens a mutation transaction', async () => {
    const result = await runDailyMaintenance({ scope: empty, asOf: '2026-10-24T03:17:00Z' });
    expect(Object.values(result.data).every((count) => count === 0)).toBe(true);
    expect(result.tags).toEqual(['themes']);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.read).toHaveBeenCalledTimes(5);
  });
  it('wraps unexpected storage-independent failures with aggregate phase diagnostics', async () => {
    mocks.read.mockRejectedValue(new Error('unsafe connection details'));
    await expect(recomputePopularity({ scope: empty })).rejects.toMatchObject({
      code: 'INTERNAL',
      phase: 'popularity',
      summary: { popularityUpdated: 0 },
    });
    await expect(reconcileCounters({ scope: empty })).rejects.toMatchObject({ phase: 'counters' });
    await expect(cleanup({ scope: empty })).rejects.toMatchObject({ phase: 'cleanup' });
  });
  it.each([recomputePopularity, cleanup])('aborts a stalled candidate read', async (service) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    mocks.read.mockImplementation(
      (_text: string, _params: unknown[], options: { fetchOptions: { signal: AbortSignal } }) => {
        signal = options.fetchOptions.signal;
        return new Promise<never>(() => undefined);
      },
    );
    const operation = service({ scope: empty });
    const rejection = expect(operation).rejects.toMatchObject({ code: 'INTERNAL' });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(signal?.aborted).toBe(true);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('releases a connection arriving after the acquisition deadline without sending BEGIN', async () => {
    vi.useFakeTimers();
    mocks.read.mockResolvedValue([{ id }]);
    const late = client();
    let arrive: ((value: typeof late) => void) | undefined;
    mocks.connect.mockImplementation(
      () => new Promise<typeof late>((resolve) => (arrive = resolve)),
    );
    const operation = recomputePopularity(scoped);
    const rejection = expect(operation).rejects.toMatchObject({ phase: 'popularity' });
    await vi.advanceTimersByTimeAsync(5_000);
    await rejection;
    arrive?.(late);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.release).toHaveBeenCalledExactlyOnceWith();
    expect(late.query).not.toHaveBeenCalled();
  });
  it.each(['BEGIN ISOLATION LEVEL READ COMMITTED', 'write', 'COMMIT'])(
    'destroys a client with a stalled %s and reports only confirmed commits',
    async (stalled) => {
      vi.useFakeTimers();
      mocks.read.mockResolvedValue([{ id }]);
      const checked = client(),
        original = checked.query.getMockImplementation();
      if (!original) throw new Error('Missing query fixture');
      let complete: ((result: unknown) => void) | undefined;
      checked.query.mockImplementation((statement: string | { text: string }) => {
        const text = typeof statement === 'string' ? statement : statement.text;
        if (statement === stalled || (stalled === 'write' && text.includes('WITH clock')))
          return new Promise<unknown>((resolve) => (complete = resolve));
        return original(statement);
      });
      mocks.connect.mockResolvedValue(checked);
      const operation = recomputePopularity(scoped);
      const rejection = expect(operation).rejects.toMatchObject({
        code: 'INTERNAL',
        summary: { popularityUpdated: 0, popularityChecked: 0, popularityPending: 1 },
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await rejection;
      expect(checked.release).toHaveBeenCalledExactlyOnceWith(true);
      expect(checked.query.mock.calls.some(([statement]) => statement === 'ROLLBACK')).toBe(false);
      const count = checked.query.mock.calls.length;
      complete?.({ rows: [{ updated: 1, lockedIds: [id] }] });
      await vi.advanceTimersByTimeAsync(0);
      expect(checked.query).toHaveBeenCalledTimes(count);
    },
  );
  it('aborts the next read within the shared budget while retaining a confirmed previous commit', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    mocks.read
      .mockResolvedValueOnce([{ id }])
      .mockImplementation(
        (_text: string, _params: unknown[], options: { fetchOptions: { signal: AbortSignal } }) => {
          signal = options.fetchOptions.signal;
          return new Promise<never>(() => undefined);
        },
      );
    const checked = client(),
      original = checked.query.getMockImplementation();
    if (!original) throw new Error('Missing query fixture');
    checked.query.mockImplementation(async (statement) => {
      if (statement === 'COMMIT') await new Promise<void>((resolve) => setTimeout(resolve, 25_000));
      return original(statement);
    });
    mocks.connect.mockResolvedValue(checked);
    const operation = runDailyMaintenance(scoped);
    const rejection = expect(operation).rejects.toMatchObject({
      phase: 'counters',
      summary: { popularityUpdated: 1, popularityChecked: 1, popularityPending: 0 },
    });
    await vi.advanceTimersByTimeAsync(49_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(signal?.aborted).toBe(true);
  });
});
