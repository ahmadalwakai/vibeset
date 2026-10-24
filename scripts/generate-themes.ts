import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { AESTHETICS, getRecipe } from '../content/aesthetics';
import { getPalette } from '../content/palettes';
import { buildSpec } from '../lib/render/build-spec';
import { baseNames } from '../lib/render/naming';
import { createRng } from '../lib/render/prng';
import { qaSpec } from '../lib/render/qa';

function decimalInteger(min: number, max: number): z.ZodType<number, string> {
  return z
    .string()
    .min(1)
    .max(10)
    .refine((value) => !/[^0-9]/u.test(value), 'Use decimal integer digits')
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
}

const commandSchema = z
  .strictObject({
    aesthetic: z
      .string()
      .regex(/^[a-z0-9-]{2,40}$/)
      .optional(),
    all: z.boolean().default(false),
    count: decimalInteger(1, 24).default(12),
    seed: decimalInteger(0, 2_147_483_647),
    'auto-approve': z.boolean().default(false),
    'dry-run': z.boolean().default(false),
  })
  .refine((value) => value.all !== Boolean(value.aesthetic), 'Choose exactly one selection')
  .refine(
    (value) => !(value['auto-approve'] && value['dry-run']),
    'A dry run cannot approve themes',
  )
  .refine((value) => !value.aesthetic || Boolean(getRecipe(value.aesthetic)), 'Unknown aesthetic');

export type GenerateCommand = z.infer<typeof commandSchema>;

/** The UTC date keeps the default batch seed consistent on different build machines. */
export function parseGenerateArgs(args: readonly string[], now = new Date()): GenerateCommand {
  const { values, tokens } = parseArgs({
    args: [...args],
    strict: true,
    allowPositionals: false,
    tokens: true,
    options: {
      aesthetic: { type: 'string' },
      all: { type: 'boolean' },
      count: { type: 'string' },
      seed: { type: 'string' },
      'auto-approve': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  });
  const seen = new Set<string>();
  for (const token of tokens)
    if (token.kind === 'option') {
      if (seen.has(token.name)) throw new Error('Each option may be supplied only once');
      seen.add(token.name);
    }
  return commandSchema.parse({
    ...values,
    seed: values.seed ?? now.toISOString().slice(0, 10).replaceAll('-', ''),
  });
}

interface AestheticSummary {
  aesthetic: string;
  created: number;
  skippedQa: number;
  skippedDuplicates: number;
  runId?: string;
}

async function dryRun(command: GenerateCommand, signal: AbortSignal): Promise<AestheticSummary[]> {
  // No database/service/env import occurs in this branch, so an offline dry run needs no secrets.
  const [
    { loadGeneratorManifest, renderGeneratorPreview },
    { hamming },
    { loadServerGlyphs },
    { rasterize },
    { renderHomePreview },
    { APPS },
    { default: sharp },
  ] = await Promise.all([
    import('../server/render/generator-preview'),
    import('../server/render/hash'),
    import('../server/render/glyphs'),
    import('../server/render/rasterize'),
    import('../lib/render/preview'),
    import('../content/apps'),
    import('sharp'),
  ]);
  const manifest = await loadGeneratorManifest();
  const glyphs = await loadServerGlyphs();
  const selected = command.all
    ? AESTHETICS
    : AESTHETICS.filter((recipe) => recipe.slug === command.aesthetic);
  const summaries: AestheticSummary[] = [];
  const hashes: string[] = [];
  const gallery: { input: Buffer; left: number; top: number }[] = [];
  for (const recipe of selected) {
    if (signal.aborted) break;
    const directory = path.resolve('.tmp', 'generate', recipe.slug);
    await mkdir(directory, { recursive: true });
    const summary: AestheticSummary = {
      aesthetic: recipe.slug,
      created: 0,
      skippedQa: 0,
      skippedDuplicates: 0,
    };
    const report: {
      candidate: number;
      palette: string;
      nameEn: string;
      nameAr: string;
      previewHash: string;
      file: string;
      spec: ReturnType<typeof buildSpec>;
    }[] = [];
    const failures: { candidate: number; reasons: string[] }[] = [];
    for (let index = 0; index < command.count * 3 && summary.created < command.count; index += 1) {
      if (signal.aborted) break;
      const paletteId = recipe.palettes[index % recipe.palettes.length];
      const palette = paletteId ? getPalette(paletteId) : undefined;
      if (!palette) throw new Error('Missing curated palette');
      const spec = buildSpec(recipe, palette, createRng(command.seed + index));
      const qa = qaSpec(spec, manifest);
      if (!qa.ok) {
        summary.skippedQa += 1;
        failures.push({ candidate: index + 1, reasons: qa.reasons });
        continue;
      }
      const preview = await renderGeneratorPreview(spec);
      if (hashes.some((hash) => hamming(hash, preview.previewHash) <= 6)) {
        summary.skippedDuplicates += 1;
        continue;
      }
      hashes.push(preview.previewHash);
      const file = `${String(summary.created + 1).padStart(2, '0')}-${palette.id}.png`;
      const bytes = await rasterize(renderHomePreview(spec, glyphs, APPS, { w: 360, h: 780 }), {
        w: 360,
        h: 780,
        format: 'png',
      });
      await writeFile(path.join(directory, file), bytes);
      const names = baseNames(recipe, palette);
      report.push({
        candidate: index + 1,
        palette: palette.id,
        nameEn: names.en,
        nameAr: names.ar,
        previewHash: preview.previewHash,
        file,
        spec,
      });
      if (summary.created === 0) {
        const tile = await sharp(bytes).resize(144, 312).png().toBuffer();
        const position = summaries.length;
        gallery.push({
          input: tile,
          left: (position % 8) * 154 + 5,
          top: Math.floor(position / 8) * 344,
        });
      }
      summary.created += 1;
      process.stdout.write(`[${summary.created}/${command.count}] ${recipe.slug}/${file} ✓\n`);
    }
    await writeFile(
      path.join(directory, 'report.json'),
      JSON.stringify({ seed: command.seed, ...summary, failures, themes: report }, null, 2),
    );
    summaries.push(summary);
    if (summary.created === 0 && !signal.aborted) process.exitCode = 1;
  }
  if (gallery.length) {
    const escape = (text: string): string =>
      text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const labels = summaries
      .map(
        (summary, index) =>
          `<text x="${(index % 8) * 154 + 77}" y="${Math.floor(index / 8) * 344 + 330}" text-anchor="middle" font-size="12" fill="white">${escape(summary.aesthetic)}</text>`,
      )
      .join('');
    const height = Math.ceil(summaries.length / 8) * 344;
    gallery.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1232" height="${height}">${labels}</svg>`,
      ),
      left: 0,
      top: 0,
    });
    await sharp({ create: { width: 1232, height, channels: 3, background: '#17151e' } })
      .composite(gallery)
      .png()
      .toFile(path.resolve('.tmp/generate/overview.png'));
  }
  await writeFile(
    path.resolve('.tmp/generate/summary.json'),
    JSON.stringify({ seed: command.seed, summaries }, null, 2),
  );
  return summaries;
}

