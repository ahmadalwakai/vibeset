import { describe, expect, it } from 'vitest';
import type { AppDTO } from '../../../lib/dto';
import {
  chunk,
  defaultSelection,
  fileNameFor,
  matchesSearch,
  wallpaperGlyphWeights,
} from '../../../lib/client/icon-export-utils';
import { wallpaperFixture } from '../render/wallpaper-fixture';

const app: AppDTO = {
  slug: 'whatsapp',
  name: 'WhatsApp',
  aliases: ['واتساب', 'وَاتْسَاب', 'Café'],
  category: 'social',
  glyph: 'chat',
  rank: 1,
};

describe('icon export utilities', () => {
  it('selects the first 24 by rank then slug without changing the input order', () => {
    const apps = Array.from({ length: 30 }, (_, index) => ({
      ...app,
      slug: `app-${String(index).padStart(2, '0')}`,
      rank: index + 1,
    })).reverse();
    const before = apps.map(({ slug }) => slug);
    expect(defaultSelection(apps)).toEqual([...before].reverse().slice(0, 24));
    expect(apps.map(({ slug }) => slug)).toEqual(before);
    expect(
      defaultSelection([
        { ...app, slug: 'b' },
        { ...app, slug: 'a' },
      ]),
    ).toEqual(['a', 'b']);
  });
  it('uses stable safe identifiers rather than a custom label for filenames', () => {
    const id = 'custom-00000000-0000-4000-8000-000000000001';
    expect(fileNameFor('lilac-night', 'whatsapp')).toBe('vibeset-lilac-night-whatsapp.png');
    expect(fileNameFor('lilac-night', id)).toBe(`vibeset-lilac-night-${id}.png`);
    expect(fileNameFor('a'.repeat(160), 'b'.repeat(80))).toHaveLength(253);
  });
  it.each(['../file', 'bad/name', 'good\n', 'UPPERCASE', 'تطبيق', '', 'a'.repeat(81)])(
    'rejects unsafe app filename segment %j',
    (slug) => {
      expect(() => fileNameFor('theme', slug)).toThrow();
    },
  );
  it.each(['cafe', 'CAFÉ', 'واتساب', 'وَاتْسَاب', 'واتـساب', 'واتساب café', ' app ', ''])(
    'matches names and normalized English/Arabic aliases for %j',
    (query) => {
      expect(matchesSearch(app, query)).toBe(true);
    },
  );
  it('requires every query token and preserves non-matching apps', () => {
    expect(matchesSearch(app, 'whatsapp calendar')).toBe(false);
    expect(matchesSearch(app, 'telegram')).toBe(false);
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
  it('loads wallpaper-specific glyph weights only when a kind uses them', () => {
    expect(wallpaperGlyphWeights(wallpaperFixture().wallpaper)).toEqual([]);
    expect(
      wallpaperGlyphWeights({
        kind: 'pattern',
        pattern: 'hearts',
        scale: 1,
        rotation: 0,
        colors: null,
      }),
    ).toEqual(['fill']);
    expect(
      wallpaperGlyphWeights({
        kind: 'pattern',
        pattern: 'bows',
        scale: 1,
        rotation: 0,
        colors: null,
      }),
    ).toEqual([]);
    expect(
      wallpaperGlyphWeights({
        kind: 'scatter',
        seed: 1,
        glyphs: ['heart'],
        weight: 'duotone',
        density: 0.2,
        sizeMin: 0.03,
        sizeMax: 0.05,
        rotate: false,
        grain: 0,
        colors: null,
      }),
    ).toEqual(['duotone']);
  });
});
