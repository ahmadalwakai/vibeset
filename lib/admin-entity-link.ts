import { z } from 'zod';

/** Only known admin destinations are linked; arbitrary audit metadata never becomes a URL. */
export function adminEntityLink(type: string, id: string | null): string | null {
  if (!id) return null;
  if (type === 'setting' && ['home.hero', 'home.announcement', 'features'].includes(id))
    return '/admin/settings';
  if (!z.uuid().length(36).safeParse(id).success) return null;
  if (type === 'theme') return `/admin/themes/${id.toLowerCase()}`;
  if (type === 'collection') return `/admin/collections/${id.toLowerCase()}`;
  if (type === 'generation_run') return `/admin/review?run=${id.toLowerCase()}`;
  return null;
}
