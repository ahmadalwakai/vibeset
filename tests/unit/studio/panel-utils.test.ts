import { describe, expect, it } from 'vitest';
import {
  addPanelGlyph,
  fontFamilyFor,
  iconFillPatch,
  scatterSizePatch,
} from '@/components/studio/panel-utils';
import { playgroundStateSchema, renderSampleSpec } from '@/content/render-sample';
import { FONT_IDS, themeSpecSchema } from '@/lib/render/spec';

const spec = renderSampleSpec(playgroundStateSchema.parse({ kind: 'scatter' }));

describe('Studio controls preserve valid designs', () => {
  it.each([
    ['min', 0.2],
    ['min', -1],
    ['min', 5],
    ['max', 0.03],
    ['max', -1],
    ['max', 5],
  ] as const)('keeps scatter bounds ordered when changing %s to %s', (edge, value) => {
    const wallpaper = spec.wallpaper;
    if (wallpaper.kind !== 'scatter') throw new Error('Scatter fixture required');
      const original = structuredClone(wallpaper);
    const updated = themeSpecSchema.parse({
      ...spec,
      wallpaper: { ...wallpaper, ...scatterSizePatch(wallpaper, edge, value) },
    });
    if (updated.wallpaper.kind !== 'scatter') throw new Error('Scatter result required');
    expect(updated.wallpaper.sizeMin).toBeLessThanOrEqual(updated.wallpaper.sizeMax);
      expect(wallpaper).toEqual(original);
  });

  it('adds a valid gradient end colour when switching from a solid icon', () => {
    const icons = { ...spec.icons, fill: 'solid' as const, bg2: null };
    const patch = iconFillPatch(icons, spec.palette, 'gradient');
    expect(themeSpecSchema.parse({ ...spec, icons: { ...icons, ...patch } }).icons.bg2).toBe(
      spec.palette.accent,
    );
    expect(icons.bg2).toBeNull();
  });

  it('keeps an edited gradient end colour when returning to gradient fill', () => {
    const icons = { ...spec.icons, bg2: spec.palette.ink };
    expect(iconFillPatch(icons, spec.palette, 'gradient').bg2).toBe(spec.palette.ink);
  });

  it('prevents duplicate and seventh decorative or scatter symbols', () => {
    const values = ['heart', 'star', 'moon', 'flower', 'sparkle', 'butterfly'];
    expect(addPanelGlyph(values, 'heart')).toEqual(values);
    expect(addPanelGlyph(values, 'sun')).toEqual(values);
    expect(addPanelGlyph([], 'sun')).toEqual(['sun']);
    expect(values).toHaveLength(6);
  });

  it.each(FONT_IDS)('provides an Arabic fallback without changing selected font %s', (font) => {
    const family = fontFamilyFor(font);
    expect(family).toContain('var(--font-el-messiri)');
    expect(family).toContain('var(--font-readex)');
    expect(
      family.startsWith(font === 'readex-pro' ? 'var(--font-readex)' : `var(--font-${font})`),
    ).toBe(true);
  });
});
