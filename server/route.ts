import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { HTTP_STATUS } from '@/lib/result';
import { AppError } from './errors';

export function handleRoute<Arguments extends unknown[]>(
  handler: (...arguments_: Arguments) => Promise<Response>,
): (...arguments_: Arguments) => Promise<Response> {
  return async (...arguments_: Arguments): Promise<Response> => {
    try {
      return await handler(...arguments_);
    } catch (error) {
      unstable_rethrow(error);
      const appError =
        error instanceof AppError
          ? error
          : error instanceof z.ZodError
            ? new AppError('VALIDATION', 'Invalid input')
            : new AppError('INTERNAL', 'An internal error occurred');
      if (appError.code === 'INTERNAL') console.error({ scope: 'route', err: error });
      return Response.json(
        { error: { code: appError.code, message: appError.message } },
        { status: HTTP_STATUS[appError.code], headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
  };
}
