import { formatHex } from 'culori';
import { describe, expect, it } from 'vitest';
import {
  colorFamilyOf,
  contrast,
  deltaE,
  ensureContrast,
  mixOklab,
  toOklch,
  withAlpha,
} from '../../../lib/render/color';

describe('renderer colour science', () => {
  it('calculates known WCAG contrasts and perceptual distances', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 8);
    expect(contrast('#ff0000', '#ffffff')).toBeCloseTo(3.99848, 4);
    expect(deltaE('#123456', '#123456')).toBe(0);
    expect(deltaE('#123456', '#abcdef')).toBeCloseTo(deltaE('#abcdef', '#123456'), 12);
    expect(toOklch('#ffffff').l).toBeCloseTo(1, 6);
  });
  it('mixes in OKLab with bounded endpoints and encoded alpha', () => {
    expect(mixOklab('#000000', '#ffffff', -1)).toBe('#000000');
    expect(mixOklab('#000000', '#ffffff', 2)).toBe('#ffffff');
    expect(mixOklab('#000000', '#ffffff', 0.5)).toBe('#636363');
    expect(withAlpha('#123456', 0.25)).toBe('rgba(18,52,86,0.25)');
    expect(withAlpha('#123456', 5)).toBe('rgba(18,52,86,1)');
    expect(withAlpha('#123456', NaN)).toBe('rgba(18,52,86,0)');
    expect(() => toOklch('invalid')).toThrow(TypeError);
  });
  it.each([
    ['#b9a3e8', '#fbf8ff', 4.5],
    ['#5f6080', '#14101f', 4.5],
    ['#ff8b58', '#ffffff', 3],
  ] as const)('adjusts lightness until %s on %s reaches %s contrast', (fg, bg, minimum) => {
    const adjusted = ensureContrast(fg, bg, minimum);
    expect(contrast(adjusted, bg)).toBeGreaterThanOrEqual(minimum);
    expect(ensureContrast(adjusted, bg, minimum)).toBe(adjusted);
  });
  it.each([
    [10, 'red'],
    [38, 'orange'],
    [80, 'yellow'],
    [130, 'green'],
    [180, 'teal'],
    [230, 'blue'],
    [280, 'purple'],
    [325, 'pink'],
  ] as const)('uses the documented chromatic hue bucket at %s degrees', (h, family) => {
    expect(colorFamilyOf(formatHex({ mode: 'oklch', l: 0.7, c: 0.08, h }))).toBe(family);
  });
  it('handles neutral and brown families before hue buckets', () => {
    expect(colorFamilyOf('#000000')).toBe('black');
    expect(colorFamilyOf('#ffffff')).toBe('white');
    expect(colorFamilyOf('#777777')).toBe('gray');
    expect(colorFamilyOf('#664422')).toBe('brown');
  });
});
