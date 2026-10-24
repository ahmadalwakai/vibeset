import { CacheTags } from '@/lib/cache-tags';
import type { MaintenanceSummary } from '@/lib/maintenance';
import { invalidate } from '@/server/cache';
import { AppError } from '@/server/errors';
import { requireInternalSecret } from '@/server/internal-auth';
import { handleRoute } from '@/server/route';

export const maxDuration = 60;

export const GET = handleRoute(async (request: Request): Promise<Response> => {
  const { env } = await import('@/lib/env.server');
  requireInternalSecret(request.headers.get('authorization'), env.CRON_SECRET);
  const { runDailyMaintenance, MaintenanceIncompleteError } =
    await import('@/server/services/maintenance');
  const started = Date.now();
  let complete: MaintenanceSummary | null = null;
  try {
    // Route callers cannot provide maintenance scope or asOf overrides.
    const result = await runDailyMaintenance();
    complete = result.data;
    return Response.json(
      { data: result.data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error({
      scope: 'cron.daily',
      complete: false,
      ...(error instanceof MaintenanceIncompleteError
        ? { phase: error.phase, ...error.summary }
        : {}),
      durationMs: Date.now() - started,
    });
    throw error instanceof AppError
      ? error
      : new AppError('INTERNAL', 'Daily maintenance did not finish');
  } finally {
    // Prior batches may already have committed even when a later batch times out.
    try {
      invalidate([CacheTags.themes], 'revalidate');
    } catch {
      console.error({ scope: 'cron.daily.invalidate', code: 'INTERNAL' });
      throw new AppError('INTERNAL', 'Maintenance cache refresh failed');
    }
    if (complete)
      // eslint-disable-next-line no-console -- Daily cron emits the required structured success summary.
      console.info({
        scope: 'cron.daily',
        complete: true,
        ...complete,
        durationMs: Date.now() - started,
      });
  }
});
