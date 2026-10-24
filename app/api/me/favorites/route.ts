import { handleRoute } from '@/server/route';

export const GET = handleRoute(async (): Promise<Response> => {
  const { requireUser } = await import('@/server/guards');
  const session = await requireUser();
  const { listFavoriteIds } = await import('@/server/services/favorites');
  const themeIds = await listFavoriteIds(session.user.id);
  return Response.json(
    { data: { themeIds } },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
