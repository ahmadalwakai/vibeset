import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { FONT_IDS } from '../content/fonts';

// A fresh Node process prevents a workspace-loaded DLL hiding an incomplete artifact.
const source = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = fs.realpathSync(process.cwd());
const fontFiles = JSON.parse(process.argv[1]);
for (const file of fontFiles) fs.accessSync(file);
const load = createRequire(path.join(root, 'package.json'));
function local(name) {
  const target = fs.realpathSync(load.resolve(name));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Dependency escaped standalone artifact');
  return load(name);
}
(async () => {
  const sharp = local('sharp');
  const { Resvg } = local('@resvg/resvg-js');
  const rendered = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#b44bd0"/></svg>', { font: { fontFiles, loadSystemFonts: false } }).render().asPng();
  const resized = await sharp(rendered).resize(16, 16).png().toBuffer();
  const metadata = await sharp(resized).metadata();
  if (metadata.width !== 16 || metadata.height !== 16 || metadata.format !== 'png') throw new Error('Native raster pipeline failed');
  const manifest = JSON.parse(fs.readFileSync('public/glyphs/v1/manifest.json', 'utf8'));
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('Missing glyph manifest');
  for (const weight of ['thin', 'light', 'regular', 'bold', 'fill', 'duotone']) fs.accessSync('public/glyphs/v1/' + weight + '.json');
  process.stdout.write(JSON.stringify({ standalone: true, sharp: sharp.versions.sharp, raster: '16x16 PNG', glyphs: manifest.length, fonts: fontFiles.length }) + '\n');
})().catch(() => { process.stderr.write('Standalone native/font/glyph verification failed.\n'); process.exitCode = 1; });
`;
const files = Object.values(FONT_IDS).map(({ folder, ttfFileName }) =>
  path.join('assets', 'fonts', folder, ttfFileName),
);
const result = spawnSync(process.execPath, ['-e', source, JSON.stringify(files)], {
  cwd: path.resolve('.next/standalone'),
  stdio: 'inherit',
  timeout: 30_000,
  windowsHide: true,
});
if (result.error || result.status !== 0) process.exitCode = 1;
