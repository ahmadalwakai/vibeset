import { z } from 'zod';
import { isCacheTag } from '@/lib/cache-tags';
import { invalidate } from '@/server/cache';
import { requireInternalSecret } from '@/server/internal-auth';
import { readJsonBody } from '@/server/request-body';
import { handleRoute } from '@/server/route';

const inputSchema = z.strictObject({
  tags: z.array(z.string().max(256).refine(isCacheTag)).max(200),
});

export const POST = handleRoute(async (request: Request): Promise<Response> => {
  const { env } = await import('@/lib/env.server');
  requireInternalSecret(request.headers.get('authorization'), env.INTERNAL_API_SECRET);
  const { tags } = inputSchema.parse(await readJsonBody(request));
  invalidate(tags, 'revalidate');
  return Response.json(
    { data: { revalidated: new Set(tags).size } },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
