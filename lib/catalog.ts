export interface CatalogApp {
  slug: string;
  name: string;
  aliases: readonly string[];
  category: string;
  glyph: string;
  rank: number;
}

export type ColorFamily =
  | 'pink'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'brown'
  | 'black'
  | 'white'
  | 'gray'
  | 'multi';

export interface FontMetadata {
  cssVariable: string;
  displayName: string;
  ttfFileName: string;
  folder: string;
  scripts: readonly ('latin' | 'arabic')[];
}

export interface ClockOutline {
  svg: string;
  width: number;
  height: number;
}

export type ClockText = '10:24' | '9:41';
