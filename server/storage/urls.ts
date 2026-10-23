import 'server-only';

import { cdnUrl as publicCdnUrl } from '../../lib/utils/cdn';

export function cdnUrl(key: string): string {
  return publicCdnUrl(key);
}
