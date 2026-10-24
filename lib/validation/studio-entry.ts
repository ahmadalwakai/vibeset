import { z } from 'zod';
import { MAX_STUDIO_URL_LENGTH } from '../studio';
import { exportSlugSchema } from './icon-export';

export type StudioEntryQuery =
  | { kind: 'share'; value: string }
  | { kind: 'from'; slug: string }
  | { kind: 'draft' }
  | { kind: 'invalid' };
/** Only the highest-priority present entry parameter participates in validation. */
export function parseStudioEntryQuery(raw: Record<string, unknown>): StudioEntryQuery {
  if (raw.s !== undefined) {
    const result = z.string().min(1).max(MAX_STUDIO_URL_LENGTH).safeParse(raw.s);
    return result.success ? { kind: 'share', value: result.data } : { kind: 'invalid' };
  }
  if (raw.from !== undefined) {
    const result = exportSlugSchema.safeParse(raw.from);
    return result.success ? { kind: 'from', slug: result.data } : { kind: 'invalid' };
  }
  return { kind: 'draft' };
}
