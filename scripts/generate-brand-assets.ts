import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import en from '../messages/en.json';
import ar from '../messages/ar.json';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/maskable-512.png', 512],
  ['app/icon.png', 512],
  ['app/apple-icon.png', 180],
] as const;

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character] ?? '';
  });
}

async function main(): Promise<void> {
  await mkdir(path.join(root, 'public/icons'), { recursive: true });
  await mkdir(path.join(root, 'public/og'), { recursive: true });
  const master = await readFile(path.join(root, 'public/brand/app-icon.svg'));
  for (const [file, size] of files) {
    const pixels = await sharp(master)
      .resize(size, size)
      .toColourspace('srgb')
      .removeAlpha()
      .withIccProfile('srgb')
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(path.join(root, file), pixels);
  }
  for (const [locale, messages] of [
    ['en', en],
    ['ar', ar],
  ] as const) {
    const rtl = locale === 'ar';
    const label = (value: string): string => xml(rtl ? `\u200f${value}\u200f` : value);
    const textX = rtl ? 1104 : 96,
      iconX = rtl ? 96 : 864;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs><linearGradient id="brand" x2="1" y2="1"><stop stop-color="#b44bd0"/><stop offset="1" stop-color="#ff8b58"/></linearGradient></defs>
      <rect width="1200" height="630" fill="#faf8fc"/>
      <circle cx="${rtl ? 180 : 1020}" cy="260" r="310" fill="url(#brand)" opacity="0.09"/>
      <g transform="translate(${iconX},176) scale(3.75)"><rect width="64" height="64" rx="18" fill="url(#brand)"/><path d="M32 10 38 26 54 32 38 38 32 54 26 38 10 32 26 26Z" fill="white"/></g>
      <g text-anchor="${rtl ? 'end' : 'start'}" fill="#322438">
        <text x="${textX}" y="286" font-family="Fraunces" font-size="112">vibeset</text>
        <text x="${textX}" y="385" direction="${rtl ? 'rtl' : 'ltr'}" unicode-bidi="embed" text-anchor="${rtl ? 'end' : 'start'}" font-family="Readex Pro" font-size="46">${label(messages.home.hero.title)}</text>
        <text x="${textX}" y="448" direction="${rtl ? 'rtl' : 'ltr'}" unicode-bidi="embed" text-anchor="${rtl ? 'end' : 'start'}" font-family="Readex Pro" font-size="27" fill="#6e6074">${label(messages.common.footer.description)}</text>
      </g>
    </svg>`;
    const png = new Resvg(svg, {
      font: {
        loadSystemFonts: false,
        fontFiles: [
          path.join(root, 'assets/fonts/Fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf'),
          path.join(root, 'assets/fonts/ReadexPro/ReadexPro[HEXP,wght].ttf'),
        ],
      },
    })
      .render()
      .asPng();
    const jpeg = await sharp(png)
      .toColourspace('srgb')
      .removeAlpha()
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
      .toBuffer();
    await writeFile(path.join(root, `public/og/brand-${locale}.jpg`), jpeg);
  }
  process.stdout.write('Generated five brand icons and two localized social images.\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error({ scope: 'generate-brand-assets', error });
    process.exitCode = 1;
  });
}
