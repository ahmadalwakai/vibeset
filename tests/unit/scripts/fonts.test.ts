import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { FONT_IDS } from '@/content/fonts';
import { FONT_IDS as REQUIRED_FONT_IDS } from '@/lib/render/spec';
import { parseFontListing, validateFontFile } from '@/scripts/fetch-fonts';
import { createClockOutline } from '@/scripts/generate-clock-outlines';
import clockOutlines from '@/content/clock-outlines.json';

function listing(name = 'Example.ttf', url?: string): unknown {
  return [
    {
      type: 'file',
      name,
      size: 4,
      download_url:
        url ?? `https://raw.githubusercontent.com/google/fonts/main/ofl/example/${name}`,
    },
    {
      type: 'file',
      name: 'OFL.txt',
      size: 100,
      download_url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/example/OFL.txt',
    },
    { type: 'dir', name: 'upstream' },
  ];
}

describe('official font download boundaries', () => {
  it('selects only TTFs and the license from the exact official source path', () => {
    expect(parseFontListing(listing(), 'example').map((file) => file.name)).toEqual([
      'Example.ttf',
      'OFL.txt',
    ]);
  });

  it.each([
    'http://raw.githubusercontent.com/google/fonts/main/ofl/example/Example.ttf',
    'https://example.com/Example.ttf',
    'https://raw.githubusercontent.com/attacker/fonts/main/ofl/example/Example.ttf',
    'https://raw.githubusercontent.com/google/fonts/main/ofl/other/Example.ttf',
    'https://raw.githubusercontent.com/google/fonts/main/ofl/example/Example.ttf?extra=1',
  ])('rejects download URLs outside the official family: %s', (url) => {
    expect(() => parseFontListing(listing('Example.ttf', url), 'example')).toThrow();
  });

  it('rejects traversal filenames, incomplete listings and oversized assets', () => {
    expect(() => parseFontListing(listing('../Example.ttf'), 'example')).toThrow();
    expect(() => parseFontListing([], 'example')).toThrow();
    expect(() => parseFontListing(listing(), '../example')).toThrow();
    expect(() =>
      parseFontListing(
        [
          {
            type: 'file',
            name: 'Example.ttf',
            size: 20_000_000,
            download_url: 'https://example.com',
          },
        ],
        'example',
      ),
    ).toThrow();
  });

  it('rejects truncated downloads, HTML posing as a font, and missing license text', () => {
    expect(() => validateFontFile('Example.ttf', new Uint8Array([0, 1, 0, 0]), 4)).not.toThrow();
    expect(() => validateFontFile('Example.ttf', new Uint8Array([0, 1, 0, 0]), 5)).toThrow();
    expect(() => validateFontFile('Example.ttf', new TextEncoder().encode('<html>'), 6)).toThrow();
    expect(() => validateFontFile('OFL.txt', new TextEncoder().encode('missing'), 7)).toThrow();
  });
});

describe('committed renderer font and clock assets', () => {
  it('covers the spec font IDs with actual TrueType fonts and OFL licenses', async () => {
    expect(Object.keys(FONT_IDS).sort()).toEqual([...REQUIRED_FONT_IDS].sort());
    for (const metadata of Object.values(FONT_IDS)) {
      for (const name of [metadata.ttfFileName, 'OFL.txt']) {
        const bytes = await readFile(path.join('assets/fonts', metadata.folder, name));
        expect(() => validateFontFile(name, bytes, bytes.byteLength)).not.toThrow();
      }
    }
  });

  it('contains two normalized path-only clocks per font with inheritable color', () => {
    expect(Object.keys(clockOutlines).sort()).toEqual([...REQUIRED_FONT_IDS].sort());
    for (const id of REQUIRED_FONT_IDS) {
      expect(Object.keys(clockOutlines[id]).sort()).toEqual(['10:24', '9:41']);
      for (const outline of Object.values(clockOutlines[id])) {
        expect(outline.width).toBeGreaterThan(0);
        expect(outline.height).toBeGreaterThan(0);
        expect(outline.svg).toContain(`viewBox="0 0 ${outline.width} ${outline.height}"`);
        expect(outline.svg).toContain('<path');
        expect(outline.svg).toContain('fill="currentColor"');
        expect(outline.svg).not.toMatch(
          /<(?:text|tspan|style|script|image|use)\b|href=|font-family=|url\(/i,
        );
        const bounds = new Resvg(outline.svg, { font: { loadSystemFonts: false } }).getBBox();
        expect(bounds).toBeDefined();
        expect(bounds?.x).toBeCloseTo(0, 3);
        expect(bounds?.y).toBeCloseTo(0, 3);
        expect(bounds?.width).toBeCloseTo(outline.width, 3);
        expect(bounds?.height).toBeCloseTo(outline.height, 3);
      }
    }
  });

  it('regenerates byte-identical clock geometry from the same committed font', async () => {
    expect(await createClockOutline('readex-pro', '10:24')).toEqual(
      clockOutlines['readex-pro']['10:24'],
    );
    expect(await createClockOutline('pacifico', '9:41')).toEqual(clockOutlines.pacifico['9:41']);
  });
});
