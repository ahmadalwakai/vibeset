import 'server-only';

import { z } from 'zod';
import { AppError } from './errors';

export const PUBLIC_API_CACHE = 'public, s-maxage=300, stale-while-revalidate=86400';
export const publicSlugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .refine((value) => !/\s/.test(value));

export function publicData<T>(data: T): Response {
  return Response.json({ data }, { headers: { 'Cache-Control': PUBLIC_API_CACHE } });
}

export function singleQueryValue(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name);
  if (values.length > 1) throw new AppError('VALIDATION', 'Query parameter must occur only once');
  return values[0];
}
