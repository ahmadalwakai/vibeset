import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), spawn: vi.fn(), neon: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
import { prepareTestDatabase } from '../../../scripts/ci/prepare-test-database';

const url =
  'postgresql://fixture:password@ep-isolated.eu-west-2.aws.neon.tech/neondb?sslmode=require';
const source = { TEST_DATABASE_URL: url, NODE_ENV: 'test' } as const;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.neon.mockReturnValue({ query: mocks.query });
  mocks.query.mockResolvedValue([{ count: '0' }]);
  mocks.spawn.mockImplementation(() => {
    const process = new EventEmitter();
    queueMicrotask(() => process.emit('close', 0));
    return process;
  });
});
describe('CI empty-branch migration safety', () => {
  it.each([
    { TEST_DATABASE_URL: undefined },
    { NODE_ENV: 'production' },
    { VERCEL_ENV: 'production' },
    { TEST_DATABASE_URL: url.replace('ep-isolated.', 'ep-isolated-pooler.') },
    { TEST_DATABASE_URL: url.replace('.neon.tech', '.example.invalid') },
    { DATABASE_URL: url },
    { DATABASE_URL_UNPOOLED: url.replace('ep-isolated.', 'ep-isolated-pooler.') },
  ] as const)('refuses unsafe target before network or migration work', async (patch) => {
    await expect(prepareTestDatabase({ ...source, ...patch })).rejects.toThrow();
    expect(mocks.neon).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('refuses any existing application schema or migration history', async () => {
    mocks.query.mockResolvedValue([{ count: '1' }]);
    await expect(prepareTestDatabase(source)).rejects.toThrow('no application tables');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('uses bounded read verification and passes the direct URL only through child environment', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      await prepareTestDatabase(source);
      expect(mocks.query).toHaveBeenCalledWith(
        expect.stringContaining('information_schema.tables'),
        [],
        expect.objectContaining({ fetchOptions: { signal: expect.any(AbortSignal) } }),
      );
      expect(mocks.spawn).toHaveBeenCalledWith(
        process.execPath,
        ['node_modules/drizzle-kit/bin.cjs', 'migrate'],
        expect.objectContaining({
          env: expect.objectContaining({ DATABASE_URL: url, DATABASE_URL_UNPOOLED: url }),
          stdio: 'ignore',
          timeout: 120_000,
        }),
      );
      expect(JSON.stringify(output.mock.calls)).not.toContain(url);
    } finally {
      output.mockRestore();
    }
  });
});
