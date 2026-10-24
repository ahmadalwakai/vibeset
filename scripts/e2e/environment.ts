import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { isolatedIntegrationUrl } from '../../tests/helpers/integration-env';
import { normalizeE2eDatabaseIdentity } from '../../lib/e2e';

export const originSchema = z
  .url({ protocol: /^https?$/ })
  .refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  })
  .transform((value) => new URL(value).origin);
export const modeSchema = z.enum(['local', 'remote']);
export type E2eMode = z.infer<typeof modeSchema>;
export type E2eEnvironment = Record<string, string | undefined>;

export function e2eDirectory(runId: string): string {
  return path.resolve('.tmp', 'e2e', z.uuid().length(36).parse(runId));
}

export function assertOwnedE2ePath(file: string, runId: string): string {
  const directory = e2eDirectory(runId);
  const resolved = path.resolve(file);
  const relative = path.relative(directory, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('E2E files must stay inside their run directory');
  return resolved;
}

/** Called before importing server configuration or rebinding either ordinary URL. */
export function e2eEnvironment(
  source: Readonly<E2eEnvironment>,
  mode: E2eMode,
  base: string,
  assets: string,
): E2eEnvironment {
  modeSchema.parse(mode);
  const baseURL = originSchema.parse(base),
    assetOrigin = originSchema.parse(assets);
  const testURL = isolatedIntegrationUrl(source);
  if (!testURL) throw new Error('E2E requires an explicit isolated TEST_DATABASE_URL');
  const host = new URL(baseURL).hostname;
  if (mode === 'local') {
    if (
      host !== 'localhost' ||
      new URL(baseURL).protocol !== 'http:' ||
      new URL(assetOrigin).protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(new URL(assetOrigin).hostname)
    )
      throw new Error('Local E2E requires an HTTP localhost app and HTTP loopback assets');
  } else {
    if (
      new URL(baseURL).protocol !== 'https:' ||
      baseURL !== originSchema.parse(source.E2E_ALLOWED_REMOTE_ORIGIN)
    )
      throw new Error('Remote E2E requires its exact explicitly allowed HTTPS origin');
    if (source.VERCEL_ENV !== 'preview')
      throw new Error('Remote E2E requires a verified preview deployment');
    if (new URL(assetOrigin).protocol !== 'https:')
      throw new Error('Remote E2E assets require HTTPS');
    if (!source.INTERNAL_API_SECRET?.trim() || source.INTERNAL_API_SECRET.trim().length < 32)
      throw new Error('Remote E2E requires the actual app internal secret');
    if (
      ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].some(
        (key) => !source[key]?.trim(),
      )
    )
      throw new Error('Remote E2E requires explicit test storage credentials');
    const bucket = source.R2_BUCKET?.trim();
    if (
      bucket?.toLowerCase() === 'vibeset-assets' ||
      source.E2E_ALLOWED_STORAGE_BUCKET?.trim() !== bucket
    )
      throw new Error('Remote E2E requires an explicitly approved nonproduction storage bucket');
  }
  const fallbackDirect = new URL(testURL);
  fallbackDirect.hostname = fallbackDirect.hostname.replace(/-pooler(?=\.)/i, '');
  const direct = source.E2E_DATABASE_URL_UNPOOLED?.trim() || fallbackDirect.href;
  if (normalizeE2eDatabaseIdentity(direct) !== normalizeE2eDatabaseIdentity(testURL))
    throw new Error('Test pooled/direct database identities differ');
  const result: E2eEnvironment = {
    ...source,
    NODE_ENV: 'test',
    VERCEL_ENV: 'preview',
    SKIP_ENV_VALIDATION: '0',
    E2E_TEST_AUTH: '1',
    DATABASE_URL: testURL,
    DATABASE_URL_UNPOOLED: direct,
    NEXT_PUBLIC_SITE_URL: baseURL,
    NEXT_PUBLIC_CDN_URL: assetOrigin,
    BETTER_AUTH_URL: baseURL,
    BETTER_AUTH_TRUSTED_ORIGINS: baseURL,
  };
  for (const key of ['BETTER_AUTH_SECRET', 'IP_HASH_SALT', 'CRON_SECRET', 'INTERNAL_API_SECRET'])
    result[key] ||= randomBytes(32).toString('hex');
  // Never send email or consume the user's provider/storage credentials locally.
  for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'RESEND_API_KEY'])
    result[key] = '';
  if (mode === 'local')
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'])
      result[key] = '';
  return result;
}

export async function verifyE2eApp(input: {
  baseURL: string;
  fingerprint: string;
  bypass?: string;
}): Promise<void> {
  const origin = originSchema.parse(input.baseURL);
  const response = await fetch(new URL('/sign-in', origin), {
    headers: input.bypass ? { 'x-vercel-protection-bypass': input.bypass } : {},
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error('E2E app sign-in preflight failed');
  const html = await response.text();
  if (
    !html.includes('data-e2e-enabled="true"') ||
    !html.includes(
      `data-database-fingerprint="${z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(input.fingerprint)}"`,
    )
  )
    throw new Error('E2E app flag/database fingerprint mismatch; no fixtures were written');
}
