import type { Metadata } from 'next';
import { z } from 'zod';

export const seoLocaleSchema = z.enum(['en', 'ar']);
export type SeoLocale = z.infer<typeof seoLocaleSchema>;
export interface PageMetadataInput {
  locale: string;
  /** Unprefixed canonical pathname, without search parameters or a fragment. */
  path: string;
  title: string;
  description: string;
  image?: string | null;
  imageAlt?: string;
  noindex?: boolean;
  follow?: boolean;
  absoluteTitle?: boolean;
}
export interface CollectionSeoData {
  titleEn: string;
  titleAr: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
}
export interface CreatorSeoData {
  displayName: string;
  bio: string | null;
}

function pathname(value: string): string {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[?#\\\s\p{Cc}\p{Cf}]/u.test(value) ||
    value.length > 2048
  )
    throw new TypeError('A canonical pathname is required');
  if (value === '/ar' || value.startsWith('/ar/') || value === '/en' || value.startsWith('/en/'))
    throw new TypeError('Canonical pathnames must be unprefixed');
  return value === '/' ? value : value.replace(/\/$/, '');
}
export function localePath(locale: string, path: string): string {
  const language: SeoLocale = seoLocaleSchema.parse(locale);
  const valid = pathname(path);
  return language === 'ar' ? `/ar${valid === '/' ? '' : valid}` : valid;
}
export function languageAlternates(path: string): { en: string; ar: string; 'x-default': string } {
  return {
    en: localePath('en', path),
    ar: localePath('ar', path),
    'x-default': localePath('en', path),
  };
}
export function absolutePublicUrl(origin: string, locale: string, path: string): string {
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
    throw new TypeError('An HTTP site origin is required');
  return new URL(localePath(locale, path), base.origin).href;
}
export function pageMetadata(input: PageMetadataInput): Metadata {
  const locale = seoLocaleSchema.parse(input.locale);
  const url = localePath(locale, input.path);
  const image = input.image || `/og/brand-${locale}.jpg`;
  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical: url, languages: languageAlternates(input.path) },
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      type: 'website',
      siteName: 'Vibeset',
      locale: locale === 'ar' ? 'ar_SA' : 'en_GB',
      alternateLocale: [locale === 'ar' ? 'en_GB' : 'ar_SA'],
      images: [{ url: image, width: 1200, height: 630, alt: input.imageAlt || input.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: [image],
    },
    robots: { index: !input.noindex, follow: input.follow ?? !input.noindex },
  };
}
