import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, specHash } from '@/lib/render/hash';
import { themeSpecSchema } from '@/lib/render/spec';

const spec = themeSpecSchema.parse({
  v: 1,
  palette: {
    mode: 'light',
    bg: '#faf8fc',
    surface: '#ffffff',
    primary: '#9734b1',
    accent: '#ff8b58',
    ink: '#16121d',
    inkMuted: '#665c76',
  },
  wallpaper: { kind: 'mesh', seed: 42, points: 5, softness: 0.5, grain: 0.08, colors: null },
  lockWallpaper: null,
  icons: {
    shape: 'squircle',
    fill: 'solid',
    bg: '#9734b1',
    bg2: null,
    glyphColor: '#ffffff',
    glyphWeight: 'regular',
    glyphScale: 0.55,
    border: null,
    sticker: null,
    shadow: false,
  },
  widgets: { style: 'glass', radius: 0.25, surface: '#ffffff', ink: '#16121d', accent: '#ff8b58' },
  type: { display: 'fraunces', body: 'readex-pro' },
  decor: ['sparkle', 'heart'],
});

describe('canonicalJson', () => {
  it('sorts object keys recursively, including objects inside arrays', () => {
    const value = { z: { b: 2, a: 1 }, a: [{ y: false, x: null }, 'line\n"quote"'] };
    expect(canonicalJson(value)).toBe(
      '{"a":[{"x":null,"y":false},"line\\n\\"quote\\""],"z":{"a":1,"b":2}}',
    );
  });

  it('sorts numeric-looking keys lexically without mutating inputs', () => {
    const value = Object.freeze({ '2': 'two', '10': 'ten', '1': 'one' });
    expect(canonicalJson(value)).toBe('{"1":"one","10":"ten","2":"two"}');
  });

  it('preserves array order and permits repeated non-cyclic objects', () => {
    const shared = { b: 2, a: 1 };
    expect(canonicalJson([shared, shared, null])).toBe('[{"a":1,"b":2},{"a":1,"b":2},null]');
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, BigInt(1), () => 1, Symbol('value')])(
    'rejects unsupported or lossy JSON input %s',
    (value) => expect(() => canonicalJson(value)).toThrow(TypeError),
  );

  it('rejects undefined values in objects and sparse arrays', () => {
    expect(() => canonicalJson({ omitted: undefined })).toThrow(TypeError);
    expect(() => canonicalJson(new Array(2))).toThrow(TypeError);
  });

  it('rejects circular references and custom object serialization', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => canonicalJson(circular)).toThrow('circular references');
    expect(() => canonicalJson(new Map([['a', 1]]))).toThrow('plain objects');
  });
});

describe('specHash', () => {
  it('returns the SHA-256 of canonical spec JSON as lowercase hex', async () => {
    const expected = createHash('sha256').update(canonicalJson(spec)).digest('hex');
    expect(await specHash(spec)).toBe(expected);
    expect(await specHash(spec)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores top-level and nested object insertion order', async () => {
    const reordered = {
      ...Object.fromEntries(Object.entries(spec).reverse()),
      palette: Object.fromEntries(Object.entries(spec.palette).reverse()),
      icons: Object.fromEntries(Object.entries(spec.icons).reverse()),
    };
    const reorderedSpec = themeSpecSchema.parse(reordered);
    // Rebuild after validation so the schema's field order cannot mask a sorting failure.
    const { ink, ...paletteWithoutInk } = reorderedSpec.palette;
    const reorderedValidated = {
      decor: reorderedSpec.decor,
      type: { body: reorderedSpec.type.body, display: reorderedSpec.type.display },
      widgets: reorderedSpec.widgets,
      icons: { ...reorderedSpec.icons, bg: reorderedSpec.icons.bg },
      lockWallpaper: reorderedSpec.lockWallpaper,
      wallpaper: reorderedSpec.wallpaper,
      palette: { ink, ...paletteWithoutInk },
      v: reorderedSpec.v,
    };
    expect(Object.keys(reorderedValidated)).not.toEqual(Object.keys(spec));
    expect(Object.keys(reorderedValidated.palette)).not.toEqual(Object.keys(spec.palette));
    expect(await specHash(reorderedValidated)).toBe(await specHash(spec));
  });

  it('changes when a spec value or ordered decoration list changes', async () => {
    const changed = { ...spec, decor: [...spec.decor].reverse() };
    expect(await specHash(changed)).not.toBe(await specHash(spec));
  });
});
