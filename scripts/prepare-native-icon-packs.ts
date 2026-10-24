import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { APPS } from '../content/apps';
import { NATIVE_BETA_ORIGINALS } from '../content/native-beta';
import { specHash } from '../lib/render/hash';
import { nativeIconPackSchema, type NativeIconPack } from '../lib/validation/native-icon-pack';
import { renderNativeIconPack } from '../server/render/native-icon-pack';
import { validateNativeBetaPlan, writeNativeBetaAsset } from './prepare-native-beta';

export async function prepareNativeIconPacks(): Promise<NativeIconPack[]> {
  const plan = validateNativeBetaPlan(
    JSON.parse(await readFile('content/native-beta/publication-plan.json', 'utf8')),
  );
  const packs: NativeIconPack[] = [];
  for (const entry of plan.publications) {
    const original = NATIVE_BETA_ORIGINALS.find(({ slug }) => slug === entry.slug);
    if (!original || (await specHash(original.spec)) !== entry.specHash)
      throw new Error('Native pack original differs from its reviewed publication');
    const icons = await renderNativeIconPack({
      spec: original.spec,
      apps: APPS.map((app) => ({ ...app, aliases: [...app.aliases] })),
    });
    const assets = [];
    for (const icon of icons) {
      const key = `theme-packs/v1/${entry.specHash}/${icon.app.slug}-${icon.sha256}.png`;
      await writeNativeBetaAsset('public', key, icon.body);
      assets.push({
        appSlug: icon.app.slug,
        name: icon.app.name,
        aliases: icon.app.aliases,
        category: icon.app.category,
        rank: icon.app.rank,
        url: new URL(`/${key}`, plan.origin).href,
        bytes: icon.body.byteLength,
        w: 512,
        h: 512,
        sha256: icon.sha256,
      });
    }
    packs.push(
      nativeIconPackSchema.parse({
        version: 1,
        themeId: entry.themeId,
        slug: entry.slug,
        specHash: entry.specHash,
        icons: assets,
      }),
    );
    process.stdout.write(
      `${JSON.stringify({ slug: entry.slug, icons: icons.length, bytes: icons.reduce((sum, icon) => sum + icon.body.byteLength, 0) })}\n`,
    );
  }
  const manifest = z.array(nativeIconPackSchema).length(3).parse(packs);
  await writeNativeBetaAsset(
    'content/native-beta',
    'icon-packs.json',
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  );
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  void prepareNativeIconPacks().catch(() => {
    process.stderr.write(
      'Native icon pack preparation failed; no database or provider was changed.\n',
    );
    process.exitCode = 1;
  });
