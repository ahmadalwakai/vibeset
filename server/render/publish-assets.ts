import 'server-only';

import sharp from 'sharp';
import { APPS } from '../../content/apps';
import { colorFamilyOf } from '../../lib/render/color';
import { DEVICE_PRESETS } from '../../lib/render/devices';
import { renderHomePreview, renderLockPreview } from '../../lib/render/preview';
import { themeSpecSchema, type ThemeSpec } from '../../lib/render/spec';
import { renderWallpaper } from '../../lib/render/wallpaper';
import type { ColorFamily } from '../../lib/catalog';
import type { ThemeAssets, WallpaperSize } from '../../lib/theme-assets';
import { themeAssetKey } from '../storage/keys';
import type { ObjectStorage } from '../storage/r2';
import { loadServerGlyphs } from './glyphs';
import { dHash } from './hash';
import { renderOg } from './og';
import { rasterize } from './rasterize';

export interface PublishAssetFile {
  key: string;
  body: Uint8Array;
  contentType: 'image/jpeg' | 'image/webp';
}

export interface RenderedPublishAssets {
  assets: ThemeAssets;
  files: PublishAssetFile[];
  dominantColor: string;
  colorFamily: ColorFamily;
  previewHash: string;
}

async function thumbnail(home: Uint8Array): Promise<Buffer> {
  const source = await sharp(home)
    .resize(DEVICE_PRESETS.thumb.w, DEVICE_PRESETS.thumb.h, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (const quality of [80, 72, 64, 56, 48, 40]) {
    const encoded = await sharp(source.data, { raw: source.info }).webp({ quality }).toBuffer();
    if (encoded.byteLength <= 80_000) return encoded;
  }
  throw new Error('Thumbnail exceeds the 80,000 byte budget');
}

export async function renderPublishAssets(input: {
  themeId: string;
  assetVersion: number;
  attemptId: string;
  spec: ThemeSpec;
  storage: ObjectStorage;
}): Promise<RenderedPublishAssets> {
  const spec = themeSpecSchema.parse(input.spec);
  const glyphs = await loadServerGlyphs();
  const photos = new Map<string, Promise<Uint8Array>>();
  const photoBytes = async (wallpaper: ThemeSpec['wallpaper']): Promise<Uint8Array | undefined> => {
    if (wallpaper.kind !== 'image') return undefined;
    let pending = photos.get(wallpaper.assetKey);
    if (!pending) {
      pending = input.storage.getBytes(wallpaper.assetKey);
      photos.set(wallpaper.assetKey, pending);
    }
    return pending;
  };
  const homePhoto = await photoBytes(spec.wallpaper);
  const lockPhoto = await photoBytes(spec.lockWallpaper ?? spec.wallpaper);
  const files: PublishAssetFile[] = [];
  const key = (file: Parameters<typeof themeAssetKey>[2]): string =>
    themeAssetKey(input.themeId, input.assetVersion, file, input.attemptId);
  const wallpapers: ThemeAssets['wallpapers'] = {};
  const sizes: WallpaperSize[] =
    spec.wallpaper.kind === 'image' ? ['phone', 'tablet'] : ['phone', 'tablet', 'desktop'];

  for (const size of sizes) {
    const dimensions = DEVICE_PRESETS[size];
    let body = await rasterize(renderWallpaper(spec, 'home', dimensions, glyphs), {
      ...dimensions,
      format: 'jpeg',
      quality: 92,
      focalBackground: homePhoto,
    });
    if (size === 'phone' && body.byteLength > 3_000_000) {
      body = await sharp(body)
        .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' })
        .toBuffer();
      if (body.byteLength > 3_000_000)
        throw new Error('Phone wallpaper exceeds the 3,000,000 byte budget');
    }
    const assetKey = key(`wallpaper-${size}.jpg`);
    files.push({ key: assetKey, body, contentType: 'image/jpeg' });
    wallpapers[size] = { key: assetKey, ...dimensions, bytes: body.byteLength };
  }

  const home = await rasterize(renderHomePreview(spec, glyphs, APPS, DEVICE_PRESETS.preview), {
    ...DEVICE_PRESETS.preview,
    format: 'webp',
    quality: 82,
    focalBackground: homePhoto,
  });
  const lock = await rasterize(renderLockPreview(spec, glyphs, DEVICE_PRESETS.preview), {
    ...DEVICE_PRESETS.preview,
    format: 'webp',
    quality: 82,
    focalBackground: lockPhoto,
  });
  const thumb = await thumbnail(home);
  const og = await renderOg(home, lock, spec.palette);
  const assets: ThemeAssets = {
    version: input.assetVersion,
    wallpapers,
    thumb: key('thumb.webp'),
    previewHome: key('preview-home.webp'),
    previewLock: key('preview-lock.webp'),
    og: key('og.jpg'),
  };
  files.push(
    { key: assets.previewHome, body: home, contentType: 'image/webp' },
    { key: assets.previewLock, body: lock, contentType: 'image/webp' },
    { key: assets.thumb, body: thumb, contentType: 'image/webp' },
    { key: assets.og, body: og, contentType: 'image/jpeg' },
  );
  const { dominant } = await sharp(thumb).stats();
  const dominantColor = `#${[dominant.r, dominant.g, dominant.b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  return {
    assets,
    files,
    dominantColor,
    colorFamily: colorFamilyOf(dominantColor),
    previewHash: await dHash(thumb),
  };
}
