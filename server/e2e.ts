import 'server-only';

import { createHash } from 'node:crypto';
import { normalizeE2eDatabaseIdentity } from '../lib/e2e';

/** Exposes no credential or connection URL; only rendered when test auth is enabled. */
export function fingerprintE2eDatabase(url: string): string {
  return createHash('sha256').update(normalizeE2eDatabaseIdentity(url), 'utf8').digest('hex');
}
