import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import type { ActionAuth, ActionContext, AuthSession, CreatorProfile } from '@/lib/auth';
import type { ActionResult } from '@/lib/result';
import type { FeaturesSetting } from '@/lib/settings';
import { AppError } from './errors';
import { getSession, requireAdmin, requireCreator, requireUser } from './guards';
import { getIpHash } from './request';
import { rateLimit as consumeRateLimit } from './rate-limit';
import { getFeatures } from './services/settings';

interface ActionOptions<Schema extends z.ZodType, Level extends ActionAuth, Output> {
  input: Schema;
  auth: Level;
  feature?: keyof FeaturesSetting;
  rateLimit?: {
    key: (context: ActionContext<Level>) => string;
    limit: number;
    windowSec: number;
  };
  handler: (input: z.output<Schema>, context: ActionContext<Level>) => Promise<Output>;
}

async function authorize(level: ActionAuth): Promise<{
  session: AuthSession | null;
  creator: CreatorProfile | null;
}> {
  if (level === 'creator') {
    const { creator, ...session } = await requireCreator();
    return { session, creator };
  }
  if (level === 'admin') return { session: await requireAdmin(), creator: null };
  if (level === 'user') return { session: await requireUser(), creator: null };
  const session = await getSession();
  if (session?.user.banned) throw new AppError('FORBIDDEN');
  return { session, creator: null };
}

export function createAction<Schema extends z.ZodType, Level extends ActionAuth, Output>(
  options: ActionOptions<Schema, Level, Output>,
): (raw: unknown) => Promise<ActionResult<Output>> {
  return async (raw: unknown): Promise<ActionResult<Output>> => {
    try {
      const parsed = options.input.safeParse(raw);
      if (!parsed.success) {
        const flattened = z.flattenError(parsed.error);
        const fieldErrors = Object.fromEntries(
          Object.entries(flattened.fieldErrors).filter((entry): entry is [string, string[]] =>
            Array.isArray(entry[1]),
          ),
        );
        return {
          ok: false,
          error: { code: 'VALIDATION', message: 'Invalid input', fieldErrors },
        };
      }

      const { session, creator } = await authorize(options.auth);
      const context = {
        session: session?.session ?? null,
        user: session?.user ?? null,
        creator,
        ipHash: await getIpHash(),
      } as ActionContext<Level>;

      if (options.feature && !(await getFeatures())[options.feature]) {
        throw new AppError('FEATURE_DISABLED');
      }
      if (options.rateLimit) {
        const { key, limit, windowSec } = options.rateLimit;
        if (!(await consumeRateLimit(key(context), limit, windowSec)).allowed) {
          throw new AppError('RATE_LIMITED');
        }
      }

      return { ok: true, data: await options.handler(parsed.data, context) };
    } catch (error) {
      unstable_rethrow(error);
      if (error instanceof AppError) {
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
          },
        };
      }
      console.error({ scope: 'action', err: error });
      return { ok: false, error: { code: 'INTERNAL', message: 'An internal error occurred' } };
    }
  };
}