async function main(): Promise<void> {
  let command: GenerateCommand;
  try {
    command = parseGenerateArgs(process.argv.slice(2));
  } catch {
    process.stderr.write(
      'Usage: themes:generate -- --aesthetic=slug OR --all [--count=12] [--seed=YYYYMMDD] [--dry-run | --auto-approve]\n',
    );
    process.exitCode = 1;
    return;
  }
  const controller = new AbortController();
  const stop = (): void => {
    if (!controller.signal.aborted)
      process.stderr.write('Stopping after the current candidate completes.\n');
    controller.abort();
    process.exitCode = 130;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  let close: (() => Promise<void>) | undefined;
  try {
    let summaries: AestheticSummary[];
    if (command['dry-run']) summaries = await dryRun(command, controller.signal);
    else {
      const [{ generateDrafts }, { pool }] = await Promise.all([
        import('../server/services/theme-generate'),
        import('../db/pool'),
      ]);
      close = () => pool.end();
      summaries = [];
      const selected = command.all
        ? AESTHETICS
        : AESTHETICS.filter((recipe) => recipe.slug === command.aesthetic);
      for (const recipe of selected) {
        if (controller.signal.aborted) break;
        const { data } = await generateDrafts({
          aesthetic: recipe.slug,
          count: command.count,
          seed: command.seed,
          autoApprove: command['auto-approve'],
          actor: { kind: 'system', label: 'cli' },
          signal: controller.signal,
        });
        summaries.push({ aesthetic: recipe.slug, ...data });
        process.stdout.write(
          `${recipe.slug}: created ${data.created}, QA ${data.skippedQa}, duplicates ${data.skippedDuplicates}\n`,
        );
      }
    }
    process.stdout.write('Aesthetic                Created  QA skips  Duplicate skips\n');
    for (const row of summaries)
      process.stdout.write(
        `${row.aesthetic.padEnd(25)}${String(row.created).padStart(7)}${String(row.skippedQa).padStart(10)}${String(row.skippedDuplicates).padStart(17)}\n`,
      );
  } catch {
    process.stderr.write(
      'Generation failed. Check the curated content and database configuration; rerun with the same seed to resume.\n',
    );
    if (!controller.signal.aborted) process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    if (close)
      await close().catch(() => {
        if (!controller.signal.aborted) process.exitCode = 1;
      });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
