import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { E2E_PROJECT_NAMES, E2E_ROLES } from '../e2e/manifest';
import { authDirectory, authState, manifestPath, readManifest } from '../e2e/runtime';
import globalTeardown from '../e2e/global-teardown';

const originalCwd = process.cwd();
const temporaryRoot = realpathSync(tmpdir());
let sandbox = '';
let sandboxId = '';
let runId = '';
let runDirectory = '';
let manifestFile = '';

function contents(id = runId): string {
  const prefix = `e2e-${id}`;
  return JSON.stringify({
    v: 1,
    runId: id,
    mode: 'local',
    baseURL: 'http://localhost:3000',
    assetOrigin: 'http://localhost:3001',
    fixturePrefix: prefix,
    databaseFingerprint: 'a'.repeat(64),
    createdAt: '2026-10-24T12:00:00Z',
    projects: Object.fromEntries(
      E2E_PROJECT_NAMES.map((project) => [
        project,
        {
          accounts: Object.fromEntries(
            E2E_ROLES.map((role) => [
              role,
              {
                id: `${project}-${role}`,
                email: `e2e-${project}-${role}-${id}@example.invalid`,
                password: 'fixture-password-'.repeat(3),
              },
            ]),
          ),
        },
      ]),
    ),
    themes: Array.from({ length: 25 }, (_, index) => ({
      id: randomUUID(),
      slug: `${prefix}-${index}`,
      nameEn: `Fixture ${index}`,
    })),
    aestheticSlug: prefix,
    aestheticNameEn: 'Fixture aesthetic',
    searchTerm: 'Fixture',
    editorialCollection: null,
    generationRunId: null,
    publishEnabled: false,
  });
}

function protectedDirectory(): string {
  const directory = path.join(sandbox, 'unrelated');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'keep.txt'), 'retain');
  return directory;
}

function expectProtected(directory: string): void {
  expect(readFileSync(path.join(directory, 'keep.txt'), 'utf8')).toBe('retain');
}

beforeEach(() => {
  sandboxId = randomUUID();
  sandbox = path.join(temporaryRoot, sandboxId);
  mkdirSync(sandbox);
  process.chdir(sandbox);
  runId = randomUUID();
  runDirectory = path.join(sandbox, '.tmp', 'e2e', runId);
  mkdirSync(runDirectory, { recursive: true });
  manifestFile = path.join(runDirectory, 'manifest.json');
  writeFileSync(manifestFile, contents());
  vi.stubEnv('E2E_MANIFEST_PATH', manifestFile);
  vi.stubEnv('E2E_BASE_URL', 'http://localhost:3000');
  vi.stubEnv('VERCEL_ENV', 'preview');
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  // Never recursively remove a computed path unless it is our exact UUID temp root.
  if (
    path.dirname(path.resolve(sandbox)) !== temporaryRoot ||
    path.basename(sandbox) !== sandboxId ||
    realpathSync(sandbox) !== sandbox
  )
    throw new Error('Refusing cleanup outside the owned test sandbox');
  rmSync(sandbox, { recursive: true, force: true });
});

