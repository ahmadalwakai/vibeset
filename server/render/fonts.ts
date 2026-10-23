import 'server-only';

import { access } from 'node:fs/promises';
import path from 'node:path';
import { FONT_IDS } from '../../content/fonts';

let fontFilesPromise: Promise<string[]> | undefined;

export function getFontFiles(): Promise<string[]> {
  if (!fontFilesPromise) {
    fontFilesPromise = Promise.all(
      Object.values(FONT_IDS).map(async ({ folder, ttfFileName }) => {
        const file = path.resolve(process.cwd(), 'assets', 'fonts', folder, ttfFileName);
        await access(file);
        return file;
      }),
    ).catch((error: unknown) => {
      fontFilesPromise = undefined;
      throw error;
    });
  }
  return fontFilesPromise.then((files) => [...files]);
}
