import en from '../messages/en.json';
import ar from '../messages/ar.json';
import type { NativeLocale } from './preferences';

export type MessageKey = {
  [Key in keyof typeof en]: (typeof en)[Key] extends string ? Key : never;
}[keyof typeof en];
const messages: Record<NativeLocale, typeof en> = { en, ar };
export function translate(locale: NativeLocale, key: MessageKey): string {
  return messages[locale][key];
}
export function formatNumber(locale: NativeLocale, value: number): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB').format(value);
}
export function localizedName(
  locale: NativeLocale,
  value: { nameEn: string; nameAr: string | null },
): string {
  return locale === 'ar' && value.nameAr ? value.nameAr : value.nameEn;
}
