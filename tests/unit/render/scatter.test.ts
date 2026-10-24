import { renderAsync } from '@resvg/resvg-js';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/render/prng';
import { idFactory, svgDocument } from '@/lib/render/svg';
import { renderScatter } from '@/lib/render/wallpaper/scatter';
import type { WallpaperSpec } from '@/lib/render/spec';
import { wallpaperFixture } from './wallpaper-fixture';

type ScatterSpec = Extract<WallpaperSpec, { kind: 'scatter' }>;

function scatter(seed: number): ScatterSpec {
  return {
    kind: 'scatter',
    seed,
    glyphs: ['star'],
    weight: 'regular',
    density: 0.34098037203773857,
    sizeMin: 0.0275426028680522,
    sizeMax: 0.07834264323115349,
    rotate: true,
    grain: 0,
    colors: null,
  };
}

function glyphLayer(spec: ScatterSpec, w: number, h: number): string {
  const layer = renderScatter(spec, {
    w,
    h,
    palette: wallpaperFixture().palette,
    colors: ['#000000', '#ffffff'],
    rng: createRng(spec.seed),
    id: idFactory('scatter-safe-band'),
    warnings: [],
    // A full square stresses every glyph-bound corner rather than only a small path inside it.
    glyphs: { get: () => '<rect width="256" height="256"/>' },
  });
  return layer.body.replace(/^<rect\b[^>]*\/>/u, '');
}

describe('scatter status and clock areas', () => {
  it.each([
    { seed: 1_415_561_145, w: 360, h: 780, large: false },
    { seed: 0, w: 360, h: 780, large: true },
    { seed: 42, w: 780, h: 360, large: true },
  ])(
    'keeps rotated glyph pixels out of the status band at $w×$h, seed $seed',
    async ({ seed, w, h, large }) => {
      const spec = scatter(seed);
      if (large) Object.assign(spec, { density: 1, sizeMin: 0.2, sizeMax: 0.35 });
      const body = glyphLayer(spec, w, h);
      expect(body).toContain('transform=');
      const rendered = await renderAsync(svgDocument({ w, h, body }), {
        font: { loadSystemFonts: false },
      });
      const { data, info } = await sharp(rendered.asPng())
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const statusBytes = Math.floor(h * 0.08) * w * info.channels;
      let statusAlpha = 0;
      let totalAlpha = 0;
      for (let pixel = info.channels - 1; pixel < data.length; pixel += info.channels) {
        const alpha = data[pixel] ?? 0;
        totalAlpha += alpha;
        if (pixel < statusBytes) statusAlpha += alpha;
      }
      expect(totalAlpha).toBeGreaterThan(0);
      expect(statusAlpha).toBe(0);
    },
  );

  it('retains a sparser scattering between the status band and the lower edge of the clock area', () => {
    const w = 240;
    const h = 520;
    let clockCount = 0;
    let lowerCount = 0;
    for (let seed = 0; seed < 80; seed += 1) {
      const body = glyphLayer({ ...scatter(seed), density: 1, sizeMin: 0.03, sizeMax: 0.06 }, w, h);
      for (const match of body.matchAll(
        /transform="translate\([-\d.]+ ([-\d.]+)\) rotate\([-\d.]+ [\d.]+ ([\d.]+)\) scale/gu,
      )) {
        const centerY = Number(match[1]) + Number(match[2]);
        if (centerY >= h * 0.08 && centerY < h * 0.22) clockCount += 1;
        else if (centerY >= h * 0.22) lowerCount += 1;
      }
    }
    expect(clockCount).toBeGreaterThan(0);
    const clockDensity = clockCount / 0.14;
    const lowerDensity = lowerCount / 0.78;
    expect(clockDensity).toBeLessThan(lowerDensity * 0.5);
  });
});
