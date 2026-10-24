import { connection } from 'next/server';
import { env } from '@/lib/env.client';
import { sitemapIndexXml } from '@/lib/sitemap';
import { handleRoute } from '@/server/route';

export const GET = handleRoute(async (): Promise<Response> => {
  await connection();
  const { countSitemapEntities } = await import('@/server/queries/sitemap');
  return new Response(sitemapIndexXml(env.NEXT_PUBLIC_SITE_URL, await countSitemapEntities()), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
});
