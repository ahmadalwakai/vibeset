import type { Locale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { nextPathSchema } from '@/lib/validation/auth';

export function safeNextPath(value: unknown): string {
  const result = nextPathSchema.safeParse(value);
  if (!result.success) return '/';
  const parsed = new URL(result.data, 'https://vibeset.invalid');
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function unlocalizeNextPath(value: unknown): string {
  const path = safeNextPath(value);
  const parsed = new URL(path, 'https://vibeset.invalid');
  const segments = parsed.pathname.split('/');
  if (routing.locales.some((locale) => locale === segments[1])) segments.splice(1, 1);
  return safeNextPath(`${segments.join('/') || '/'}${parsed.search}${parsed.hash}`);
}

export function localizeNextPath(value: unknown, locale: Locale): string {
  const path = unlocalizeNextPath(value);
  if (locale === routing.defaultLocale) return path;
  return `/${locale}${path === '/' || path.startsWith('/?') || path.startsWith('/#') ? path.slice(1) : path}`;
}
