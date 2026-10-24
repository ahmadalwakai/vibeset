import * as z from 'zod/mini';
import { creatorHandleSchema } from '../../lib/validation/creator';
import type { ThemeCardDTO } from './api';

export const MAX_BLOCKED_CREATORS = 500;
export const publicCreatorHandleSchema = z
  .string()
  .check(z.refine((value) => creatorHandleSchema.safeParse(value).success));
export const blockedCreatorSchema = z.strictObject({
  handle: publicCreatorHandleSchema,
  displayName: z.string().check(z.minLength(1), z.maxLength(120)),
});
export const blockedCreatorsSchema = z.pipe(
  z.array(blockedCreatorSchema).check(z.maxLength(MAX_BLOCKED_CREATORS)),
  z.transform((values) => {
    const seen = new Set<string>();
    return values.filter(({ handle }) => {
      if (seen.has(handle)) return false;
      seen.add(handle);
      return true;
    });
  }),
);
export type BlockedCreator = Readonly<z.infer<typeof blockedCreatorSchema>>;

/** Derive visibility from the current preference, including for late/cached pages. */
export function isCreatorBlocked(
  theme: Pick<ThemeCardDTO, 'creator'>,
  blocked: readonly BlockedCreator[],
): boolean {
  return theme.creator !== null && blocked.some(({ handle }) => handle === theme.creator?.handle);
}

export function isThemeHidden(
  theme: Pick<ThemeCardDTO, 'id' | 'creator'>,
  blocked: readonly BlockedCreator[],
  hiddenThemeIds: readonly string[],
): boolean {
  return hiddenThemeIds.includes(theme.id) || isCreatorBlocked(theme, blocked);
}

export function visibleCreatorThemes<T extends Pick<ThemeCardDTO, 'id' | 'creator'>>(
  themes: readonly T[],
  blocked: readonly BlockedCreator[],
  hiddenThemeIds: readonly string[] = [],
): T[] {
  const handles = new Set(blocked.map(({ handle }) => handle));
  const hidden = new Set(hiddenThemeIds);
  return themes.filter(
    (theme) =>
      !hidden.has(theme.id) && (theme.creator === null || !handles.has(theme.creator.handle)),
  );
}
