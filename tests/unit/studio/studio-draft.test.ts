import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStudioDraft, writeStudioDraft } from '../../../lib/client/studio-draft';
import { MAX_STUDIO_DRAFT_LENGTH, STUDIO_DRAFT_KEY } from '../../../lib/studio';
import { wallpaperFixture } from '../render/wallpaper-fixture';

function storage(raw: string | null): {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
} {
  const fake = { getItem: vi.fn(() => raw), setItem: vi.fn() };
  vi.stubGlobal('localStorage', fake);
  return fake;
}
const draft = () => ({ v: 1 as const, spec: wallpaperFixture(), sourceSlug: 'lilac-heart' });
afterEach(() => vi.unstubAllGlobals());

describe('Studio draft boundary', () => {
  it('round-trips source attribution and returns copies rather than mutable storage state', () => {
    const fake = storage(JSON.stringify(draft()));
    expect(readStudioDraft()).toEqual(draft());
    const read = readStudioDraft();
    if (read) read.spec.decor.push('flower');
    expect(readStudioDraft()).toEqual(draft());
    writeStudioDraft({ ...draft(), sourceSlug: null });
    expect(fake.setItem).toHaveBeenCalledWith(
      STUDIO_DRAFT_KEY,
      JSON.stringify({ ...draft(), sourceSlug: null }),
    );
  });
  it.each([null, '', '{', 'null', '{}', 'x'.repeat(MAX_STUDIO_DRAFT_LENGTH + 1)])(
    'ignores absent/corrupt/oversized stored values',
    (raw) => {
      storage(raw);
      expect(readStudioDraft()).toBeNull();
    },
  );
  it.each([
    { ...draft(), v: 2 },
    { ...draft(), sourceSlug: '../escape' },
    {
      ...draft(),
      spec: { ...wallpaperFixture(), icons: { ...wallpaperFixture().icons, glyphScale: 10 } },
    },
    { ...draft(), extra: true },
  ])('rejects invalid persisted contracts', (value) => {
    storage(JSON.stringify(value));
    expect(readStudioDraft()).toBeNull();
  });
  it('survives blocked and quota-exhausted storage without losing a draft in this tab', () => {
    const fake = storage(null);
    fake.getItem.mockImplementation(() => {
      throw new Error('denied');
    });
    fake.setItem.mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeStudioDraft(draft())).not.toThrow();
    expect(readStudioDraft()).toEqual(draft());
    const read = readStudioDraft();
    if (read) read.spec.decor.length = 0;
    expect(readStudioDraft()).toEqual(draft());
  });
  it('does not resurrect a volatile draft after storage is intentionally cleared or corrupted', () => {
    const fake = storage(null);
    writeStudioDraft(draft());
    expect(readStudioDraft()).toBeNull();
    fake.getItem.mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readStudioDraft()).toBeNull();
  });
});
