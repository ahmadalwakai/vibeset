import { connection } from 'next/server';
import { env } from '@/lib/env.client';
import { parseSitemapShard, SITEMAP_ENTITY_LIMIT, sitemapShardXml } from '@/lib/sitemap';
import { AppError } from '@/server/errors';
import { handleRoute } from '@/server/route';

export const GET = handleRoute(
  async (_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> => {
    await connection();
    const id = parseSitemapShard((await context.params).id);
    if (id === null) throw new AppError('NOT_FOUND');
    const { countSitemapEntities, readSitemapEntities } = await import('@/server/queries/sitemap');
    const count = await countSitemapEntities();
    if (id >= Math.max(1, Math.ceil(count / SITEMAP_ENTITY_LIMIT))) throw new AppError('NOT_FOUND');
    return new Response(sitemapShardXml(env.NEXT_PUBLIC_SITE_URL, await readSitemapEntities(id)), {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  },
);
