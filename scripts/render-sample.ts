import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { APPS } from '../content/apps';
import { playgroundStateSchema, renderSampleSpec } from '../content/render-sample';
import { DEVICE_PRESETS } from '../lib/render/devices';
import { renderWallpaper } from '../lib/render/wallpaper';
import { renderIcon } from '../lib/render/icon';
import { renderHomePreview, renderLockPreview } from '../lib/render/preview';
import { loadServerGlyphs } from '../server/render/glyphs';
import { rasterize } from '../server/render/rasterize';
import { renderOg } from '../server/render/og';

async function main(): Promise<void> {
  const target = path.resolve('.tmp/render-sample');
  await mkdir(target, { recursive: true });
  const spec = renderSampleSpec(playgroundStateSchema.parse({}));
  const glyphs = await loadServerGlyphs();
  const wallpaper = renderWallpaper(spec, 'home', DEVICE_PRESETS.phone, glyphs);
  const started = performance.now();
  const phone = await rasterize(wallpaper, {
    ...DEVICE_PRESETS.phone,
    format: 'jpeg',
    quality: 92,
  });
  const renderMs = performance.now() - started;
  if (phone.byteLength > 3 * 1024 * 1024)
    throw new Error('Phone wallpaper exceeds the 3 MiB budget');
  if (renderMs >= 3000)
    throw new Error(`Phone wallpaper rendering exceeds 3 s (${renderMs.toFixed(0)} ms)`);
  await writeFile(path.join(target, 'wallpaper-phone.jpg'), phone);
  const home = await rasterize(renderHomePreview(spec, glyphs, APPS, DEVICE_PRESETS.preview), {
    ...DEVICE_PRESETS.preview,
    format: 'png',
  });
  const lock = await rasterize(renderLockPreview(spec, glyphs, DEVICE_PRESETS.preview), {
    ...DEVICE_PRESETS.preview,
    format: 'png',
  });
  await writeFile(path.join(target, 'preview-home.png'), home);
  await writeFile(path.join(target, 'preview-lock.png'), lock);
  await writeFile(path.join(target, 'og.jpg'), await renderOg(home, lock, spec.palette));
  const fills = ['solid', 'gradient', 'glass', 'outline', 'pattern', 'wallpaper'] as const;
  for (const fill of fills) {
    const result = renderIcon(
      { ...spec.icons, fill },
      glyphs.get('heart', spec.icons.glyphWeight),
      {
        size: 512,
        platform: 'ios',
        palette: spec.palette,
        glyphs,
        wallpaper,
        prefix: `sample-${fill}`,
      },
    );
    await writeFile(
      path.join(target, `icon-${fill}.png`),
      await rasterize(result, { w: 512, h: 512, format: 'png' }),
    );
  }
  const report = {
    seed: 2026,
    phoneBytes: phone.byteLength,
    phoneRenderMs: Math.round(renderMs),
    files: 10,
  };
  await writeFile(path.join(target, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n${target}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error({
      scope: 'render-sample',
      message: error instanceof Error ? error.message : 'Sample rendering failed',
    });
    process.exitCode = 1;
  });
}
