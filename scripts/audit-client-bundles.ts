import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const HOME_BUDGET_BYTES = 180_000;

async function main(): Promise<void> {
  for (const locale of ['en', 'ar']) {
    const html = await readFile(`.next/server/app/${locale}.html`, 'utf8');
    const scripts = new Map<string, boolean>();
    for (const tag of html.matchAll(/<script\b[^>]*>/gi)) {
      const source = /\bsrc="([^"]+)"/i.exec(tag[0])?.[1]?.split('?')[0];
      if (!source?.startsWith('/_next/')) continue;
      if (
        !/^\/_next\/static\/chunks\/[a-zA-Z0-9._~/-]+\.js$/.test(source) ||
        source.split('/').includes('..')
      )
        throw new Error('Unexpected build script path');
      const modern = !/\bnomodule\b/i.test(tag[0]);
      scripts.set(source, (scripts.get(source) ?? false) || modern);
    }
    const chunks = await Promise.all(
      [...scripts].map(async ([source, modern]) => ({
        source,
        modern,
        gzipBytes: gzipSync(await readFile(path.join('.next', source.slice('/_next/'.length))))
          .byteLength,
      })),
    );
    if (chunks.length === 0) throw new Error('Build has no external scripts');
    const modernGzipBytes = chunks
      .filter((entry) => entry.modern)
      .reduce((total, entry) => total + entry.gzipBytes, 0);
    process.stdout.write(
      JSON.stringify({
        locale,
        measurement:
          'prerendered-shell external scripts, gzip defaults; excludes inline data and runtime streams',
        modernGzipBytes,
        budgetBytes: HOME_BUDGET_BYTES,
        withinBudget: modernGzipBytes <= HOME_BUDGET_BYTES,
        chunks,
      }) + '\n',
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error({
      scope: 'audit-client-bundles',
      message: error instanceof Error ? error.message : 'Audit failed',
    });
    process.exitCode = 1;
  });
}
