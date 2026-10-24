import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../../content/render-sample';
import {
  saveRemixSchema,
  updateRemixSchema,
  deleteRemixSchema,
} from '../../../lib/validation/remixes';
import type { SaveRemixInput } from '../../../lib/validation/remixes';
import type { Actor } from '../../../lib/theme-status';

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), auditInsert: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../db/pool', () => ({ dbPool: { transaction: mocks.transaction } }));
vi.mock('../../../server/audit', () => ({ auditInsert: mocks.auditInsert }));
import { saveRemix, updateRemix, deleteRemix } from '../../../server/services/remixes';

const id = '11111111-1111-4111-8111-111111111111';
const input: SaveRemixInput = {
  spec: renderSampleSpec(playgroundStateSchema.parse({})),
  nameEn: 'My remix',
  remixOfSlug: 'public-theme',
};
const actor: Actor = { kind: 'user', userId: 'owner', role: 'user', isCreator: false };
beforeEach(() => vi.resetAllMocks());

describe('remix mutation input contracts', () => {
  it('normalizes names and specs before hashing or persistence', () => {
    const parsed = saveRemixSchema.parse({
      ...input,
      nameEn: '  My remix  ',
      spec: { ...input.spec, palette: { ...input.spec.palette, bg: '#ABCDEF' } },
    });
    expect(parsed.nameEn).toBe('My remix');
    expect(parsed.spec.palette.bg).toBe('#abcdef');
  });
  it('normalizes mutation UUIDs', () => {
    expect(
      updateRemixSchema.parse({ spec: input.spec, nameEn: input.nameEn, id: id.toUpperCase() }),
    ).toMatchObject({ id });
    expect(deleteRemixSchema.parse({ id: id.toUpperCase() })).toEqual({ id });
  });
  it.each(['', '   ', 'x'.repeat(61), 'bad\u0000name', 'hidden\u202ename'])(
    'rejects invalid names %j',
    (nameEn) => {
      expect(saveRemixSchema.safeParse({ ...input, nameEn }).success).toBe(false);
    },
  );
  it.each(['../draft', 'theme\n', 'private theme', '', 'x'.repeat(161)])(
    'rejects invalid source slugs %j',
    (remixOfSlug) => {
      expect(saveRemixSchema.safeParse({ ...input, remixOfSlug }).success).toBe(false);
    },
  );
  it.each(['ownerId', 'source', 'status', 'slug', 'assets', 'specHash', 'isFeatured'])(
    'rejects client-controlled private field %s',
    (field) => {
      expect(saveRemixSchema.safeParse({ ...input, [field]: 'attacker-value' }).success).toBe(
        false,
      );
    },
  );
  it('requires a full spec/name update and keeps source lineage immutable', () => {
    expect(updateRemixSchema.safeParse({ id, nameEn: 'New name' }).success).toBe(false);
    expect(updateRemixSchema.safeParse({ id, spec: input.spec }).success).toBe(false);
    expect(
      updateRemixSchema.safeParse({
        id,
        spec: input.spec,
        nameEn: 'New name',
        remixOfSlug: 'other',
      }).success,
    ).toBe(false);
    expect(deleteRemixSchema.safeParse({ id, ownerId: 'other' }).success).toBe(false);
  });
});

describe('service boundary rejection', () => {
  it('rejects malformed input before opening a database transaction', async () => {
    await expect(saveRemix({ ...input, spec: {} } as SaveRemixInput, actor)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(
      updateRemix({ id: '../id', spec: input.spec, nameEn: 'Name' }, actor),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(deleteRemix({ id: 'not-an-id' }, actor)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('rejects system or malformed actors before opening a transaction', async () => {
    const system: Actor = { kind: 'system', label: 'cli' };
    await expect(saveRemix(input, system)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      updateRemix({ id, spec: input.spec, nameEn: 'Name' }, system),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(deleteRemix({ id }, system)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(saveRemix(input, { ...actor, userId: '' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
