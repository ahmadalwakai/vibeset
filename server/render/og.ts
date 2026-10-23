import 'server-only';

import sharp from 'sharp';
import { paletteSchema } from '../../lib/render/spec';
import type { Palette } from '../../lib/render/types';
import { rasterize } from './rasterize';

export async function renderOg(
  previewHome: Uint8Array,
  previewLock: Uint8Array,
  palette: Palette,
): Promise<Buffer> {
  const colors = paletteSchema.parse(palette);
  const background = await rasterize(
    {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${colors.bg}"/><circle cx="1080" cy="80" r="530" fill="${colors.primary}" opacity="0.12"/><circle cx="0" cy="630" r="320" fill="${colors.accent}" opacity="0.1"/><text x="72" y="340" font-family="Fraunces" font-size="94" font-weight="600" fill="${colors.ink}">vibeset</text><path d="M116 184L123 202L141 209L123 216L116 234L109 216L91 209L109 202Z" fill="${colors.primary}"/></svg>`,
      width: 1200,
      height: 630,
      grain: 0,
      noiseSeed: 0,
      warnings: [],
    },
    { w: 1200, h: 630, format: 'png' },
  );
  const previews = await Promise.all(
    [previewHome, previewLock].map((bytes) =>
      sharp(Buffer.from(bytes), { limitInputPixels: 16_700_000 })
        .rotate()
        .resize(236, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
    ),
  );
  const [home, lock] = previews;
  if (!home || !lock) throw new Error('Both preview images are required');
  return sharp(background)
    .composite([
      { input: home, left: 620, top: 48 },
      { input: lock, left: 884, top: 86 },
    ])
    .jpeg({ quality: 85, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
}
