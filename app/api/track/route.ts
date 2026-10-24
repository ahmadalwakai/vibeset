import { trackInputSchema } from '@/lib/validation/track';
import { readJsonBody } from '@/server/request-body';
import { handleRoute } from '@/server/route';

export const POST = handleRoute(async (request: Request): Promise<Response> => {
  const input = trackInputSchema.parse(await readJsonBody(request, 1024));
  const [{ getClientIp }, { hashAuthIdentifier }, { rateLimit }] = await Promise.all([
    import('@/server/request'),
    import('@/server/auth-privacy'),
    import('@/server/rate-limit'),
  ]);
  const ipHash = hashAuthIdentifier(getClientIp(request.headers) ?? 'unknown');
  const admission = await rateLimit(`track:${ipHash}`, 120, 60);
  if (admission.allowed) {
    const { trackThemeEvent } = await import('@/server/services/theme-track');
    await trackThemeEvent(input);
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
});
