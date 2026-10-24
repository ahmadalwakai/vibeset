import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { APPS } from '../../../content/apps';
import { NATIVE_BETA_ORIGINALS } from '../../../content/native-beta';
import prepared from '../../../content/native-beta/icon-packs.json';
import plan from '../../../content/native-beta/publication-plan.json';
import { specHash } from '../../../lib/render/hash';
import {
  nativeIconPackSchema,
  nativeIconPackResponseSchema,
} from '../../../lib/validation/native-icon-pack';
import { renderNativeIconPack } from '../../../server/render/native-icon-pack';

vi.mock('server-only', () => ({}));
const packs = prepared.map((pack) => nativeIconPackSchema.parse(pack));
const catalogue = [...APPS].sort(
  (left, right) => left.rank - right.rank || left.slug.localeCompare(right.slug, 'en'),
);

describe('actual native installation assets', () => {
  it('ships all125 catalogue icons for each exact current original, independently from previews', async () => {
    expect(packs).toHaveLength(3);
    for (const pack of packs) {
      const original = NATIVE_BETA_ORIGINALS.find(({ slug }) => slug === pack.slug);
      expect(original).toBeDefined();
      if (!original) throw new Error('Missing reviewed original');
      expect(pack.specHash).toBe(await specHash(original.spec));
      expect(plan.publications).toContainEqual(
        expect.objectContaining({
          themeId: pack.themeId,
          slug: pack.slug,
          specHash: pack.specHash,
        }),
      );
      expect(pack.icons.map(({ appSlug }) => appSlug)).toEqual(catalogue.map(({ slug }) => slug));
      expect(new Set(pack.icons.map(({ sha256 }) => sha256)).size).toBeGreaterThan(100);
      for (const [index, icon] of pack.icons.entries()) {
        const app = catalogue[index];
        expect(icon).toMatchObject({
          name: app?.name,
          aliases: app?.aliases,
          category: app?.category,
          rank: app?.rank,
        });
      }
    }
  });

  it('verifies every shippedPNG digest,512pixel dimensions and opaqueRGB encoding', async () => {
    await Promise.all(
      packs
        .flatMap(({ icons }) => icons)
        .map(async (icon) => {
          const key = new URL(icon.url).pathname.slice(1);
          const bytes = await readFile(path.join('public', key));
          expect(bytes.byteLength).toBe(icon.bytes);
          expect(createHash('sha256').update(bytes).digest('hex')).toBe(icon.sha256);
          expect(await sharp(bytes).metadata()).toMatchObject({
            format: 'png',
            width: 512,
            height: 512,
            hasAlpha: false,
            channels: 3,
            space: 'srgb',
          });
        }),
    );
  });

  it('re-renders actual individual glyphs deterministically from each original specification', async () => {
    for (const original of NATIVE_BETA_ORIGINALS) {
      const app = APPS[0];
      if (!app) throw new Error('Catalogue is empty');
      const [rendered] = await renderNativeIconPack({
        spec: original.spec,
        apps: [{ ...app, aliases: [...app.aliases] }],
      });
      expect(rendered?.sha256).toBe(
        packs.find(({ slug }) => slug === original.slug)?.icons[0]?.sha256,
      );
    }
  });

  it('refuses missing glyphs, empty/duplicate catalogues and aborted work', async () => {
    const original = NATIVE_BETA_ORIGINALS[0],
      app = APPS[0];
    if (!original || !app) throw new Error('Missing original or catalogue');
    const validApp = { ...app, aliases: [...app.aliases] };
    await expect(renderNativeIconPack({ spec: original.spec, apps: [] })).rejects.toThrow();
    await expect(
      renderNativeIconPack({ spec: original.spec, apps: [validApp, validApp] }),
    ).rejects.toThrow();
    await expect(
      renderNativeIconPack({
        spec: original.spec,
        apps: [{ ...validApp, glyph: 'missing-glyph' }],
      }),
    ).rejects.toThrow('missing');
    const controller = new AbortController();
    controller.abort();
    await expect(
      renderNativeIconPack({ spec: original.spec, apps: [validApp], signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects tampered PNG bindings, duplicate applications, external credentials and invalid responses', () => {
    const pack = packs[0],
      icon = pack?.icons[0];
    if (!pack || !icon) throw new Error('Missing prepared pack');
    for (const change of [
      { url: 'invalid' },
      { url: icon.url.replace('https://', 'http://') },
      { url: icon.url.replace('https://', 'https://user:secret@') },
      { url: `${icon.url}?token=unwanted` },
      { url: `${icon.url}#fragment` },
      { sha256: 'a'.repeat(64) },
      { w: 256 },
      { bytes: 0 },
      { url: icon.url.replace(pack.specHash, 'b'.repeat(64)) },
    ])
      expect(
        nativeIconPackSchema.safeParse({ ...pack, icons: [{ ...icon, ...change }] }).success,
      ).toBe(false);
    expect(nativeIconPackSchema.safeParse({ ...pack, icons: [icon, icon] }).success).toBe(false);
    expect(nativeIconPackResponseSchema.safeParse({ data: { ...pack, icons: [] } }).success).toBe(
      false,
    );
  });
});
