import { describe, expect, it } from 'vitest';
import { getRecipe } from '@/content/aesthetics';
import { getPalette } from '@/content/palettes';
import { baseNames, slugFor, withSuffix } from '@/lib/render/naming';

function namesFor(recipeId: string, paletteId: string): ReturnType<typeof baseNames> {
  const recipe = getRecipe(recipeId);
  const palette = getPalette(paletteId);
  if (!recipe || !palette) throw new Error('Required naming fixture is missing');
  return baseNames(recipe, palette);
}

describe('generator names and slugs', () => {
  it('uses the documented bilingual naming order', () => {
    expect(namesFor('y2k', 'lavender-haze')).toEqual({
      en: 'Lavender Haze Y2K',
      ar: 'واي تو كي: ضباب اللافندر',
    });
  });

  it('collapses identical normalized Arabic names without collapsing the English formula', () => {
    expect(namesFor('coquette', 'coquette')).toEqual({ en: 'Coquette Ribbon', ar: 'كوكيت' });
    const recipe = getRecipe('coquette');
    const palette = getPalette('coquette');
    if (!recipe || !palette) throw new Error('Required coquette fixture is missing');
    expect(
      baseNames({ ...recipe, nameAr: '  كوكيت  ' }, { ...palette, nameAr: 'كوكيت\n' }).ar,
    ).toBe('كوكيت');
  });

  it.each([
    [1, ''],
    [2, ' II'],
    [3, ' III'],
    [4, ' IV'],
    [9, ' IX'],
    [40, ' XL'],
    [90, ' XC'],
    [400, ' CD'],
    [900, ' CM'],
    [3999, ' MMMCMXCIX'],
  ])('numbers occurrence %i naturally in both languages', (n, suffix) => {
    const base = namesFor('y2k', 'lavender-haze');
    const result = withSuffix(base, n);
    expect(result).toEqual({
      en: `${base.en}${suffix}`,
      ar: `${base.ar}${n === 1 ? '' : ` ${n}`}`,
    });
    expect(result.ar).not.toMatch(/[٠-٩۰-۹]/u);
    expect(base).toEqual(namesFor('y2k', 'lavender-haze'));
  });

  it.each([0, -1, 1.5, NaN, Infinity, 4000])('rejects invalid occurrence %s', (n) => {
    expect(() => withSuffix({ en: 'Name', ar: 'اسم' }, n)).toThrow(RangeError);
  });

  it('normalizes accents, punctuation and whitespace while preserving the caller-supplied suffix', () => {
    expect(slugFor('  Café & Crème brûlée / Y2K? ', '0az9')).toBe('cafe-creme-brulee-y2k-0az9');
    expect(slugFor('Readex__Pro--II', '0001')).toBe('readex-pro-ii-0001');
  });

  it('bounds long slugs without leaving a repeated separator', () => {
    expect(slugFor('a'.repeat(200), 'abcd')).toHaveLength(120);
    expect(slugFor(`${'a'.repeat(114)} ${'b'.repeat(100)}`, 'abcd')).toBe(
      `${'a'.repeat(114)}-abcd`,
    );
  });

  it.each(['', 'abc', 'abcde', 'ABCD', 'ab-c', 'ab c', 'abc\n', 'abcd\n', '💫abc'])(
    'rejects non-base36 or wrong-length suffix %j',
    (suffix) => {
      expect(() => slugFor('Lavender Haze', suffix)).toThrow(RangeError);
    },
  );

  it.each(['', '---', '💫', 'اسم عربي'])(
    'refuses a name with no usable English slug characters %j',
    (name) => {
      expect(() => slugFor(name, 'abcd')).toThrow(RangeError);
    },
  );
});
