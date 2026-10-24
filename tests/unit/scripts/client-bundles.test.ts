import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

const script = fileURLToPath(new URL('../../../scripts/audit-client-bundles.ts', import.meta.url));
const tsx = import.meta.resolve('tsx');
const reportSchema = z.strictObject({
  locale: z.enum(['en', 'ar']),
  measurement: z.literal(
    'prerendered-shell external scripts, gzip defaults; excludes inline data and runtime streams',
  ),
  modernGzipBytes: z.number().int().nonnegative(),
  budgetBytes: z.literal(180_000),
  withinBudget: z.boolean(),
  chunks: z.array(
    z.strictObject({
      source: z.string(),
      modern: z.boolean(),
      gzipBytes: z.number().int().positive(),
    }),
  ),
});
interface AuditResult {
  code: number | null;
  stdout: string;
  stderr: string;
}
let directory: string;

async function page(html: string, locale: 'en' | 'ar' = 'en'): Promise<void> {
  const destination = path.join(directory, '.next/server/app');
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, `${locale}.html`), html);
}

async function chunk(name: string, contents: Uint8Array | string): Promise<void> {
  const destination = path.join(directory, '.next/static/chunks', name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

function audit(args: readonly string[] = []): Promise<AuditResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', tsx, script, ...args], {
      cwd: directory,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (data: string) => (stdout += data));
    child.stderr.setEncoding('utf8').on('data', (data: string) => (stderr += data));
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function reports(result: AuditResult): z.infer<typeof reportSchema>[] {
  return result.stdout
    .trim()
    .split('\n')
    .map((line) => reportSchema.parse(JSON.parse(line)));
}

function exactGzipFixture(targetBytes: number): Uint8Array {
  const bytes = Buffer.concat(
    Array.from({ length: Math.ceil(targetBytes / 32) }, (_, counter) =>
      createHash('sha256').update(String(counter)).digest(),
    ),
  );
  // Search a bounded prefix so the gzip fixture stays exact across zlib patch versions.
  for (let length = targetBytes; length >= targetBytes - 256; length -= 1) {
    const candidate = bytes.subarray(0, length);
    if (gzipSync(candidate).byteLength === targetBytes) return candidate;
  }
  throw new Error('Could not produce an exact gzip boundary fixture');
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'vibeset-client-bundles-'));
  await chunk('main.js', 'window.fixture = "small shared build";');
  await Promise.all(
    (['en', 'ar'] as const).map((locale) =>
      page('<script src="/_next/static/chunks/main.js"></script>', locale),
    ),
  );
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('client bundle audit command', () => {
  it('keeps the bilingual JSON report and passes an explicitly requested budget check', async () => {
    const result = await audit(['--check']);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    const output = reports(result);
    expect(output.map((entry) => entry.locale)).toEqual(['en', 'ar']);
    expect(output.every((entry) => entry.withinBudget)).toBe(true);
  });

  it('deduplicates query variants, counts shared modern scripts once, and reports legacy-only chunks', async () => {
    const shared = 'window.shared = 1;';
    const modern = 'window.modern = 2;';
    await chunk('shared.js', shared);
    await chunk('nested/modern.js', modern);
    await chunk('legacy.js', randomBytes(200_000));
    await page(`
      <script noModule src="/_next/static/chunks/shared.js?first=1"></script>
      <script src="/_next/static/chunks/shared.js?second=2"></script>
      <script src="/_next/static/chunks/nested/modern.js"></script>
      <script src="/_next/static/chunks/nested/modern.js"></script>
      <script nomodule src="/_next/static/chunks/legacy.js"></script>
      <script src="https://example.invalid/external.js"></script>
      <script>window.inline = 3;</script>
    `);
    const result = await audit(['--check']);
    expect(result.code).toBe(0);
    expect(reports(result)[0]).toMatchObject({
      modernGzipBytes: gzipSync(shared).byteLength + gzipSync(modern).byteLength,
      withinBudget: true,
      chunks: [
        { source: '/_next/static/chunks/shared.js', modern: true },
        { source: '/_next/static/chunks/nested/modern.js', modern: true },
        { source: '/_next/static/chunks/legacy.js', modern: false },
      ],
    });
  });

  it.each(['en', 'ar'] as const)(
    'reports over-budget %s without failing by default, but --check fails',
    async (locale) => {
      await chunk('large.js', randomBytes(190_000));
      await page('<script src="/_next/static/chunks/large.js"></script>', locale);
      const normal = await audit();
      const checked = await audit(['--check']);
      expect(normal.code).toBe(0);
      expect(checked.code).toBe(1);
      expect(checked.stderr).toBe('');
      expect(reports(checked)).toEqual(reports(normal));
      expect(reports(checked)).toHaveLength(2);
      expect(reports(checked).find((entry) => entry.locale === locale)).toMatchObject({
        withinBudget: false,
        modernGzipBytes: expect.any(Number),
      });
      expect(
        reports(checked).find((entry) => entry.locale === locale)?.modernGzipBytes,
      ).toBeGreaterThan(180_000);
    },
  );

  it.each([
    { locale: 'en', gzipBytes: 179_999, withinBudget: true, code: 0 },
    { locale: 'ar', gzipBytes: 179_999, withinBudget: true, code: 0 },
    { locale: 'en', gzipBytes: 180_000, withinBudget: false, code: 1 },
    { locale: 'ar', gzipBytes: 180_000, withinBudget: false, code: 1 },
  ] as const)(
    'checks the exact $gzipBytes-byte boundary for $locale',
    async ({ locale, gzipBytes, withinBudget, code }) => {
      await chunk('boundary.js', exactGzipFixture(gzipBytes));
      await page('<script src="/_next/static/chunks/boundary.js"></script>', locale);
      const normal = await audit();
      const checked = await audit(['--check']);
      expect(normal.code).toBe(0);
      expect(checked.code).toBe(code);
      expect(checked.stderr).toBe('');
      expect(reports(checked)).toEqual(reports(normal));
      expect(reports(checked).find((entry) => entry.locale === locale)).toMatchObject({
        modernGzipBytes: gzipBytes,
        withinBudget,
      });
    },
  );

  it.each([
    '/_next/static/chunks/../../outside.js',
    '/_next/static/chunks/%2e%2e/outside.js',
    '/_next/static/chunks/..\\outside.js',
    '/_next/server/private.js',
  ])('refuses an unexpected build script path: %s', async (source) => {
    await page(`<script src="${source}"></script>`);
    const result = await audit(['--check']);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Unexpected build script path');
  });

  it('fails closed when the prerendered shell contains no external Next scripts', async () => {
    await page('<script>window.onlyInline = true;</script>');
    const result = await audit();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Build has no external scripts');
  });

  it('rejects unknown switches instead of silently bypassing the check', async () => {
    const result = await audit(['--budget=999999']);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
  });
});
