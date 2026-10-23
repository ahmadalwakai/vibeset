import { describe, expect, it } from 'vitest';
import { APPS } from '../../../content/apps';
import { FONT_IDS } from '../../../lib/render/spec';
import { composeLayers } from '../../../lib/render/composition';
import { renderIcon } from '../../../lib/render/icon';
import { renderHomePreview, renderLockPreview } from '../../../lib/render/preview';
import { renderWidget } from '../../../lib/render/widgets';
import { renderWallpaper } from '../../../lib/render/wallpaper';
import { fixtureGlyphs, wallpaperFixture } from './wallpaper-fixture';

const fills = ['solid', 'gradient', 'glass', 'outline', 'pattern', 'wallpaper'] as const;
const platforms = ['ios', 'shaped'] as const;

function expectSafeSvg(svg: string): void {
  expect(svg).not.toMatch(/<(?:script|text|foreignObject|style)\b|\bhref\s*=|\bon\w+\s*=/i);
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const reference of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(reference[1]);
}

describe('icons and composed previews', () => {
  it.each(fills)('renders %s icons deterministically on both platforms', (fill) => {
    const spec = wallpaperFixture();
    const wallpaper = renderWallpaper(spec, 'home', { w: 360, h: 780 }, fixtureGlyphs);
    for (const platform of platforms) {
      const options = {
        size: 128,
        platform,
        palette: spec.palette,
        glyphs: fixtureGlyphs,
        wallpaper,
      };
      const first = renderIcon(
        { ...spec.icons, fill },
        fixtureGlyphs.get('heart', 'regular'),
        options,
      );
      expect(first).toEqual(
        renderIcon({ ...spec.icons, fill }, fixtureGlyphs.get('heart', 'regular'), options),
      );
      expectSafeSvg(first.svg);
      expect([first.width, first.height]).toEqual([128, 128]);
    }
  });

  it('carries photo crops and grain into wallpaper icons without external SVG images', () => {
    const spec = wallpaperFixture();
    spec.wallpaper = {
      kind: 'image',
      assetKey: 'uploads/wallpapers/00000000-0000-4000-8000-000000000001/full.jpg',
      focalX: 0.2,
      focalY: 0.8,
      dim: 0.3,
    };
    const wallpaper = renderWallpaper(spec, 'home', { w: 360, h: 780 }, fixtureGlyphs);
    for (const platform of platforms) {
      const icon = renderIcon({ ...spec.icons, fill: 'wallpaper' }, undefined, {
        size: 128,
        platform,
        palette: spec.palette,
        glyphs: fixtureGlyphs,
        wallpaper,
      });
      expect(icon.background).toMatchObject({
        focalX: 0.2,
        focalY: 0.8,
        placement: { w: 128, h: 128, shape: platform === 'ios' ? 'square' : 'squircle' },
      });
      expect(icon.warnings).toContain('Missing icon glyph');
      expectSafeSvg(icon.svg);
    }
  });

  it('rejects missing wallpaper input and invalid icon dimensions', () => {
    const spec = wallpaperFixture();
    const options = {
      size: 128,
      platform: 'ios' as const,
      palette: spec.palette,
      glyphs: fixtureGlyphs,
    };
    expect(() => renderIcon({ ...spec.icons, fill: 'wallpaper' }, undefined, options)).toThrow(
      'requires',
    );
    expect(() => renderIcon(spec.icons, undefined, { ...options, size: Number.NaN })).toThrow();
  });

  it.each(['glyphBadge', 'ring', 'stickerCollage', 'photoFrame'] as const)(
    'renders deterministic %s widgets with no free text',
    (kind) => {
      const spec = wallpaperFixture();
      const options = { w: 320, h: 150 };
      const first = renderWidget(kind, spec, options, fixtureGlyphs);
      expect(first).toEqual(renderWidget(kind, spec, options, fixtureGlyphs));
      expectSafeSvg(first.svg);
      expect(first.grain).toBe(0);
    },
  );

  it('namespaces repeated component IDs and deduplicates warnings', () => {
    const spec = wallpaperFixture();
    const child = renderIcon(spec.icons, undefined, {
      size: 64,
      platform: 'shaped',
      palette: spec.palette,
      glyphs: fixtureGlyphs,
    });
    const scene = composeLayers(
      128,
      64,
      [
        { result: child, x: 0, y: 0, w: 64, h: 64 },
        { result: child, x: 64, y: 0, w: 64, h: 64, shape: 'circle' },
      ],
      'composed',
    );
    expectSafeSvg(scene.svg);
    expect(scene.warnings).toEqual(['Missing icon glyph']);
    expect(scene.layers).toHaveLength(2);
    expect(scene.grain).toBe(0);
  });

  it('retains phone wallpaper and icon photo layers in their paint order', () => {
    const spec = wallpaperFixture();
    spec.wallpaper = {
      kind: 'image',
      assetKey: 'uploads/wallpapers/00000000-0000-4000-8000-000000000001/full.jpg',
      focalX: 0,
      focalY: 1,
      dim: 0.2,
    };
    spec.icons.fill = 'wallpaper';
    const home = renderHomePreview(spec, fixtureGlyphs, APPS, { w: 360, h: 780 });
    expect(home.layers?.[1]?.result.background).toMatchObject({ focalX: 0, focalY: 1 });
    expect(home.layers?.filter((layer) => layer.result.background)).toHaveLength(21);
    expectSafeSvg(home.svg);
    expect(home).toEqual(renderHomePreview(spec, fixtureGlyphs, APPS, { w: 360, h: 780 }));
  });

  it.each(FONT_IDS)('uses self-contained %s clock outlines in both previews', (font) => {
    const spec = wallpaperFixture();
    spec.type.display = font;
    for (const result of [
      renderHomePreview(spec, fixtureGlyphs, APPS, { w: 240, h: 520 }),
      renderLockPreview(spec, fixtureGlyphs, { w: 240, h: 520 }),
    ]) {
      expectSafeSvg(result.svg);
      expect(result.layers?.length).toBeGreaterThan(5);
      expect(result.svg).not.toContain('font-family');
      expect(result.svg).not.toContain('NaN');
    }
  });
});
