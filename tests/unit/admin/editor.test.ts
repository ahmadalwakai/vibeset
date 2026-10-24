import { describe, expect, it } from 'vitest';
import { adminEditorInputsEqual, adminEditorTransitions } from '../../../lib/admin-theme-editor';

describe('admin editor transition controls', () => {
  const actor = { userId: 'owner', isCreator: false };
  it('keeps creator drafts in the submission workflow and allows direct approval of generated drafts', () => {
    expect(
      adminEditorTransitions({ status: 'draft', source: 'creator', ownerId: 'foreign' }, actor),
    ).toEqual([]);
    expect(
      adminEditorTransitions({ status: 'draft', source: 'generated', ownerId: null }, actor),
    ).toEqual(['approved']);
    expect(
      adminEditorTransitions(
        { status: 'draft', source: 'creator', ownerId: 'owner' },
        { ...actor, isCreator: true },
      ),
    ).toEqual(['pending_review']);
    for (const source of ['generated', 'admin'] as const) {
      expect(
        adminEditorTransitions(
          { status: 'draft', source, ownerId: 'owner' },
          { ...actor, isCreator: true },
        ),
      ).toEqual(['approved']);
    }
  });
  it('exposes moderation while preserving owner-only withdrawal and separate publication', () => {
    expect(
      adminEditorTransitions(
        { status: 'pending_review', source: 'creator', ownerId: 'foreign' },
        actor,
      ),
    ).toEqual(['approved', 'rejected']);
    expect(
      adminEditorTransitions(
        { status: 'pending_review', source: 'creator', ownerId: 'owner' },
        actor,
      ),
    ).toEqual(['draft', 'approved', 'rejected']);
    expect(
      adminEditorTransitions({ status: 'archived', source: 'creator', ownerId: null }, actor),
    ).toEqual(['published']);
  });
});

it('treats tag reselection as unchanged while retaining meaningful metadata differences', () => {
  const original = {
    id: 'd4bed4cc-d50c-4f81-a0e4-0dac79953d43',
    nameEn: 'Lavender',
    tagSlugs: ['lavender-aesthetic', 'soft-mood'],
    isFeatured: false,
  };
  const reordered = { ...original, tagSlugs: [...original.tagSlugs].reverse() };
  expect(adminEditorInputsEqual(original, reordered)).toBe(true);
  expect(adminEditorInputsEqual(original, { ...reordered, nameEn: 'Rose' })).toBe(false);
  expect(adminEditorInputsEqual(original, { ...reordered, tagSlugs: ['rose-aesthetic'] })).toBe(
    false,
  );
  expect(original.tagSlugs).toEqual(['lavender-aesthetic', 'soft-mood']);
});
