import { z } from 'zod';
import { absolutePublicUrl } from './seo';

export const SITEMAP_MAX_URLS = 40_000;
export const SITEMAP_ENTITY_LIMIT = SITEMAP_MAX_URLS / 2;
export const SITEMAP_STATIC_PATHS = [
  '/',
  '/explore',
  '/collections',
  '/studio',
  '/setup/ios',
  '/setup/android',
  '/setup/desktop',
  '/legal/terms',
  '/legal/privacy',
  '/legal/copyright',
] as const;
export interface SitemapEntity {
  path: string;
  lastModified: string | null;
}
export const sitemapPageSchema = z.number().int().nonnegative().max(2_147_483_647);
const shardId = z
  .string()
  .max(20)
  .regex(/^(0|[1-9][0-9]*)\.xml$/)
  .refine((value) => !/\s/.test(value))
  .transform((value) => Number(value.slice(0, -4)))
  .pipe(sitemapPageSchema);
export function parseSitemapShard(value: unknown): number | null {
  const result = shardId.safeParse(value);
  return result.success ? result.data : null;
}
export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
function siteOrigin(value: string): string {
  return new URL(absolutePublicUrl(value, 'en', '/')).origin;
}
export function sitemapIndexXml(origin: string, entityCount: number): string {
  const total = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(entityCount);
  const pages = Math.max(1, Math.ceil(total / SITEMAP_ENTITY_LIMIT));
  const base = siteOrigin(origin);
  const entries = Array.from(
    { length: pages },
    (_, id) => `<sitemap><loc>${escapeXml(`${base}/sitemap/${id}.xml`)}</loc></sitemap>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`;
}
export function sitemapShardXml(origin: string, entities: readonly SitemapEntity[]): string {
  if (entities.length > SITEMAP_ENTITY_LIMIT)
    throw new RangeError('Sitemap shard exceeds its URL budget');
  const base = siteOrigin(origin);
  const entries = entities
    .flatMap((entity) => {
      const en = absolutePublicUrl(base, 'en', entity.path),
        ar = absolutePublicUrl(base, 'ar', entity.path);
      const date =
        entity.lastModified === null
          ? ''
          : `<lastmod>${escapeXml(z.iso.datetime({ offset: true }).parse(entity.lastModified))}</lastmod>`;
      const links = `<xhtml:link rel="alternate" hreflang="en" href="${escapeXml(en)}"/><xhtml:link rel="alternate" hreflang="ar" href="${escapeXml(ar)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(en)}"/>`;
      return [en, ar].map((url) => `<url><loc>${escapeXml(url)}</loc>${date}${links}</url>`);
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries}</urlset>`;
}
