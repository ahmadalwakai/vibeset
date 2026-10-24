import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import credits from '../assets/font-credits.json';

function fontCopyrightNotices(font: Buffer): string[] {
  const tableCount = font.readUInt16BE(4);
  let nameOffset: number | undefined;
  for (let index = 0; index < tableCount; index += 1) {
    const position = 12 + index * 16;
    if (font.toString('ascii', position, position + 4) === 'name') {
      nameOffset = font.readUInt32BE(position + 8);
      break;
    }
  }
  if (nameOffset === undefined) throw new Error('The bundled font requires a name table.');
  const count = font.readUInt16BE(nameOffset + 2);
  const stringOffset = nameOffset + font.readUInt16BE(nameOffset + 4);
  const notices = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const position = nameOffset + 6 + index * 12;
    const platform = font.readUInt16BE(position);
    const nameId = font.readUInt16BE(position + 6);
    if (nameId !== 0) continue;
    const length = font.readUInt16BE(position + 8);
    const start = stringOffset + font.readUInt16BE(position + 10);
    const encoding = platform === 0 || platform === 3 ? 'utf-16be' : 'macintosh';
    notices.add(
      new TextDecoder(encoding, { fatal: true }).decode(font.subarray(start, start + length)),
    );
  }
  return [...notices];
}

describe('offline bundled font notices', () => {
  it('preserves every complete supplied OFL and the exact copyrights in the distributed TTFs', () => {
    expect(credits.v).toBe(1);
    expect(credits.fonts.map(({ name }) => name)).toEqual(['Readex Pro', 'Fraunces', 'El Messiri']);
    for (const credit of credits.fonts) {
      const upstream = readFileSync(
        new URL(`../../assets/fonts/${credit.sourceFolder}/OFL.txt`, import.meta.url),
        'utf8',
      ).replace(/\r\n/g, '\n');
      const mobileLicence = readFileSync(
        new URL(`../assets/fonts/${credit.licenseFile}`, import.meta.url),
        'utf8',
      ).replace(/\r\n/g, '\n');
      const font = readFileSync(new URL(`../assets/fonts/${credit.fontFile}`, import.meta.url));
      expect(credit.licenseText).toBe(upstream);
      expect(credit.licenseText).toBe(mobileLicence);
      expect(credit.licenseText).toContain('SIL OPEN FONT LICENSE Version 1.1');
      expect(credit.licenseText).toContain('DISCLAIMER');
      expect(credit.copyrightNotices).toEqual(fontCopyrightNotices(font));
      expect(credit.copyrightNotices.length).toBeGreaterThan(0);
    }
  });
});
