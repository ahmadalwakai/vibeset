import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors';

export function requireInternalSecret(authorization: string | null, expected: string): void {
  const candidate =
    authorization && authorization.length <= 1024
      ? /^Bearer (\S+)$/i.exec(authorization)?.[1]
      : undefined;
  const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
  const matches = timingSafeEqual(digest(candidate ?? ''), digest(expected));
  if (!candidate || !matches)
    throw new AppError('UNAUTHENTICATED', 'Invalid internal authorization');
}
