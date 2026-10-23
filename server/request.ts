import 'server-only';

import { isIP } from 'node:net';
import { headers } from 'next/headers';
import { z } from 'zod';
import { hashAuthIdentifier } from './auth-privacy';

const ipSchema = z
  .string()
  .trim()
  .refine((value) => isIP(value) !== 0);

export function getClientIp(requestHeaders: Headers): string | null {
  const firstHop = requestHeaders.get('x-forwarded-for')?.split(',')[0];
  const forwarded = ipSchema.safeParse(firstHop);
  if (forwarded.success) return forwarded.data;
  const real = ipSchema.safeParse(requestHeaders.get('x-real-ip'));
  return real.success ? real.data : null;
}

export async function getIpHash(): Promise<string> {
  return hashAuthIdentifier(getClientIp(await headers()) ?? 'unknown');
}
