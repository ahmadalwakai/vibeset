import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedApps, seedSettings, seedTaxonomy } from '../../../server/services/seed-content';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../db/index', () => ({ db: { execute } }));
vi.mock('../../../db/pool', () => ({
  dbPool: {
    transaction: async (fn: (tx: { execute: typeof execute }) => Promise<unknown>) =>
      fn({ execute }),
  },
}));
vi.mock('../../../server/services/taxonomy-lock', () => ({ lockTaxonomy: vi.fn() }));
vi.mock('../../../server/services/app-catalog-lock', () => ({
  lockAppCatalog: vi.fn(),
  assertAppCatalogCapacity: vi.fn(),
}));
const actor = { kind: 'system', label: 'seed-test' } as const;
const tag = {
  id: 'fixture',
  slug: 'seed-fixture',
  kind: 'mood',
  nameEn: 'Fixture',
  nameAr: 'تجربة',
  sortOrder: 1,
} as const;
const app = {
  slug: 'seed-fixture',
  name: 'Fixture',
  aliases: ['تجربة'],
  category: 'system',
  glyph: 'heart',
  rank: 1,
} as const;

beforeEach(() => vi.clearAllMocks());

describe('seed content boundaries', () => {
  it('requires a system actor before any database operation', async () => {
    const user = { kind: 'user', userId: 'fixture', role: 'admin', isCreator: false } as const;
    await expect(seedTaxonomy({ actor: user, rows: [tag] })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(seedApps({ actor: user, rows: [app] })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(seedSettings({ actor: user })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects duplicate, unsafe, and unknown identifiers before writing', async () => {
    await expect(seedTaxonomy({ actor, rows: [tag, tag] })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(seedTaxonomy({ actor, rows: [{ ...tag, slug: 'name\n' }] })).rejects.toMatchObject(
      { code: 'VALIDATION' },
    );
    await expect(seedApps({ actor, rows: [app, app] })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(
      Reflect.apply(seedSettings, undefined, [{ actor, keys: ['unsupported'] }]),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('lists all missing or excluded app glyphs without writing partial content', async () => {
    await expect(
      seedApps({
        actor,
        rows: [
          { ...app, glyph: 'missing-render-glyph' },
          { ...app, slug: 'other-fixture', glyph: 'google-logo' },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Missing or excluded app glyphs: google-logo, missing-render-glyph',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('treats explicit empty subsets as no operation', async () => {
    for (const result of [
      await seedTaxonomy({ actor, rows: [] }),
      await seedApps({ actor, rows: [] }),
      await seedSettings({ actor, keys: [] }),
    ]) {
      expect(result).toEqual({ data: { changed: 0, identifiers: [], auditId: null }, tags: [] });
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns recovery cache tags even when an unchanged seed creates no audit', async () => {
    execute.mockResolvedValue({ rows: [{ changed: 0, identifiers: [], auditId: null }] });
    expect((await seedTaxonomy({ actor, rows: [tag] })).tags).toEqual(['taxonomy', 'themes']);
    expect((await seedApps({ actor, rows: [app] })).tags).toEqual(['apps']);
    expect((await seedSettings({ actor, keys: ['features'] })).tags).toEqual(['settings']);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('accepts the complete curated app catalogue including the one-character x slug', async () => {
    execute.mockResolvedValue({ rows: [{ changed: 0, identifiers: [], auditId: null }] });
    expect((await seedApps({ actor })).tags).toEqual(['apps']);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
