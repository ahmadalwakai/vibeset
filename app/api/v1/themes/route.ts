import { connection } from 'next/server';
import { themeListQuerySchema } from '@/lib/validation/themes';
import { publicData } from '@/server/public-api';
import { handleRoute } from '@/server/route';

export const GET = handleRoute(async (request: Request): Promise<Response> => {
  const query = themeListQuerySchema.parse(new URL(request.url).searchParams);
  await connection();
  const { listThemes } = await import('@/server/queries/themes');
  return publicData(await listThemes(query));
});
