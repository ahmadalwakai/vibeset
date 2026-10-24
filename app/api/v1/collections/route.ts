import { connection } from 'next/server';
import { publicData } from '@/server/public-api';
import { handleRoute } from '@/server/route';

export const GET = handleRoute(async (): Promise<Response> => {
  await connection();
  const { listPublicCollections } = await import('@/server/queries/collections');
  return publicData(await listPublicCollections());
});
