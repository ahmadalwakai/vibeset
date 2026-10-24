import { listRemixesSchema } from '@/lib/validation/account';
import { handleRoute } from '@/server/route';

export const GET = handleRoute(async (request: Request): Promise<Response> => {
  const query = listRemixesSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const { listMyRemixes } = await import('@/server/admin-queries/user');
  return Response.json(
    { data: await listMyRemixes(query) },
    {
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
});
