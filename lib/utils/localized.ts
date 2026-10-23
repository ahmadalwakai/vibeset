import type { Locale } from 'next-intl';

type LocalizedField = 'name' | 'title' | 'description';
type BilingualFields<Field extends LocalizedField = LocalizedField> = Partial<
  Record<`${Field}${'En' | 'Ar'}`, string | null>
>;

export function localized(obj: BilingualFields<'name'>, locale: Locale): string;
export function localized<Field extends LocalizedField>(
  obj: BilingualFields<Field>,
  locale: Locale,
  field: Field,
): string;
export function localized(
  obj: BilingualFields,
  locale: Locale,
  field: LocalizedField = 'name',
): string {
  const english = obj[`${field}En`];
  const arabic = obj[`${field}Ar`];
  const value = locale === 'ar' && arabic?.trim() ? arabic : english;

  return value?.trim() ? value : '';
}
