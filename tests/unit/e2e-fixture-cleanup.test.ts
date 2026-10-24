import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { E2E_PROJECT_NAMES, E2E_ROLES, e2eManifestSchema } from '../e2e/manifest';

const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(),
  events: [] as string[],
  rows: [] as Record<string, unknown>[][],
  transaction: vi.fn(),
  removePrefix: vi.fn(),
  rename: vi.fn(),
  uncertainCommit: false,
}));

vi.mock('server-only', () => ({}));
vi.mock('../../db/pool', () => ({ dbPool: { transaction: mocks.transaction } }));
vi.mock('../../lib/env.server', () => ({
  env: {
    VERCEL_ENV: 'preview',
    E2E_TEST_AUTH: '1',
    DATABASE_URL: 'postgresql://fixture@isolated.invalid/test',
    R2_ACCOUNT_ID: 'fixture-account',
    R2_ACCESS_KEY_ID: 'fixture-key',
    R2_SECRET_ACCESS_KEY: 'fixture-secret',
    R2_BUCKET: 'fixture-test-bucket',
  },
}));
vi.mock('../../server/e2e', () => ({ fingerprintE2eDatabase: () => 'a'.repeat(64) }));
vi.mock('../../server/storage/r2', () => ({
  createR2Storage: () => ({ deletePrefix: mocks.removePrefix }),
}));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async (file: string) => {
    const value = mocks.files.get(path.resolve(file));
    if (value === undefined) throw new Error('Missing fixture journal');
    return value;
  }),
  writeFile: vi.fn(async (file: string, contents: string) => {
    mocks.files.set(path.resolve(file), contents);
  }),
  realpath: vi.fn(async (file: string) => path.resolve(file)),
  stat: vi.fn(async (file: string) => ({ size: mocks.files.get(path.resolve(file))?.length ?? 0 })),
  rename: mocks.rename,
  rm: vi.fn(async (file: string) => {
    const resolved = path.resolve(file);
    mocks.events.push(`remove:${path.basename(resolved)}`);
    for (const key of mocks.files.keys())
      if (key === resolved || key.startsWith(`${resolved}${path.sep}`)) mocks.files.delete(key);
  }),
}));

import { cleanupE2eFixtures } from '../../scripts/e2e/fixtures';

type Row = Record<string, unknown>;
type Query = Promise<Row[]> & {
  from: () => Query;
  where: () => Query;
  orderBy: () => Query;
  for: () => Query;
};

function select(): Query {
  const rows = mocks.rows.shift();
  if (!rows) throw new Error('Unexpected fixture database read');
  const result: Query = Object.assign(Promise.resolve(rows), {
    from: (): Query => result,
    where: (): Query => result,
    orderBy: (): Query => result,
    for: (): Query => result,
  });
  return result;
}

const transaction = {
  select,
  delete: (): { where: () => Promise<void> } => ({
    where: async (): Promise<void> => {
      mocks.events.push('delete');
    },
  }),
};

function fixture(): {
  journalPath: string;
  seedIds: string[];
  extraId: string;
  userId: string;
} {
  const runId = randomUUID();
  const prefix = `e2e-${runId}`;
  const manifest = e2eManifestSchema.parse({
    v: 1,
    runId,
    mode: 'remote',
    baseURL: 'https://preview.example.com',
    assetOrigin: 'https://assets.example.com',
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
                email: `e2e-${project}-${role}-${runId}@example.invalid`,
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
    publishEnabled: true,
  });
  const journalPath = path.resolve('.tmp', 'e2e', runId, 'journal.json');
  // Older journals have no cleanupThemeIds; schema defaults must preserve recovery.
  mocks.files.set(
    journalPath,
    JSON.stringify({
      manifest,
      tagId: randomUUID(),
      appIds: [],
      settingKeys: [],
      auditIds: [],
      seedCatalog: false,
      seedSettings: false,
    }),
  );
  const extraId = randomUUID();
  const userId = manifest.projects.iphone.accounts.creator.id;
  mocks.rows.push(
    [{ id: userId }],
    [{ id: extraId }],
    manifest.themes.map(({ id, slug }) => ({ id, slug })),
    [],
  );
  return { journalPath, seedIds: manifest.themes.map(({ id }) => id), extraId, userId };
}

