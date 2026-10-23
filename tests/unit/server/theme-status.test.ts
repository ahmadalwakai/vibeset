import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../../content/render-sample';
import {
  THEME_STATUSES,
  rejectionReasonSchema,
  themeIdSchema,
  transitionThemeSchema,
} from '../../../lib/theme-status';
import type { Actor, TransitionTheme } from '../../../lib/theme-status';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  batch: vi.fn(),
  execute: vi.fn(),
  tags: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../db/index', () => ({
  db: { select: mocks.select, batch: mocks.batch, execute: mocks.execute },
}));
vi.mock('../../../server/services/theme-cache-tags', () => ({ getThemeCacheTags: mocks.tags }));

import {
  allowedTransitions,
  assertTransition,
  transitionStatements,
  transitionThemeStatus,
} from '../../../server/services/theme-status';
import { AppError } from '../../../server/errors';

const owner: Actor = { kind: 'user', userId: 'creator-owner', role: 'user', isCreator: true };
const other: Actor = { kind: 'user', userId: 'someone-else', role: 'user', isCreator: false };
const admin: Actor = { kind: 'user', userId: 'admin-user', role: 'admin', isCreator: false };
const system: Actor = { kind: 'system', label: 'test-cli' };
const fixture: TransitionTheme = {
  id: '21b1968f-95a2-4f94-9f9e-3d0120b70766',
  slug: 'test-status-theme',
  status: 'draft',
  source: 'generated',
  ownerId: owner.userId,
  nameEn: 'A valid theme',
  spec: renderSampleSpec(playgroundStateSchema.parse({})),
  specHash: 'a'.repeat(64),
  assetVersion: 2,
  aestheticTagCount: 1,
};
const administrative = new Set([
  'draft:approved',
  'pending_review:approved',
  'pending_review:rejected',
  'approved:rejected',
  'approved:published',
  'rejected:approved',
  'published:archived',
  'archived:published',
]);
const owned = new Set(['draft:pending_review', 'pending_review:draft', 'rejected:draft']);

function errorCode(run: () => void): string | null {
  try {
    run();
    return null;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
}

function selection(rows: unknown[]): {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
} {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.execute.mockReturnValue({});
  mocks.select.mockReturnValue(selection([fixture]));
  mocks.batch.mockResolvedValue([{ rows: [{ id: fixture.id, status: 'approved' }] }]);
  mocks.tags.mockResolvedValue(['themes', 'theme:test-status-theme', 'collections']);
});

describe('complete theme transition matrix', () => {
  const cases = THEME_STATUSES.flatMap((from) =>
    THEME_STATUSES.flatMap((to) =>
      (
        [
          ['owner creator', owner],
          ['other user', other],
          ['admin', admin],
          ['system', system],
        ] as const
      ).map(([label, actor]) => {
        const edge = `${from}:${to}`;
        const exists = administrative.has(edge) || owned.has(edge);
        const permitted =
          (administrative.has(edge) && (actor.kind === 'system' || actor.role === 'admin')) ||
          (owned.has(edge) && actor.kind === 'user' && actor.userId === owner.userId);
        return {
          from,
          to,
          label,
          actor,
          expected: !exists ? 'INVALID_STATE' : permitted ? null : 'FORBIDDEN',
        };
      }),
    ),
  );
  it.each(cases)('$from → $to as $label returns $expected', ({ from, to, actor, expected }) => {
    expect(
      errorCode(() =>
        assertTransition({ ...fixture, status: from }, to, actor, 'Reviewed by moderation'),
      ),
    ).toBe(expected);
  });

  it('provides actor capability candidates, while assertions still require actual ownership', () => {
    expect(allowedTransitions('draft', owner)).toEqual(['pending_review']);
    expect(allowedTransitions('draft', admin)).toEqual(['approved']);
    expect(allowedTransitions('pending_review', system)).toEqual(['approved', 'rejected']);
    expect(allowedTransitions('pending_review', other)).toEqual(['draft']);
    expect(
      errorCode(() => assertTransition({ ...fixture, status: 'pending_review' }, 'draft', other)),
    ).toBe('FORBIDDEN');
  });

  it.each(['creator', 'remix'] as const)(
    'refuses direct draft approval for %s sources even for system/admin',
    (source) => {
      for (const actor of [admin, system])
        expect(errorCode(() => assertTransition({ ...fixture, source }, 'approved', actor))).toBe(
          'INVALID_STATE',
        );
    },
  );

  it('does not treat an admin, a system label, or a regular owner as an approved creator', () => {
    for (const actor of [
      { ...owner, isCreator: false },
      { ...owner, role: 'admin', isCreator: false } satisfies Actor,
      system,
    ]) {
      expect(errorCode(() => assertTransition(fixture, 'pending_review', actor))).toBe('FORBIDDEN');
    }
    expect(
      errorCode(() =>
        assertTransition(fixture, 'pending_review', { ...system, userId: owner.userId } as Actor),
      ),
    ).toBe('VALIDATION');
  });

  it('allows ordinary owners to withdraw or edit a rejected theme without creator capability', () => {
    const ordinary: Actor = { ...owner, isCreator: false };
    for (const status of ['pending_review', 'rejected'] as const)
      expect(
        errorCode(() => assertTransition({ ...fixture, status }, 'draft', ordinary)),
      ).toBeNull();
  });

  it.each([{ nameEn: ' ' }, { nameEn: 'x'.repeat(61) }, { spec: {} }, { aestheticTagCount: 0 }])(
    'requires complete valid submission metadata: %j',
    (invalid) => {
      expect(
        errorCode(() => assertTransition({ ...fixture, ...invalid }, 'pending_review', owner)),
      ).toBe('VALIDATION');
    },
  );

  it('requires a nonempty plain-text rejection reason and bounds normalized length', () => {
    for (const reason of [undefined, '   ', '<b></b>', '\u0000\u202e', 'x'.repeat(501)])
      expect(
        errorCode(() =>
          assertTransition({ ...fixture, status: 'approved' }, 'rejected', admin, reason),
        ),
      ).toBe('VALIDATION');
    expect(rejectionReasonSchema.parse('  <b>Needs review</b>\n\u202e please  ')).toBe(
      'Needs review please',
    );
  });
});

