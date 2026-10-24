import { AppError } from '@/server/errors';
import { requireUser } from '@/server/guards';
import { handleRoute } from '@/server/route';

export const GET = handleRoute(async (): Promise<Response> => {
  const session = await requireUser();
  const { rateLimit } = await import('@/server/rate-limit');
  if (!(await rateLimit(`account-export:${session.user.id}`, 5, 86_400)).allowed) {
    throw new AppError('RATE_LIMITED');
  }
  const { exportAccountData } = await import('@/server/services/account');
  return Response.json(
    { data: await exportAccountData(session.user.id) },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'attachment; filename="vibeset-account.json"',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
});
