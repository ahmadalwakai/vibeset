import { z } from 'zod';
import { themeSpecSchema } from '../render/spec';
import { MAX_STUDIO_DRAFT_LENGTH, STUDIO_DRAFT_KEY, type StudioDraft } from '../studio';
import { exportSlugSchema } from '../validation/icon-export';

export const studioDraftSchema = z.strictObject({
  v: z.literal(1),
  spec: themeSpecSchema,
  sourceSlug: exportSlugSchema.nullable(),
});

let volatileDraft: StudioDraft | null = null;

export function readStudioDraft(): StudioDraft | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STUDIO_DRAFT_KEY);
  } catch {
    return volatileDraft ? studioDraftSchema.parse(volatileDraft) : null;
  }
  if (!raw || raw.length > MAX_STUDIO_DRAFT_LENGTH) {
    volatileDraft = null;
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    const parsed = studioDraftSchema.safeParse(value);
    volatileDraft = parsed.success ? parsed.data : null;
    return volatileDraft ? studioDraftSchema.parse(volatileDraft) : null;
  } catch {
    volatileDraft = null;
    return null;
  }
}

export function writeStudioDraft(draft: StudioDraft): void {
  const parsed = studioDraftSchema.parse(draft);
  const serialized = JSON.stringify(parsed);
  if (serialized.length > MAX_STUDIO_DRAFT_LENGTH)
    throw new RangeError('Studio draft is too large');
  volatileDraft = parsed;
  try {
    localStorage.setItem(STUDIO_DRAFT_KEY, serialized);
  } catch {
    /* Keep the current draft in this tab when storage is unavailable. */
  }
}
