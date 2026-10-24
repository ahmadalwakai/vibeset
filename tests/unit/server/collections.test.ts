import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  collectionItemSchema,
  createCollectionSchema,
  deleteCollectionSchema,
  reorderCollectionSchema,
  updateCollectionSchema,
} from '../../../lib/validation/collections';
import type { Actor } from '../../../lib/theme-status';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../db/pool', () => ({ dbPool: { transaction: mocks.transaction } }));
vi.mock('../../../server/audit', () => ({ auditInsert: vi.fn() }));
import * as service from '../../../server/services/collections';
const id = 'A1111111-1111-4111-8111-111111111111';
const actor: Actor = { kind: 'user', userId: 'owner', role: 'user', isCreator: false };
beforeEach(() => vi.resetAllMocks());

describe('user collection boundaries', () => {
  it('normalizes titles and IDs and allows an empty reorder', () => {
    expect(createCollectionSchema.parse({ titleEn: '  My edit  ', visibility: 'private' })).toEqual(
      { titleEn: 'My edit', visibility: 'private' },
    );
    expect(deleteCollectionSchema.parse({ id })).toEqual({ id: id.toLowerCase() });
    expect(reorderCollectionSchema.parse({ collectionId: id, themeIds: [] })).toEqual({
      collectionId: id.toLowerCase(),
      themeIds: [],
    });
  });
  it.each(['public', '', 'PRIVATE'])('rejects unsupported visibility %j', (visibility) => {
    expect(createCollectionSchema.safeParse({ titleEn: 'Title', visibility }).success).toBe(false);
  });
  it.each(['', ' '.repeat(4), 'a'.repeat(61), 'name\u0000', 'name\u202e'])(
    'rejects invalid title %j',
    (titleEn) => {
      expect(createCollectionSchema.safeParse({ titleEn, visibility: 'private' }).success).toBe(
        false,
      );
    },
  );
  it.each(['ownerId', 'kind', 'slug', 'isPinned', 'sortOrder'])(
    'rejects injected private field %s',
    (field) => {
      expect(
        createCollectionSchema.safeParse({
          titleEn: 'Title',
          visibility: 'unlisted',
          [field]: 'injected',
        }).success,
      ).toBe(false);
      expect(
        updateCollectionSchema.safeParse({ id, titleEn: 'Title', [field]: 'injected' }).success,
      ).toBe(false);
    },
  );
  it('requires an update field, real UUIDs, unique reorder IDs and bounded arrays', () => {
    expect(updateCollectionSchema.safeParse({ id }).success).toBe(false);
    expect(collectionItemSchema.safeParse({ collectionId: id, themeId: '../id' }).success).toBe(
      false,
    );
    expect(
      reorderCollectionSchema.safeParse({ collectionId: id, themeIds: [id, id.toLowerCase()] })
        .success,
    ).toBe(false);
    expect(
      reorderCollectionSchema.safeParse({
        collectionId: id,
        themeIds: Array.from({ length: 501 }, () => randomUUID()),
      }).success,
    ).toBe(false);
  });
  it('rejects malformed input and system actors without opening a transaction', async () => {
    await expect(
      service.createCollection({ titleEn: '', visibility: 'private' }, actor),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(service.deleteCollection({ id: 'bad' }, actor)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(
      service.createCollection(
        { titleEn: 'Title', visibility: 'private' },
        { kind: 'system', label: 'cli' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