function savedPlan(journalPath: string): unknown {
  const saved = mocks.files.get(journalPath);
  if (saved === undefined) throw new Error('Expected retained recovery journal');
  return (JSON.parse(saved) as { cleanupThemeIds?: unknown }).cleanupThemeIds;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.files.clear();
  mocks.events.length = 0;
  mocks.rows.length = 0;
  mocks.uncertainCommit = false;
  mocks.rename.mockImplementation(async (from: string, to: string) => {
    const contents = mocks.files.get(path.resolve(from));
    if (contents === undefined) throw new Error('Missing pending journal');
    mocks.files.set(path.resolve(to), contents);
    mocks.files.delete(path.resolve(from));
    mocks.events.push('save-plan');
  });
  mocks.transaction.mockImplementation(
    async (run: (tx: typeof transaction) => Promise<unknown>) => {
      mocks.events.push('begin');
      const result = await run(transaction);
      mocks.events.push('commit');
      if (mocks.uncertainCommit) throw new Error('Uncertain database commit');
      return result;
    },
  );
  mocks.removePrefix.mockImplementation(async () => {
    mocks.events.push('storage-delete');
  });
});

describe('E2E cleanup recovery after database deletion', () => {
  it('saves every captured ID before deletion and retries all prefixes after storage failure', async () => {
    const { journalPath, seedIds, extraId } = fixture();
    mocks.removePrefix.mockImplementationOnce(async () => {
      mocks.events.push('storage-delete');
      throw new Error('Fixture storage failure');
    });

    await expect(cleanupE2eFixtures(journalPath)).rejects.toThrow('Fixture storage failure');
    expect(savedPlan(journalPath)).toEqual([...seedIds, extraId]);
    expect(mocks.events.indexOf('save-plan')).toBeLessThan(mocks.events.indexOf('delete'));
    expect(mocks.events.indexOf('commit')).toBeLessThan(mocks.events.indexOf('storage-delete'));

    mocks.removePrefix.mockClear();
    // The first transaction committed: no fixture users or themes remain to rediscover.
    mocks.rows.push([], [], [], []);
    await cleanupE2eFixtures(journalPath);
    expect(mocks.removePrefix.mock.calls.map(([prefix]) => prefix)).toEqual(
      [...seedIds, extraId].map((id) => `themes/${id}/`),
    );
    expect(mocks.files.has(journalPath)).toBe(false);
    expect(mocks.rows).toHaveLength(0);
  });

  it('preserves the complete journal and storage when commit confirmation is uncertain', async () => {
    const { journalPath, seedIds, extraId } = fixture();
    mocks.uncertainCommit = true;
    await expect(cleanupE2eFixtures(journalPath)).rejects.toThrow('Uncertain database commit');
    expect(savedPlan(journalPath)).toEqual([...seedIds, extraId]);
    expect(mocks.removePrefix).not.toHaveBeenCalled();

    mocks.uncertainCommit = false;
    mocks.rows.push([], [], [], []);
    await cleanupE2eFixtures(journalPath);
    expect(mocks.removePrefix).toHaveBeenCalledWith(`themes/${extraId}/`);
    expect(mocks.files.has(journalPath)).toBe(false);
  });

  it('refuses database deletion when the atomic cleanup-plan save fails', async () => {
    const { journalPath } = fixture();
    mocks.rename.mockRejectedValueOnce(new Error('Fixture journal save failed'));
    await expect(cleanupE2eFixtures(journalPath)).rejects.toThrow('Fixture journal save failed');
    expect(mocks.events).not.toContain('delete');
    expect(mocks.events).not.toContain('commit');
    expect(mocks.removePrefix).not.toHaveBeenCalled();
    expect(savedPlan(journalPath)).toBeUndefined();
  });

  it('rejects a saved prefix plan that now refers to an unrelated live theme', async () => {
    const { journalPath } = fixture();
    const unrelatedId = randomUUID();
    const contents = mocks.files.get(journalPath);
    if (!contents) throw new Error('Expected fixture journal');
    mocks.files.set(
      journalPath,
      JSON.stringify({
        ...(JSON.parse(contents) as Record<string, unknown>),
        cleanupThemeIds: [unrelatedId],
      }),
    );
    mocks.rows.splice(2, 0, [{ id: unrelatedId }]);
    await expect(cleanupE2eFixtures(journalPath)).rejects.toThrow('unrelated live theme');
    expect(mocks.events).not.toContain('save-plan');
    expect(mocks.events).not.toContain('delete');
    expect(mocks.removePrefix).not.toHaveBeenCalled();
  });
});
