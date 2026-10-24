import { ChildProcess } from 'node:child_process';
import type * as ChildProcessModule from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as EnvironmentModule from '../../../scripts/e2e/environment';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  verify: vi.fn(),
  seed: vi.fn(),
  cleanup: vi.fn(),
  refresh: vi.fn(),
  closePool: vi.fn(),
  assetServer: vi.fn(),
  access: vi.fn(),
}));

vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof ChildProcessModule>()),
  spawn: mocks.spawn,
}));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  cp: vi.fn(),
  access: mocks.access,
  readFile: vi.fn(async () => 'fixture-build-id'),
  writeFile: vi.fn(),
}));
vi.mock('node:net', () => ({
  createServer: () => ({
    once: vi.fn(),
    listen: (_port: number, _host: string, callback: () => void): void => callback(),
    close: (callback: () => void): void => callback(),
  }),
}));
vi.mock('../../../scripts/e2e/environment', async (original) => ({
  ...(await original<typeof EnvironmentModule>()),
  e2eEnvironment: () => ({
    NODE_ENV: 'test',
    VERCEL_ENV: 'preview',
    DATABASE_URL: 'postgresql://fixture@isolated.invalid/test',
    INTERNAL_API_SECRET: 'fixture-secret-'.repeat(3),
  }),
  verifyE2eApp: mocks.verify,
}));
vi.mock('../../../scripts/e2e/cache', () => ({ refreshE2eCaches: mocks.refresh }));
vi.mock('../../../scripts/e2e/asset-server', () => ({ startE2eAssetServer: mocks.assetServer }));
vi.mock('../../../scripts/e2e/fixtures', () => ({
  seedE2eFixtures: mocks.seed,
  cleanupE2eFixtures: mocks.cleanup,
}));
vi.mock('../../../server/e2e', () => ({ fingerprintE2eDatabase: () => 'a'.repeat(64) }));
vi.mock('../../../db/pool', () => ({ pool: { end: mocks.closePool } }));

import { runE2e } from '../../../scripts/run-e2e';

let initialSignalListeners: Set<(signal: NodeJS.Signals) => void>;

function cancel(): void {
  const handler = process
    .listeners('SIGINT')
    .find((listener) => !initialSignalListeners.has(listener));
  if (!handler) throw new Error('Missing fixture interruption handler');
  handler('SIGINT');
}

function fakeChild(onStart?: () => void): ChildProcess {
  const child = new ChildProcess();
  Object.defineProperty(child, 'pid', { value: 1234 });
  vi.spyOn(child, 'kill').mockImplementation((signal) => {
    Object.defineProperty(child, 'signalCode', {
      value: typeof signal === 'string' ? signal : 'SIGTERM',
      configurable: true,
    });
    queueMicrotask(() => child.emit('exit', null, child.signalCode));
    return true;
  });
  queueMicrotask(() => {
    onStart?.();
    if (!onStart) {
      Object.defineProperty(child, 'exitCode', { value: 0, configurable: true });
      child.emit('exit', 0, null);
    }
  });
  return child;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('DATABASE_URL', 'postgresql://fixture@isolated.invalid/test');
  vi.stubEnv('INTERNAL_API_SECRET', 'fixture-secret-'.repeat(3));
  initialSignalListeners = new Set(process.listeners('SIGINT'));
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  mocks.verify.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.seed.mockResolvedValue({ manifestPath: '.tmp/fixture/manifest.json' });
  mocks.cleanup.mockResolvedValue(undefined);
  mocks.access.mockResolvedValue(undefined);
  mocks.closePool.mockResolvedValue(undefined);
  mocks.assetServer.mockResolvedValue({
    closeAllConnections: vi.fn(),
    close: (callback: () => void): void => callback(),
  });
  mocks.spawn.mockImplementation(() => fakeChild());
});

afterEach(() => {
  process.exitCode = undefined;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('E2E runner cooperative cancellation', () => {
  it('treats an absent cleanup journal as an idempotent no-op', async () => {
    mocks.access.mockRejectedValueOnce(
      Object.assign(new Error('Fixture missing'), { code: 'ENOENT' }),
    );
    await runE2e(['--mode', 'remote', '--base-url', 'https://fixture.invalid']);
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('requires recovery instead of claiming removal when journal access is denied', async () => {
    mocks.access.mockRejectedValueOnce(
      Object.assign(new Error('Fixture denied'), { code: 'EACCES' }),
    );
    await runE2e(['--mode', 'remote', '--base-url', 'https://fixture.invalid']);
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(process.stdout.write).not.toHaveBeenCalledWith(
      'E2E accounts revoked and owned fixtures removed.\n',
    );
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('cleanup needs recovery'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('stops an observed build child and never starts the app, seeder or browser', async () => {
    mocks.spawn.mockImplementationOnce(() => fakeChild(cancel));
    await runE2e([]);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.seed).not.toHaveBeenCalled();
    expect(mocks.assetServer).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(130);
  });

  it('does not import/run fixtures after cancellation during app verification', async () => {
    mocks.verify.mockImplementationOnce(async () => cancel());
    await runE2e(['--mode', 'remote', '--base-url', 'https://fixture.invalid']);
    expect(mocks.seed).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(130);
  });

  it('finishes the seeding boundary and cleans its journal without starting Playwright', async () => {
    mocks.seed.mockImplementationOnce(async () => {
      cancel();
      return { manifestPath: '.tmp/fixture/manifest.json' };
    });
    await runE2e(['--mode', 'remote', '--base-url', 'https://fixture.invalid']);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    // Auth preflight plus post-cleanup invalidation; no test phase or post-seed refresh.
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(mocks.closePool).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(130);
  });

  it('preserves fixtures when an interrupted browser cannot be confirmed stopped', async () => {
    vi.useFakeTimers();
    mocks.spawn.mockImplementationOnce(() => {
      const child = fakeChild(cancel);
      vi.mocked(child.kill).mockReturnValue(false);
      return child;
    });
    const run = runE2e(['--mode', 'remote', '--base-url', 'https://fixture.invalid']);
    await vi.advanceTimersByTimeAsync(10_000);
    await run;
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(2); // Preflight and post-seed only.
    expect(mocks.closePool).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(130);
  });
});
