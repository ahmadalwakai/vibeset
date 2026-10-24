'use server';

import type { ActionResult } from '../../lib/result';
import { submitReportSchema } from '../../lib/validation/reports';
import type { ReportData } from '../../lib/validation/reports';

export async function submitReport(raw: unknown): Promise<ActionResult<ReportData>> {
  const { createAction } = await import('../action');
  return createAction({
    input: submitReportSchema,
    auth: 'public',
    feature: 'reportsEnabled',
    rateLimit: {
      key: (context): string =>
        context.user ? `report:user:${context.user.id}` : `report:ip:${context.ipHash}`,
      limit: 5,
      windowSec: 3600,
    },
    handler: async (input, context) => {
      const service = await import('../services/reports');
      const result = await service.submitReport(
        input,
        context.user
          ? { kind: 'user', userId: context.user.id }
          : { kind: 'visitor', ipHash: context.ipHash },
      );
      return result.data;
    },
  })(raw);
}
