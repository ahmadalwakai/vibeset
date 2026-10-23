import { env } from '../env.client';
import { storageKeySchema } from '../validation/storage';

export function cdnUrl(key: string): string {
  const validKey = storageKeySchema.parse(key);
  const base = new URL(env.NEXT_PUBLIC_CDN_URL);
  if (
    !['https:', 'http:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new TypeError('CDN URL must be HTTP(S) without credentials, a query or a fragment');
  }
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;
  return new URL(validKey.split('/').map(encodeURIComponent).join('/'), base).href;
}
