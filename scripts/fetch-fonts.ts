import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { FONT_IDS } from '../content/fonts';

const sources = {
  'readex-pro': 'readexpro',
  fraunces: 'fraunces',
  pacifico: 'pacifico',
  'space-grotesk': 'spacegrotesk',
  'el-messiri': 'elmessiri',
  'jetbrains-mono': 'jetbrainsmono',
} as const;
const fileSchema = z.object({
  type: z.literal('file'),
  name: z.string().regex(/^[a-zA-Z0-9[\], ._-]+$/),
  size: z.number().int().positive().max(10_000_000),
  download_url: z.url(),
});
type FontDownload = z.infer<typeof fileSchema>;

export function parseFontListing(value: unknown, sourceFolder: string): FontDownload[] {
  if (!/^[a-z]+$/.test(sourceFolder)) throw new Error('Invalid Google Fonts source folder');
  const entries = z
    .array(z.object({ type: z.string(), name: z.string() }).passthrough())
    .parse(value);
  const files = entries
    .filter(
      (entry) => entry.type === 'file' && (entry.name.endsWith('.ttf') || entry.name === 'OFL.txt'),
    )
    .map((entry) => fileSchema.parse(entry));
  if (
    !files.some((file) => file.name === 'OFL.txt') ||
    !files.some((file) => file.name.endsWith('.ttf'))
  ) {
    throw new Error(`Missing font or OFL license in ofl/${sourceFolder}`);
  }
  if (new Set(files.map((file) => file.name)).size !== files.length) {
    throw new Error('Duplicate Google Fonts download filename');
  }
  for (const file of files) {
    const url = new URL(file.download_url);
    if (
      url.origin !== 'https://raw.githubusercontent.com' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      decodeURIComponent(url.pathname) !== `/google/fonts/main/ofl/${sourceFolder}/${file.name}`
    )
      throw new Error(`Unexpected Google Fonts download URL: ${file.name}`);
  }
  return files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function validateFontFile(name: string, bytes: Uint8Array, expectedSize: number): void {
  if (bytes.byteLength !== expectedSize) throw new Error(`Incomplete font asset: ${name}`);
  if (name === 'OFL.txt') {
    if (!new TextDecoder().decode(bytes).includes('SIL OPEN FONT LICENSE'))
      throw new Error('Invalid OFL license');
  } else if (!(bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) {
    throw new Error(`Invalid TrueType font: ${name}`);
  }
}

export async function fetchFonts(projectRoot = process.cwd()): Promise<void> {
  for (const [id, metadata] of Object.entries(FONT_IDS)) {
    const sourceFolder = sources[id as keyof typeof sources];
    const apiURL = `https://api.github.com/repos/google/fonts/contents/ofl/${sourceFolder}`;
    let files: FontDownload[];
    try {
      const response = await fetch(apiURL, {
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'vibeset-font-assets' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      files = parseFontListing(await response.json(), sourceFolder);
    } catch (error) {
      throw new Error(
        `Cannot list ofl/${sourceFolder}; add its TTF files and OFL.txt manually from ${apiURL}`,
        { cause: error },
      );
    }
    if (!files.some((file) => file.name === metadata.ttfFileName))
      throw new Error(`Font metadata filename changed: ${metadata.ttfFileName}`);
    const folder = path.join(projectRoot, 'assets/fonts', metadata.folder);
    await mkdir(folder, { recursive: true });
    for (const file of files) {
      const destination = path.join(folder, file.name);
      try {
        await access(destination);
        validateFontFile(file.name, await readFile(destination), file.size);
        process.stdout.write(`Font exists: ${metadata.folder}/${file.name}` + '\n');
        continue;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      try {
        const response = await fetch(file.download_url, {
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        validateFontFile(file.name, bytes, file.size);
        await writeFile(`${destination}.download`, bytes);
        await rename(`${destination}.download`, destination);
        process.stdout.write(`Downloaded font asset: ${metadata.folder}/${file.name}` + '\n');
      } catch (error) {
        throw new Error(
          `Add assets/fonts/${metadata.folder}/${file.name} manually from ${file.download_url}`,
          { cause: error },
        );
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  fetchFonts().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Font download failed');
    process.exitCode = 1;
  });
}
