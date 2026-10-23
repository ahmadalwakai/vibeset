import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { APPS } from '@/content/apps';
import { GLYPH_WEIGHTS } from '@/lib/render/spec';
import { parseGlyphRecord } from '@/lib/render/glyphs';
import { isGenericGlyph, sanitizeGlyphSvg } from '@/scripts/glyph-utils';

const wrap = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor">${inner}</svg>`;

describe('glyph asset sanitization', () => {
  it('preserves approved shape geometry, grouping, opacity, and transforms', () => {
    const shape =
      '<g transform="translate(2 3) rotate(5)"><path d="M0 0L10 10Z" opacity="0.2" fill-rule="evenodd"/><circle cx="12" cy="12" r="4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"/></g>';
    expect(sanitizeGlyphSvg(wrap(shape))).toBe(shape);
    expect(parseGlyphRecord({ test: sanitizeGlyphSvg(wrap(shape)) }).test).toBe(shape);
  });

  it('normalizes literal color paints and preserves none', () => {
    expect(sanitizeGlyphSvg(wrap('<path d="M0 0" fill="#aabbcc" stroke="red"/>'))).toBe(
      '<path d="M0 0" fill="currentColor" stroke="currentColor"/>',
    );
    expect(sanitizeGlyphSvg('<svg viewBox="0 0 256 256" fill="none"><path d="M0 0"/></svg>')).toBe(
      '<g fill="none"><path d="M0 0"/></g>',
    );
  });

  it.each(['script', 'foreignObject', 'text', 'image', 'style', 'use', 'animate'])(
    'rejects active or unsupported <%s> elements',
    (name) => {
      expect(() => sanitizeGlyphSvg(wrap(`<${name}/>`))).toThrow();
    },
  );

  it.each([
    '<path d="M0 0" onload="alert(1)"/>',
    '<path d="M0 0" href="https://example.com/icon.svg"/>',
    '<path d="M0 0" style="fill:red"/>',
    '<path d="M0 0" fill="url(#paint)"/>',
    '<path d="M0 0" transform="javascript:alert(1)"/>',
    '<path d="M0 0" d="M1 1"/>',
    '<g><path d="M0 0"/></path>',
    '<path d=M0/>',
    '<path d="M0 0 &amp; x"/>',
  ])('rejects unsafe or malformed markup: %s', (markup) => {
    expect(() => sanitizeGlyphSvg(wrap(markup))).toThrow();
  });

  it('rejects entities, multiple roots, unsupported viewBoxes and trailing free text', () => {
    for (const source of [
      `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]>${wrap('<path d="M0 0"/>')}`,
      `${wrap('<path d="M0 0"/>')}${wrap('<path d="M0 0"/>')}`,
      '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>',
      `${wrap('<path d="M0 0"/>')} trailing text`,
    ])
      expect(() => sanitizeGlyphSvg(source)).toThrow();
  });

  it('excludes uncategorized logos as well as categorized brands', () => {
    expect(isGenericGlyph({ name: 'pix-logo', categories: ['commerce'] })).toBe(false);
    expect(isGenericGlyph({ name: 'apple-podcasts-logo', categories: ['brands'] })).toBe(false);
    expect(isGenericGlyph({ name: 'sparkle', categories: ['nature'] })).toBe(true);
  });
});

describe('generated catalog assets', () => {
  it('contains the 125 ranked apps with useful aliases and the approved generic Minecraft glyph', () => {
    expect(APPS).toHaveLength(125);
    expect(new Set(APPS.map((app) => app.slug)).size).toBe(125);
    expect(APPS.map((app) => app.rank)).toEqual(
      Array.from({ length: 125 }, (_, index) => index + 1),
    );
    for (const app of APPS) {
      expect(app.aliases.length).toBeGreaterThanOrEqual(1);
      expect(app.aliases.length).toBeLessThanOrEqual(3);
      expect(app.aliases.some((alias) => /[\u0600-\u06ff]/.test(alias))).toBe(true);
    }
    expect(APPS.find((app) => app.slug === 'minecraft')?.glyph).toBe('hammer');
  });

  it('has a generic-only manifest and complete safe glyph records for every weight', async () => {
    const manifest = z
      .array(
        z.object({ name: z.string(), categories: z.array(z.string()), tags: z.array(z.string()) }),
      )
      .parse(JSON.parse(await readFile('public/glyphs/v1/manifest.json', 'utf8')));
    expect(manifest).toHaveLength(1432);
    for (const entry of manifest) {
      expect(entry.name).not.toContain('-logo');
      expect(entry.categories).not.toContain('brands');
    }
    const names = manifest.map((entry) => entry.name).sort();
    for (const weight of GLYPH_WEIGHTS) {
      const record = parseGlyphRecord(
        JSON.parse(await readFile(`public/glyphs/v1/${weight}.json`, 'utf8')),
      );
      expect(Object.keys(record).sort()).toEqual(names);
      for (const app of APPS) expect(record[app.glyph]).toBeTruthy();
    }
  });
});
