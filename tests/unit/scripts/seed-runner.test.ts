import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSeedArgs, runSeedCommand } from '../../../scripts/seed-runner';

const mocks = vi.hoisted(() => ({
  taxonomy: vi.fn(),
  apps: vi.fn(),
  settings: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/services/seed-content', () => ({
  seedTaxonomy: mocks.taxonomy,
  seedApps: mocks.apps,
  seedSettings: mocks.settings,
}));
vi.mock('../../../lib/env.server', () => ({
  env: { NEXT_PUBLIC_SITE_URL: 'https://example.test', INTERNAL_API_SECRET: 'fixture-secret' },
}));
const previousExitCode = process.exitCode;

beforeEach(() => {
  vi.clearAllMocks();
  for (const seed of [mocks.taxonomy, mocks.apps, mocks.settings])
    seed.mockResolvedValue({ data: { changed: 0 }, tags: ['themes'] });
  mocks.fetch.mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', mocks.fetch);
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  process.exitCode = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.exitCode = previousExitCode;
});

describe('seed commands', () => {
  it('parses only the documented help flag', () => {
    expect(parseSeedArgs([])).toEqual({ help: false });
    expect(parseSeedArgs(['--help'])).toEqual({ help: true });
    for (const args of [['unexpected'], ['--force'], ['--help=false']])
      expect(() => parseSeedArgs(args)).toThrow();
  });

  it('rejects invalid arguments before importing services or reading env', async () => {
    await runSeedCommand('taxonomy', ['--unknown']);
    expect(process.exitCode).toBe(1);
    expect(mocks.taxonomy).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('revalidates unchanged successful seeds so a retry can repair stale caches', async () => {
    await runSeedCommand('apps', []);
    expect(mocks.apps).toHaveBeenCalledWith({ actor: { kind: 'system', label: 'seed-apps' } });
    expect(mocks.fetch).toHaveBeenCalledWith(
      new URL('https://example.test/api/internal/revalidate'),
      expect.objectContaining({ redirect: 'error', body: '{"tags":["themes"]}' }),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('warns without relabeling committed data if cache refresh is unavailable', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('Offline'));
    await runSeedCommand('settings', []);
    expect(process.exitCode).toBeUndefined();
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Seed data is committed'),
    );
  });

  it('finishes the active statement and refresh before honoring interruption', async () => {
    let finish: (result: { data: { changed: number }; tags: string[] }) => void = () => {};
    let started: () => void = () => {};
    const active = new Promise<void>((resolve) => {
      started = resolve;
    });
    mocks.taxonomy.mockImplementationOnce(() => {
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const listeners = new Map<string, () => void>();
    vi.spyOn(process, 'on').mockImplementation((event, listener) => {
      listeners.set(String(event), listener);
      return process;
    });
    const remove = vi.spyOn(process, 'removeListener');
    const pending = runSeedCommand('taxonomy', []);
    await active;
    listeners.get('SIGINT')?.();
    expect(mocks.fetch).not.toHaveBeenCalled();
    finish({ data: { changed: 1 }, tags: ['taxonomy'] });
    await pending;
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(130);
    expect(remove).toHaveBeenCalledWith('SIGINT', listeners.get('SIGINT'));
    expect(remove).toHaveBeenCalledWith('SIGTERM', listeners.get('SIGTERM'));
  });
});
