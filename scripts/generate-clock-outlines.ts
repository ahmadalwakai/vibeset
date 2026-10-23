import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { FONT_IDS } from '../content/fonts';
import type { ClockOutline } from '../lib/catalog';
import type { FontId } from '../lib/render/types';

export const CLOCK_TIMES = ['10:24', '9:41'] as const;
type ClockTime = (typeof CLOCK_TIMES)[number];
type ClockOutlines = Record<FontId, Record<ClockTime, ClockOutline>>;

function fmt(value: number): string {
  return Number(value.toFixed(6)).toString();
}

/** Resolve only fixed clock literals through the committed font; browsers receive paths. */
export async function createClockOutline(
  fontId: FontId,
  time: ClockTime,
  projectRoot = process.cwd(),
): Promise<ClockOutline> {
  const metadata = FONT_IDS[fontId];
  const fontFile = path.join(projectRoot, 'assets/fonts', metadata.folder, metadata.ttfFileName);
  await access(fontFile);
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="500" viewBox="0 0 1600 500"><text x="50" y="350" font-family="${metadata.displayName}" font-size="256" font-weight="600">${time}</text></svg>`;
  const resvg = new Resvg(source, {
    font: {
      fontFiles: [fontFile],
      loadSystemFonts: false,
      defaultFontFamily: metadata.displayName,
    },
  });
  const resolved = resvg.toString();
  // getBBox preserves fractional path bounds; innerBBox rounds to whole pixel bounds.
  const bbox = resvg.getBBox();
  if (
    !bbox ||
    ![bbox.x, bbox.y, bbox.width, bbox.height].every(Number.isFinite) ||
    bbox.width <= 0 ||
    bbox.height <= 0
  ) {
    throw new Error(`Font produced no clock bounds: ${fontId}`);
  }
  if (
    /<(?:text|tspan|image|use|script|foreignObject|style)\b|(?:href|url\s*\()/i.test(resolved) ||
    !/<path\b[^>]*\bd="[^"]+"/.test(resolved)
  ) {
    throw new Error(`Font did not resolve to safe clock paths: ${fontId}`);
  }
  const inner = /^<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/.exec(resolved)?.[1];
  if (!inner) throw new Error(`Unexpected resvg clock output: ${fontId}`);
  const paths = inner
    .replace(/<defs\s*\/>/g, '')
    .replace(/\bfill="(?:#000000|black)"/g, 'fill="currentColor"')
    .replace(/>\s+</g, '><')
    .trim();
  if (/\bfill="(?!currentColor"|none")[^"]+"/.test(paths))
    throw new Error(`Unexpected clock paint: ${fontId}`);
  const width = Number(bbox.width.toFixed(6));
  const height = Number(bbox.height.toFixed(6));
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}"><g transform="translate(${fmt(-bbox.x)} ${fmt(-bbox.y)})">${paths}</g></svg>`,
    width,
    height,
  };
}

export async function generateClockOutlines(projectRoot = process.cwd()): Promise<ClockOutlines> {
  const result = {} as ClockOutlines;
  for (const fontId of Object.keys(FONT_IDS) as FontId[]) {
    result[fontId] = {
      '10:24': await createClockOutline(fontId, '10:24', projectRoot),
      '9:41': await createClockOutline(fontId, '9:41', projectRoot),
    };
  }
  await mkdir(path.join(projectRoot, 'content'), { recursive: true });
  await writeFile(
    path.join(projectRoot, 'content/clock-outlines.json'),
    `${JSON.stringify(result)}\n`,
  );
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  generateClockOutlines()
    .then(() => process.stdout.write('Generated fixed clock paths for all six fonts\n'))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : 'Clock outline generation failed');
      process.exitCode = 1;
    });
}
