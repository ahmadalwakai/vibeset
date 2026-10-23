import type { FontMetadata } from '../lib/catalog';
import type { FontId } from '../lib/render/types';

export const FONT_IDS = {
  'readex-pro': {
    cssVariable: '--font-readex',
    displayName: 'Readex Pro',
    ttfFileName: 'ReadexPro[HEXP,wght].ttf',
    folder: 'ReadexPro',
    scripts: ['latin', 'arabic'],
  },
  fraunces: {
    cssVariable: '--font-fraunces',
    displayName: 'Fraunces',
    ttfFileName: 'Fraunces[SOFT,WONK,opsz,wght].ttf',
    folder: 'Fraunces',
    scripts: ['latin'],
  },
  pacifico: {
    cssVariable: '--font-pacifico',
    displayName: 'Pacifico',
    ttfFileName: 'Pacifico-Regular.ttf',
    folder: 'Pacifico',
    scripts: ['latin'],
  },
  'space-grotesk': {
    cssVariable: '--font-space-grotesk',
    displayName: 'Space Grotesk',
    ttfFileName: 'SpaceGrotesk[wght].ttf',
    folder: 'SpaceGrotesk',
    scripts: ['latin'],
  },
  'el-messiri': {
    cssVariable: '--font-el-messiri',
    displayName: 'El Messiri',
    ttfFileName: 'ElMessiri[wght].ttf',
    folder: 'ElMessiri',
    scripts: ['latin', 'arabic'],
  },
  'jetbrains-mono': {
    cssVariable: '--font-jetbrains-mono',
    displayName: 'JetBrains Mono',
    ttfFileName: 'JetBrainsMono[wght].ttf',
    folder: 'JetBrainsMono',
    scripts: ['latin'],
  },
} as const satisfies Record<FontId, FontMetadata>;
