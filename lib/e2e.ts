import { z } from 'zod';

/** Pooled and direct URLs for one database have the same noncredential identity. */
export function normalizeE2eDatabaseIdentity(value: string): string {
  const url = new URL(z.url({ protocol: /^postgres(?:ql)?$/ }).parse(value));
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!url.hostname || !database) throw new TypeError('An explicit test database is required');
  return JSON.stringify([
    url.hostname.toLowerCase().replace(/-pooler(?=\.)/, ''),
    url.port || '5432',
    database,
  ]);
}
