import { reportResponseSchema, submitReportSchema } from '@/lib/validation/reports';
import { AppError } from '@/server/errors';
import { readJsonBody } from '@/server/request-body';
import { handleRoute } from '@/server/route';

export const POST = handleRoute(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new AppError('FORBIDDEN');
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    throw new AppError('VALIDATION');
  const input = submitReportSchema.parse(await readJsonBody(request, 8192));
  // Reuse the website's complete public admission policy: optional fresh session,
  // ban check, feature flag and the same user-or-salted-IP five-per-hour budget.
  const { submitReport } = await import('@/server/actions/reports');
  const result = await submitReport(input);
  if (!result.ok) throw new AppError(result.error.code);
  const response = reportResponseSchema.safeParse({ data: result.data });
  if (!response.success) throw new AppError('INTERNAL');
  return Response.json(response.data, { headers: { 'Cache-Control': 'private, no-store' } });
});
