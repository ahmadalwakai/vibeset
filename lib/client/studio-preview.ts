import type { ThemeSpec } from '../render/spec';
import type { GlyphSource } from '../render/types';

export interface StudioWallpaperPreview {
  src: string;
  noise: string | null;
  foreground: string;
}
const noiseTiles = new Map<string, string>();

export async function prepareStudioWallpaperPreview(
  spec: ThemeSpec,
  which: 'home' | 'lock',
  signal: AbortSignal,
): Promise<StudioWallpaperPreview> {
  signal.throwIfAborted();
  const [renderer, glyphs, colours, svg, noise] = await Promise.all([
    import('../render/wallpaper'),
    import('./glyphs'),
    import('../render/preview-colors'),
    import('../render/svg'),
    import('../render/noise'),
  ]);
  const wallpaper = which === 'lock' ? (spec.lockWallpaper ?? spec.wallpaper) : spec.wallpaper;
  let source: GlyphSource = { get: () => undefined };
  if (wallpaper.kind === 'scatter') source = await glyphs.loadGlyphs(wallpaper.weight, signal);
  if (wallpaper.kind === 'pattern' && ['hearts', 'stars'].includes(wallpaper.pattern))
    source = await glyphs.loadGlyphs('fill', signal);
  signal.throwIfAborted();
  const result = renderer.renderWallpaper(
    spec,
    which,
    { w: 264, h: 572, prefix: 'studio' },
    source,
  );
  let src = svg.svgDataUrl(result.svg);
  if (result.background) {
    const { rasterizeInBrowser } = await import('./rasterize');
    const blob = await rasterizeInBrowser(result, { w: 264, h: 572, type: 'image/png', signal });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    signal.throwIfAborted();
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    src = `data:image/png;base64,${btoa(binary)}`;
  }
  const key = `${result.noiseSeed}:${result.grain}`;
  let tile = result.grain > 0 ? noiseTiles.get(key) : undefined;
  if (result.grain > 0 && !tile) {
    const canvas = document.createElement('canvas');
    try {
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.putImageData(
        new ImageData(
          new Uint8ClampedArray(noise.noiseTile(result.noiseSeed, result.grain)),
          128,
          128,
        ),
        0,
        0,
      );
      tile = canvas.toDataURL('image/png');
      if (noiseTiles.size >= 16) noiseTiles.delete(noiseTiles.keys().next().value ?? '');
      noiseTiles.set(key, tile);
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
  signal.throwIfAborted();
  return {
    src,
    noise: tile ?? null,
    foreground: colours.previewForeground(spec, wallpaper),
  };
}
