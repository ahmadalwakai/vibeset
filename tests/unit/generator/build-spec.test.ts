import { describe, expect, it } from 'vitest';
import { AESTHETICS } from '../../../content/aesthetics';
import { getPalette } from '../../../content/palettes';
import manifest from '../../../public/glyphs/v1/manifest.json';
import type { AestheticRecipe, CuratedPalette, WallpaperChoice } from '../../../lib/generator';
import { buildSpec } from '../../../lib/render/build-spec';
import { createRng } from '../../../lib/render/prng';
import { qaSpec } from '../../../lib/render/qa';
import { themeSpecSchema } from '../../../lib/render/spec';

const names = new Set(manifest.map(({ name }) => name));
const combinations = AESTHETICS.flatMap((recipe) =>
  recipe.palettes.map((id) => {
    const palette = getPalette(id);
    if (!palette) throw new Error(`Unknown palette ${id}`);
    return { label: `${recipe.slug}/${id}`, recipe, palette };
  }),
);

function fixture(): { recipe: AestheticRecipe; palette: CuratedPalette } {
  const first = combinations[0];
  if (!first) throw new Error('At least one curated recipe is required');
  return first;
}

function lightPalette(): CuratedPalette {
  const palette = getPalette('cotton-candy');
  if (!palette) throw new Error('Cotton Candy is required for contrast boundary tests');
  return palette;
}

describe('curated spec builder', () => {
  it.each(combinations)(
    '$label is deterministic, valid and passes QA across three seeds',
    ({ recipe, palette }) => {
      for (const seed of [0, 42, 2_147_483_647]) {
        const spec = buildSpec(recipe, palette, createRng(seed));
        expect(spec).toEqual(buildSpec(recipe, palette, createRng(seed)));
        expect(themeSpecSchema.safeParse(spec).success).toBe(true);
        expect(recipe.icons.fills).toContain(spec.icons.fill);
        expect(spec.decor.length).toBeLessThanOrEqual(3);
        expect(spec.type.body).toBe('readex-pro');
        const qa = qaSpec(spec, names);
        expect(qa.reasons, `${recipe.slug}/${palette.id}/${seed}`).toEqual([]);
        expect(qa.ok).toBe(true);
      }
    },
  );

  it('handles empty decor without a sticker and uses a neutral scatter glyph', () => {
    const { recipe, palette } = fixture();
    const empty: AestheticRecipe = {
      ...recipe,
      decor: [],
      wallpapers: [{ kind: 'scatter', weight: 1 }],
      icons: { ...recipe.icons, stickerChance: 1 },
      lockWallpaper: 'same',
    };
    const spec = buildSpec(empty, palette, createRng(10));
    expect(spec.decor).toEqual([]);
    expect(spec.icons.sticker).toBeNull();
    expect(spec.wallpaper).toMatchObject({ kind: 'scatter', glyphs: ['circle'] });
    expect(spec.lockWallpaper).toBeNull();
    expect(qaSpec(spec, names).ok).toBe(true);
  });

  it('tries remaining allowed fills when the selected fill has no eligible colours', () => {
    const { recipe } = fixture();
    const palette = lightPalette();
    const input: AestheticRecipe = {
      ...recipe,
      icons: { ...recipe.icons, fills: ['wallpaper', 'solid'] },
    };
    for (const seed of [1, 2, 3, 4]) {
      const spec = buildSpec(input, palette, createRng(seed));
      expect(spec.icons.fill).toBe('solid');
      expect(qaSpec(spec, names).ok).toBe(true);
    }
  });

  it('keeps a valid failing candidate when no recipe fill can pass', () => {
    const { recipe } = fixture();
    const palette = lightPalette();
    const input: AestheticRecipe = { ...recipe, icons: { ...recipe.icons, fills: ['wallpaper'] } };
    const spec = buildSpec(input, palette, createRng(42));
    expect(themeSpecSchema.safeParse(spec).success).toBe(true);
    expect(spec.icons.fill).toBe('wallpaper');
    expect(qaSpec(spec, names).reasons).toContain('Icon contrast below 3:1');
  });

  it.each<WallpaperChoice>([
    { kind: 'mesh', weight: 1 },
    { kind: 'blobs', weight: 1 },
    { kind: 'waves', weight: 1, params: { amplitude: 1 } },
    { kind: 'pattern', weight: 1, params: { scale: 2.9, rotation: -40 } },
    { kind: 'scatter', weight: 1, params: { density: 1 } },
    { kind: 'aurora', weight: 1 },
    { kind: 'sky', weight: 1, params: { clouds: 1, stars: 0.8, moon: true } },
    { kind: 'shapes', weight: 1, params: { density: 1 } },
  ])('creates a calmer valid $kind lock variant', (choice) => {
    const { recipe, palette } = fixture();
    const spec = buildSpec(
      { ...recipe, wallpapers: [choice], lockWallpaper: 'variant' },
      palette,
      createRng(42),
    );
    const home = spec.wallpaper;
    const lock = spec.lockWallpaper;
    expect(lock?.kind).toBe(home.kind);
    expect(themeSpecSchema.safeParse(spec).success).toBe(true);
    if (home.kind === 'pattern' && lock?.kind === 'pattern') {
      expect(lock.scale).toBe(Math.min(3, home.scale * 1.2));
      expect(lock.rotation).toBe(home.rotation * 0.7);
    } else if ('seed' in home && lock && 'seed' in lock) {
      expect(lock.seed).toBe((home.seed + 1) % 2_147_483_648);
      if (home.kind === 'waves' && lock.kind === 'waves')
        expect(lock.amplitude).toBe(home.amplitude * 0.7);
      if (home.kind === 'sky' && lock.kind === 'sky') {
        expect(lock.clouds).toBe(home.clouds * 0.7);
        expect(lock.stars).toBe(home.stars * 0.7);
        expect(lock.moon).toBe(home.moon);
      }
      if (
        (home.kind === 'scatter' || home.kind === 'shapes') &&
        (lock.kind === 'scatter' || lock.kind === 'shapes')
      )
        expect(lock.density).toBe(home.density * 0.7);
    }
  });

  it('wraps the highest supported seed without generating an invalid lock seed', () => {
    const { recipe, palette } = fixture();
    const rng = createRng(42);
    rng.int = (_low, high): number => high;
    const spec = buildSpec(
      { ...recipe, wallpapers: [{ kind: 'mesh', weight: 1 }], lockWallpaper: 'variant' },
      palette,
      rng,
    );
    expect(spec.wallpaper).toMatchObject({ seed: 2_147_483_647 });
    expect(spec.lockWallpaper).toMatchObject({ seed: 0 });
  });
});