describe('canonical E2E runtime paths', () => {
  it('supports normal auth-state writes and removes only the owned auth directory', async () => {
    expect(manifestPath()).toBe(manifestFile);
    expect(readManifest().runId).toBe(runId);
    const directory = authDirectory();
    mkdirSync(directory);
    const state = authState('desktop', 'visitor');
    writeFileSync(state, '{}');
    const unrelated = protectedDirectory();

    await globalTeardown();
    expect(existsSync(directory)).toBe(false);
    expect(existsSync(manifestFile)).toBe(true);
    expectProtected(unrelated);
  });

  it('treats an absent owned auth directory as a no-op teardown', async () => {
    const directory = authDirectory();
    expect(existsSync(directory)).toBe(false);
    await expect(globalTeardown()).resolves.toBeUndefined();
    expect(existsSync(manifestFile)).toBe(true);
  });

  it.each(['not-a-uuid', `${randomUUID()}/nested`, `../other/${randomUUID()}`])(
    'rejects manifest structures outside the exact UUID run shape (%s)',
    (relative) => {
      vi.stubEnv('E2E_MANIFEST_PATH', path.join(sandbox, '.tmp', 'e2e', relative, 'manifest.json'));
      expect(() => manifestPath()).toThrow('exactly .tmp/e2e/<UUID>/manifest.json');
    },
  );

  it('rejects a junction at the actual .tmp/e2e root before teardown', async () => {
    const root = path.dirname(runDirectory);
    const moved = path.join(sandbox, 'moved-e2e');
    renameSync(root, moved);
    const protectedAuth = path.join(moved, runId, 'auth');
    mkdirSync(protectedAuth);
    writeFileSync(path.join(protectedAuth, 'keep.txt'), 'retain');
    symlinkSync(moved, root, 'junction');

    expect(() => manifestPath()).toThrow('owned files and directories');
    await expect(globalTeardown()).rejects.toThrow('owned files and directories');
    expectProtected(protectedAuth);
  });

  it('rejects a junction at the run directory before auth writes or teardown', async () => {
    const moved = path.join(sandbox, 'moved-run');
    renameSync(runDirectory, moved);
    const protectedAuth = path.join(moved, 'auth');
    mkdirSync(protectedAuth);
    writeFileSync(path.join(protectedAuth, 'keep.txt'), 'retain');
    symlinkSync(moved, runDirectory, 'junction');

    expect(() => authDirectory()).toThrow('owned files and directories');
    expect(() => authState('desktop', 'user')).toThrow('owned files and directories');
    await expect(globalTeardown()).rejects.toThrow('owned files and directories');
    expectProtected(protectedAuth);
  });

  it('rejects an auth-directory junction and leaves its target intact', async () => {
    const unrelated = protectedDirectory();
    symlinkSync(unrelated, path.join(runDirectory, 'auth'), 'junction');

    expect(() => authDirectory()).toThrow('owned files and directories');
    expect(() => authState('desktop', 'user')).toThrow('owned files and directories');
    await expect(globalTeardown()).rejects.toThrow('owned files and directories');
    expectProtected(unrelated);
  });

  it('rejects junctions at the manifest and existing auth-state file paths', () => {
    const unrelated = protectedDirectory();
    rmSync(manifestFile);
    symlinkSync(unrelated, manifestFile, 'junction');
    expect(() => manifestPath()).toThrow('owned files and directories');
    rmSync(manifestFile);
    writeFileSync(manifestFile, contents());

    mkdirSync(authDirectory());
    const state = path.join(runDirectory, 'auth', 'desktop-user.json');
    symlinkSync(unrelated, state, 'junction');
    expect(() => authState('desktop', 'user')).toThrow('owned files and directories');
    expectProtected(unrelated);
  });

  it('rejects invalid manifest content, wrong run identity, and production teardown', async () => {
    mkdirSync(path.join(runDirectory, 'auth'));
    writeFileSync(path.join(runDirectory, 'auth', 'keep.txt'), 'retain');
    writeFileSync(manifestFile, '{}');
    await expect(globalTeardown()).rejects.toThrow('Invalid disposable E2E manifest');
    writeFileSync(manifestFile, contents(randomUUID()));
    await expect(globalTeardown()).rejects.toThrow('directory does not match its run');
    writeFileSync(manifestFile, contents());
    vi.stubEnv('VERCEL_ENV', 'production');
    await expect(globalTeardown()).rejects.toThrow('Production E2E execution is refused');
    expectProtected(path.join(runDirectory, 'auth'));
  });

  it('fails closed when the owned auth path is a file rather than a directory', async () => {
    const directory = path.join(runDirectory, 'auth');
    writeFileSync(directory, 'retain');
    await expect(globalTeardown()).rejects.toThrow('owned files and directories');
    expect(readFileSync(directory, 'utf8')).toBe('retain');
  });
});
