import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AESTHETICS, getRecipe } from '@/content/aesthetics';
import { PALETTES, getPalette } from '@/content/palettes';
import {
  getSeason,
  getTaxonomyTag,
  MOODS,
  SEASONS,
  seasonTagSlug,
  STYLES,
  TAXONOMY,
} from '@/content/taxonomy';
import { MOOD_IDS, SEASON_IDS, STYLE_IDS } from '@/lib/generator';
import { deltaE } from '@/lib/render/color';
import { baseNames } from '@/lib/render/naming';
import { FONT_IDS, GLYPH_WEIGHTS } from '@/lib/render/spec';

const pipeline = readFileSync(
  new URL('../../../docs/05-content-pipeline.md', import.meta.url),
  'utf8',
);
const manifestNames = new Set(
  z
    .array(z.object({ name: z.string() }))
    .parse(
      JSON.parse(
        readFileSync(new URL('../../../public/glyphs/v1/manifest.json', import.meta.url), 'utf8'),
      ),
    )
    .map((glyph) => glyph.name),
);

function tableRows(section: string, end: string): string[][] {
  const content = pipeline.split(section)[1]?.split(end)[0];
  if (!content) throw new Error('Required content documentation section is missing');
  return content
    .split('\n')
    .filter((line) => /^\|\s+[a-z][a-z0-9-]*\s+\|/u.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((value) => value.trim()),
    );
}

