import {
  El_Messiri,
  Fraunces,
  JetBrains_Mono,
  Pacifico,
  Readex_Pro,
  Space_Grotesk,
} from 'next/font/google';

const readex = Readex_Pro({
  subsets: ['latin', 'arabic'],
  variable: '--font-readex',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const elMessiri = El_Messiri({
  subsets: ['arabic'],
  variable: '--font-el-messiri',
  display: 'swap',
});

const pacifico = Pacifico({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-pacifico',
  display: 'swap',
  preload: false,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  preload: false,
});

export const fontVariables = [
  readex.variable,
  fraunces.variable,
  elMessiri.variable,
  pacifico.variable,
  spaceGrotesk.variable,
  jetbrainsMono.variable,
].join(' ');
