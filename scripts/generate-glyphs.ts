import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { icons } from '@phosphor-icons/core';
import { APPS } from '../content/apps';
import { GLYPH_WEIGHTS } from '../lib/render/spec';
import { parseGlyphRecord } from '../lib/render/glyphs';
import { isGenericGlyph, sanitizeGlyphSvg } from './glyph-utils';

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

async function referencedGlyphs(projectRoot: string): Promise<string[]> {
  const names: string[] = APPS.map((app) => app.glyph);
  const aestheticsPath = path.join(projectRoot, 'content/aesthetics.ts');
  try {
    await access(aestheticsPath);
  } catch {
    return names;
  }
  const aestheticsModule: unknown = await import(pathToFileURL(aestheticsPath).href);
  if (!aestheticsModule || typeof aestheticsModule !== 'object')
    throw new Error('Invalid aesthetics module');
  const recipes = Object.values(aestheticsModule).find(isUnknownArray);
  if (!recipes) throw new Error('Aesthetics must export a recipe array');
  for (const recipe of recipes) {
    if (
      !recipe ||
      typeof recipe !== 'object' ||
      !('decor' in recipe) ||
      !isUnknownArray(recipe.decor)
    ) {
      throw new Error('Aesthetic recipe must contain decor glyphs');
    }
    for (const glyph of recipe.decor) {
      if (typeof glyph !== 'string') throw new Error('Invalid aesthetic decor glyph');
      names.push(glyph);
    }
  }
  return names;
}

export async function generateGlyphs(projectRoot = process.cwd()): Promise<number> {
  const packageRoot = path.resolve(
    fileURLToPath(import.meta.resolve('@phosphor-icons/core')),
    '../..',
  );
  const generic = icons
    .filter(isGenericGlyph)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const available = new Set<string>(generic.map((icon) => icon.name));
  const missing = [...new Set(await referencedGlyphs(projectRoot))].filter(
    (name) => !available.has(name),
  );
  if (missing.length) throw new Error(`Missing or excluded glyphs: ${missing.sort().join(', ')}`);
  const output = path.join(projectRoot, 'public/glyphs/v1');
  await mkdir(output, { recursive: true });
  for (const weight of GLYPH_WEIGHTS) {
    const folder = path.join(packageRoot, 'assets', weight);
    const filenames = new Set(await readdir(folder));
    const sample = generic[0]?.name;
    if (!sample) throw new Error('No generic glyph metadata found');
    const suffix = filenames.has(`${sample}.svg`) ? '' : `-${weight}`;
    if (!filenames.has(`${sample}${suffix}.svg`))
      throw new Error(`Cannot detect ${weight} SVG naming`);
    process.stdout.write(`Glyph pattern: assets/${weight}/{name}${suffix}.svg` + '\n');
    const glyphs: Record<string, string> = {};
    for (const { name } of generic) {
      const filename = `${name}${suffix}.svg`;
      if (!filenames.has(filename)) throw new Error(`Missing SVG asset: ${weight}/${filename}`);
      glyphs[name] = sanitizeGlyphSvg(await readFile(path.join(folder, filename), 'utf8'));
    }
    parseGlyphRecord(glyphs);
    await writeFile(path.join(output, `${weight}.json`), `${JSON.stringify(glyphs)}\n`);
  }
  const manifest = generic.map(({ name, categories, tags }) => ({ name, categories, tags }));
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  await copyFile(path.join(packageRoot, 'LICENSE'), path.join(output, '../LICENSE.txt'));
  return generic.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  generateGlyphs()
    .then((count) =>
      process.stdout.write(`Generated ${count} generic glyphs in all six weights` + '\n'),
    )
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : 'Glyph generation failed');
      process.exitCode = 1;
    });
}
