import type { ThemeCardDTO } from './dto';
import { absolutePublicUrl, seoLocaleSchema } from './seo';
import { localized } from './utils/localized';

export function homeJsonLd(input: {
  origin: string;
  locale: string;
  name: string;
  description: string;
}): Record<string, unknown> {
  const locale = seoLocaleSchema.parse(input.locale);
  const home = absolutePublicUrl(input.origin, locale, '/');
  const root = absolutePublicUrl(input.origin, 'en', '/');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${root}#organization`,
        name: 'Vibeset',
        url: root,
        logo: new URL('/icons/icon-512.png', root).href,
      },
      {
        '@type': 'WebSite',
        '@id': `${home}#website`,
        name: input.name,
        description: input.description,
        url: home,
        inLanguage: locale,
        publisher: { '@id': `${root}#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${absolutePublicUrl(input.origin, locale, '/explore')}?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
}
export function breadcrumbJsonLd(input: {
  origin: string;
  locale: string;
  items: readonly { name: string; path: string }[];
}): Record<string, unknown> {
  const locale = seoLocaleSchema.parse(input.locale);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: input.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absolutePublicUrl(input.origin, locale, item.path),
    })),
  };
}
export function collectionJsonLd(input: {
  origin: string;
  locale: string;
  path: string;
  name: string;
  description?: string | null;
  themes: readonly ThemeCardDTO[];
}): Record<string, unknown> {
  const locale = seoLocaleSchema.parse(input.locale);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    url: absolutePublicUrl(input.origin, locale, input.path),
    inLanguage: locale,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: input.themes.length,
      itemListElement: input.themes.map((theme, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'CreativeWork',
          name: localized(theme, locale),
          url: absolutePublicUrl(input.origin, locale, `/t/${theme.slug}`),
          ...(theme.thumbUrl ? { image: theme.thumbUrl } : {}),
        },
      })),
    },
  };
}