describe('curated generator content', () => {
  it('copies all 45 documented palette roles and preserves both QA separation thresholds', () => {
    const rows = tableRows('## 1. Palettes', '## 2. Aesthetics').filter((row) => row[0] !== 'id');
    expect(PALETTES).toHaveLength(45);
    expect(new Set(PALETTES.map((palette) => palette.id)).size).toBe(45);
    expect(PALETTES.map((palette) => Object.values(palette))).toEqual(rows);
    for (const palette of PALETTES) {
      expect(getPalette(palette.id)).toBe(palette);
      for (const color of [
        palette.bg,
        palette.surface,
        palette.primary,
        palette.accent,
        palette.ink,
      ]) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/u);
      }
      expect(deltaE(palette.bg, palette.primary), palette.id).toBeGreaterThanOrEqual(0.08);
      expect(deltaE(palette.primary, palette.accent), palette.id).toBeGreaterThanOrEqual(0.06);
    }
    expect(getPalette('rose-gold')?.accent).toBe('#c8a27d');
    expect(getPalette('missing')).toBeUndefined();
    expect(getPalette('__proto__')).toBeUndefined();
  });

  it('preserves all 40 recipe identities and their documented palettes, fills, glyphs and fonts', () => {
    const rows = tableRows('## 2. Aesthetics', '## 3. Wallpaper').filter(
      (row) => row[0] !== 'slug',
    );
    expect(AESTHETICS).toHaveLength(40);
    expect(new Set(AESTHETICS.map((recipe) => recipe.slug)).size).toBe(40);
    expect(AESTHETICS.map((recipe) => recipe.slug)).toEqual(rows.map((row) => row[0]));
    expect(AESTHETICS.reduce((count, recipe) => count + recipe.palettes.length, 0)).toBe(138);
    for (const [index, recipe] of AESTHETICS.entries()) {
      const row = rows[index];
      if (!row) throw new Error(`Missing documented recipe ${recipe.slug}`);
      expect(`${recipe.nameEn} / ${recipe.nameAr}`).toBe(row[1]);
      expect(recipe.palettes.join(', ')).toBe(row[2]);
      const wallpaperChoices = (row[3] ?? '').split(', ');
      expect(recipe.wallpapers).toHaveLength(wallpaperChoices.length);
      for (const [choiceIndex, choice] of recipe.wallpapers.entries()) {
        const documentedChoice = /^(\w+)(?::([a-z0-9-]+)| \((day|sunset|night)\))? (\d+)$/u.exec(
          wallpaperChoices[choiceIndex] ?? '',
        );
        expect(choice.kind).toBe(documentedChoice?.[1]);
        expect(choice.weight).toBe(Number(documentedChoice?.[4]));
        if (choice.kind === 'pattern') expect(choice.params.pattern).toBe(documentedChoice?.[2]);
        if (choice.kind === 'sky' && documentedChoice?.[3]) {
          expect(choice.params.mode).toBe(documentedChoice[3]);
        }
      }
      const [fills, weights] = (row[4] ?? '').split(' · ');
      expect(recipe.icons.fills.join(', ')).toBe(fills);
      expect(recipe.icons.weights.join(', ')).toBe(weights?.replace(' (stickers 40%)', ''));
      expect(recipe.decor.length ? recipe.decor.join(', ') : '—').toBe(row[5]);
      expect(recipe.fonts.display.join(', ')).toBe(row[6]);
      expect(`${recipe.moods.join(', ')}${'season' in recipe ? ` · ${recipe.season}` : ''}`).toBe(
        row[7],
      );
      expect(recipe.fonts.body).toEqual(['readex-pro']);
      expect(recipe.variants).toBe(10);
      expect(getRecipe(recipe.slug)).toBe(recipe);
      for (const id of recipe.palettes)
        expect(getPalette(id), `${recipe.slug}/${id}`).toBeDefined();
      for (const glyph of recipe.decor) expect(manifestNames.has(glyph), glyph).toBe(true);
      for (const font of recipe.fonts.display) expect(FONT_IDS).toContain(font);
      for (const weight of recipe.icons.weights) expect(GLYPH_WEIGHTS).toContain(weight);
      for (const mood of recipe.moods) expect(MOOD_IDS).toContain(mood);
      for (const paletteId of recipe.palettes) {
        const palette = getPalette(paletteId);
        if (!palette) throw new Error(`Missing palette ${paletteId}`);
        const names = baseNames(recipe, palette);
        expect(names.en.length).toBeLessThanOrEqual(60);
        expect(names.ar.length).toBeLessThanOrEqual(60);
      }
    }
    expect(getRecipe('missing')).toBeUndefined();
    expect(getRecipe('constructor')).toBeUndefined();
    expect(getRecipe('kawaii')?.icons.stickerChance).toBe(0.4);
  });

  it('provides distinct two-sentence descriptions in native English and Arabic', () => {
    expect(new Set(AESTHETICS.map((recipe) => recipe.descriptionEn)).size).toBe(40);
    expect(new Set(AESTHETICS.map((recipe) => recipe.descriptionAr)).size).toBe(40);
    for (const recipe of AESTHETICS) {
      expect(
        recipe.descriptionEn.split(/[.!?]+/u).filter((sentence) => sentence.trim()),
      ).toHaveLength(2);
      expect(
        recipe.descriptionAr.split(/[.!؟]+/u).filter((sentence) => sentence.trim()),
      ).toHaveLength(2);
      expect(recipe.descriptionEn.length).toBeGreaterThan(80);
      expect(recipe.descriptionAr.length).toBeGreaterThan(80);
      expect(recipe.descriptionAr).toMatch(/\p{Script=Arabic}/u);
    }
  });

  it('keeps taxonomy storage slugs unique and maps unprefixed season ids safely', () => {
    expect(TAXONOMY).toHaveLength(72);
    expect(new Set(TAXONOMY.map((tag) => tag.slug)).size).toBe(72);
    expect(MOODS.map((tag) => tag.id)).toEqual(MOOD_IDS);
    expect(SEASONS.map((tag) => tag.id)).toEqual(SEASON_IDS);
    expect(STYLES.map((tag) => tag.id)).toEqual(STYLE_IDS);
    for (const tag of TAXONOMY) {
      expect(tag.slug).toMatch(/^[a-z0-9-]{2,40}$/u);
      expect(getTaxonomyTag(tag.slug)).toBe(tag);
      expect(tag.nameAr).toMatch(/\p{Script=Arabic}/u);
    }
    for (const season of SEASONS) {
      expect(season.slug).toBe(seasonTagSlug(season.id));
      expect(getSeason(season.id)).toBe(season);
      expect(getSeason(season.slug)).toBeUndefined();
    }
    expect(getTaxonomyTag('halloween')?.kind).toBe('aesthetic');
    expect(getTaxonomyTag('season-halloween')?.kind).toBe('season');
    expect(getTaxonomyTag('valentine')?.kind).toBe('aesthetic');
    expect(getTaxonomyTag('season-valentine')?.kind).toBe('season');
    expect(getTaxonomyTag('__proto__')).toBeUndefined();
    for (const [index, recipe] of AESTHETICS.entries()) {
      expect(getTaxonomyTag(recipe.slug)).toMatchObject({
        kind: 'aesthetic',
        sortOrder: index,
        descriptionEn: recipe.descriptionEn,
        descriptionAr: recipe.descriptionAr,
      });
      if ('season' in recipe) expect(getSeason(recipe.season)).toBeDefined();
    }
  });
});
