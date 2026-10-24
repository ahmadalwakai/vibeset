import type { AestheticRecipe, CuratedPalette, ThemeNames } from '../generator';

function normalizedName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export function baseNames(recipe: AestheticRecipe, palette: CuratedPalette): ThemeNames {
  const recipeAr = normalizedName(recipe.nameAr);
  const paletteAr = normalizedName(palette.nameAr);
  return {
    en: `${normalizedName(palette.nameEn)} ${normalizedName(recipe.shortEn)}`,
    ar: recipeAr === paletteAr ? recipeAr : `${recipeAr}: ${paletteAr}`,
  };
}

function roman(value: number): string {
  const parts = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ] as const;
  let remaining = value;
  let result = '';
  for (const [amount, symbol] of parts) {
    const count = Math.floor(remaining / amount);
    result += symbol.repeat(count);
    remaining %= amount;
  }
  return result;
}

export function withSuffix(names: ThemeNames, n: number): ThemeNames {
  if (!Number.isSafeInteger(n) || n < 1 || n > 3999) {
    throw new RangeError('Name occurrence must be an integer from 1 to 3999');
  }
  if (n === 1) return { ...names };
  return { en: `${names.en} ${roman(n)}`, ar: `${names.ar} ${n}` };
}

export function slugFor(nameEn: string, randomSuffix: string): string {
  if (randomSuffix.length !== 4 || !/^[a-z0-9]{4}$/u.test(randomSuffix)) {
    throw new RangeError('Slug suffix must contain four lowercase base36 characters');
  }
  const base = nameEn
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  if (!base) throw new RangeError('English name must contain an ASCII letter or digit');
  // Theme slugs are limited to 120 characters, including the separator and suffix.
  return `${base.slice(0, 115).replace(/-+$/u, '')}-${randomSuffix}`;
}