describe('guarded update and audit', () => {
  it.each(['\n', '\r', '\r\n', '\u2028', '\u2029', '\u0000'])(
    'rejects terminal whitespace/control suffix %j in stored identities and hashes',
    (suffix) => {
      for (const invalid of [
        { id: fixture.id + suffix },
        { slug: fixture.slug + suffix },
        { specHash: fixture.specHash + suffix },
      ]) {
        expect(transitionThemeSchema.safeParse({ ...fixture, ...invalid }).success).toBe(false);
        expect(
          errorCode(() => assertTransition({ ...fixture, ...invalid }, 'approved', system)),
        ).toBe('VALIDATION');
      }
    },
  );

  it('normalizes uppercase UUID snapshots and SQL parameters while leaving opaque actor IDs case-sensitive', () => {
    const upper = fixture.id.toUpperCase();
    expect(themeIdSchema.parse(upper)).toBe(fixture.id);
    expect(transitionThemeSchema.parse({ ...fixture, id: upper }).id).toBe(fixture.id);
    transitionStatements({ ...fixture, id: upper }, 'approved', system);
    const raw: unknown = mocks.execute.mock.calls[0]?.[0];
    if (!(raw instanceof SQL)) throw new Error('Expected conditional SQL');
    const { params } = new PgDialect().sqlToQuery(raw);
    expect(params).toContain(fixture.id);
    expect(params).not.toContain(upper);
    expect(
      errorCode(() =>
        assertTransition(fixture, 'pending_review', {
          ...owner,
          userId: owner.userId.toUpperCase(),
        }),
      ),
    ).toBe('FORBIDDEN');
  });

  it('normalizes UUID service inputs and output IDs and rejects a terminal-newline UUID before querying', async () => {
    await expect(
      transitionThemeStatus({ themeId: `${fixture.id}\n`, to: 'approved', actor: system }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(mocks.select).not.toHaveBeenCalled();
    const query = selection([fixture]);
    mocks.select.mockReturnValueOnce(query);
    mocks.batch.mockResolvedValueOnce([
      { rows: [{ id: fixture.id.toUpperCase(), status: 'approved' }] },
    ]);
    await expect(
      transitionThemeStatus({ themeId: fixture.id.toUpperCase(), to: 'approved', actor: system }),
    ).resolves.toMatchObject({ data: { id: fixture.id, status: 'approved' } });
    const predicate: unknown = query.where.mock.calls[0]?.[0];
    if (!(predicate instanceof SQL)) throw new Error('Expected identity predicate');
    expect(new PgDialect().sqlToQuery(predicate).params).toEqual([fixture.id]);
  });

  it('builds one conditional CTE that audits only UPDATE RETURNING rows and guards the captured state', () => {
    const statements = transitionStatements(fixture, 'approved', system);
    expect(statements).toHaveLength(1);
    const raw: unknown = mocks.execute.mock.calls[0]?.[0];
    expect(raw).toBeInstanceOf(SQL);
    if (!(raw instanceof SQL)) throw new Error('Expected conditional SQL');
    const query = new PgDialect().sqlToQuery(raw);
    expect(query.sql).toMatch(/WITH changed AS \([\s\S]*UPDATE[\s\S]*RETURNING[\s\S]*audited AS/);
    expect(query.sql).toMatch(/INSERT INTO "audit_log"[\s\S]*FROM changed/);
    expect(query.sql).toContain('"themes"."asset_version"');
    expect(query.sql).toContain('"themes"."spec_hash"');
    expect(query.sql).toContain('IS NOT DISTINCT FROM');
    expect(query.params).toEqual(
      expect.arrayContaining([
        fixture.id,
        fixture.status,
        fixture.assetVersion,
        fixture.specHash,
        fixture.source,
        fixture.ownerId,
      ]),
    );
    expect(query.params).toContain(
      JSON.stringify({
        before: { status: 'draft' },
        after: { status: 'approved' },
        actor: { kind: 'system', label: 'test-cli' },
      }),
    );
  });

  it('sanitizes rejection reason before both database storage and audit metadata', () => {
    transitionStatements(
      { ...fixture, status: 'approved' },
      'rejected',
      admin,
      '<b>Too dark</b>\u0000',
    );
    const raw: unknown = mocks.execute.mock.calls[0]?.[0];
    if (!(raw instanceof SQL)) throw new Error('Expected conditional SQL');
    const { params } = new PgDialect().sqlToQuery(raw);
    expect(params).toContain('Too dark');
    expect(JSON.stringify(params)).not.toContain('<b>');
    expect(params).toContain(
      JSON.stringify({
        before: { status: 'approved' },
        after: { status: 'rejected' },
        reason: 'Too dark',
      }),
    );
  });

  it('rechecks current approved creator status, name and aesthetic membership inside submission SQL', () => {
    transitionStatements(fixture, 'pending_review', owner);
    const raw: unknown = mocks.execute.mock.calls[0]?.[0];
    if (!(raw instanceof SQL)) throw new Error('Expected conditional SQL');
    const { sql } = new PgDialect().sqlToQuery(raw);
    expect(sql).toContain('"creator_profiles"."status" = \'approved\'');
    expect(sql).toContain('"tags"."kind" = \'aesthetic\'');
    expect(sql).toContain('"themes"."name_en" =');
  });

  it.each(THEME_STATUSES)('direct services cannot publish from %s', async (status) => {
    expect(() => transitionStatements({ ...fixture, status }, 'published', system)).toThrow(
      AppError,
    );
    await expect(
      transitionThemeStatus({ themeId: fixture.id, to: 'published', actor: system }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it('returns CONFLICT for zero changed rows without a second independent audit insert', async () => {
    mocks.batch.mockResolvedValueOnce([{ rows: [] }]);
    await expect(
      transitionThemeStatus({ themeId: fixture.id, to: 'approved', actor: system }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.batch).toHaveBeenCalledTimes(1);
  });

  it('returns a successful private transition without invalidating public caches', async () => {
    await expect(
      transitionThemeStatus({ themeId: fixture.id, to: 'approved', actor: system }),
    ).resolves.toEqual({ data: { id: fixture.id, status: 'approved' }, tags: [] });
    expect(mocks.tags).not.toHaveBeenCalled();
  });

  it('returns public-impact tags only when archiving a published theme', async () => {
    mocks.select.mockReturnValueOnce(selection([{ ...fixture, status: 'published' }]));
    mocks.batch.mockResolvedValueOnce([{ rows: [{ id: fixture.id, status: 'archived' }] }]);
    await expect(
      transitionThemeStatus({ themeId: fixture.id, to: 'archived', actor: admin }),
    ).resolves.toEqual({
      data: { id: fixture.id, status: 'archived' },
      tags: ['themes', 'theme:test-status-theme', 'collections'],
    });
    expect(mocks.tags.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.batch.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('rejects missing themes and malformed boundaries before mutation', async () => {
    await expect(
      transitionThemeStatus({ themeId: 'invalid', to: 'approved', actor: system }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(mocks.select).not.toHaveBeenCalled();
    mocks.select.mockReturnValueOnce(selection([]));
    await expect(
      transitionThemeStatus({ themeId: fixture.id, to: 'approved', actor: system }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.batch).not.toHaveBeenCalled();
  });
});
