import { connection } from 'next/server';
import { z } from 'zod';
import { publicData, singleQueryValue } from '@/server/public-api';
import { handleRoute } from '@/server/route';

const kindSchema = z.enum(['aesthetic', 'mood', 'season', 'style']).optional();

export const GET = handleRoute(async (request: Request): Promise<Response> => {
  const kind = kindSchema.parse(singleQueryValue(new URL(request.url).searchParams, 'kind'));
  await connection();
  const { listTags } = await import('@/server/queries/taxonomy');
  return publicData(await listTags(kind));
});
