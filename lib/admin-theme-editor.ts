import type { AdminThemeEditorDTO } from './admin';
import { TRANSITIONS } from './theme-status';
import type { ThemeSource, ThemeStatus } from './theme-status';
import type { AdminUpdateThemeInput } from './validation/admin-themes';

export interface AdminThemeDetails {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  tagSlugs: string[];
  isFeatured: boolean;
}
export function adminDetailsFromTheme(theme: AdminThemeEditorDTO): AdminThemeDetails {
  return {
    nameEn: theme.nameEn,
    nameAr: theme.nameAr ?? '',
    descriptionEn: theme.descriptionEn ?? '',
    descriptionAr: theme.descriptionAr ?? '',
    tagSlugs: theme.tags.map((tag) => tag.slug),
    isFeatured: theme.isFeatured,
  };
}
/** Tags are an unordered set in persistence, so reselecting them cannot create unsaved work. */
export function adminEditorInputsEqual(
  left: AdminUpdateThemeInput,
  right: AdminUpdateThemeInput,
): boolean {
  return (
    JSON.stringify({ ...left, tagSlugs: [...left.tagSlugs].sort() }) ===
    JSON.stringify({ ...right, tagSlugs: [...right.tagSlugs].sort() })
  );
}
/** UI candidates mirror shared edges; every mutation still verifies current DB authority. */
export function adminEditorTransitions(
  theme: { status: ThemeStatus; source: ThemeSource; ownerId: string | null },
  actor: { userId: string; isCreator: boolean },
): ThemeStatus[] {
  const owner = theme.ownerId === actor.userId;
  return TRANSITIONS.filter(
    (rule) =>
      rule.from === theme.status &&
      (rule.permission === 'admin' ||
        (owner && (rule.permission === 'owner' || actor.isCreator))) &&
      !(rule.to === 'pending_review' && theme.source !== 'creator' && theme.source !== 'remix') &&
      !(
        theme.status === 'draft' &&
        rule.to === 'approved' &&
        theme.source !== 'generated' &&
        theme.source !== 'admin'
      ),
  ).map((rule) => rule.to);
}
