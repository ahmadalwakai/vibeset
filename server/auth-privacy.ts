import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { env } from '../lib/env.server';

const identifierSchema = z.string().min(1);

export function hashAuthIdentifier(value: string): string {
  return createHash('sha256')
    .update(identifierSchema.parse(value))
    .update(env.IP_HASH_SALT)
    .digest('hex');
}
