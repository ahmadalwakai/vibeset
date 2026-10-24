import { describe, expect, it } from 'vitest';
import type { ThemeCardDTO } from '../../lib/dto';
import { absolutePublicUrl, languageAlternates, localePath, pageMetadata } from '../../lib/seo';
import { breadcrumbJsonLd, collectionJsonLd, homeJsonLd } from '../../lib/structured-data';
import {
  escapeXml,
  parseSitemapShard,
  SITEMAP_ENTITY_LIMIT,
  sitemapIndexXml,
  sitemapShardXml,
} from '../../lib/sitemap';
import { serializeJsonLd } from '../../lib/utils/json-ld';

describe('locale-aware metadata', () => {
  it('uses as-needed English paths and explicit Arabic paths, including the root', () => {
    expect(languageAlternates('/')).toEqual({ en: '/', ar: '/ar', 'x-default': '/' });
    expect(languageAlternates('/t/moon')).toEqual({
      en: '/t/moon',
      ar: '/ar/t/moon',
      'x-default': '/t/moon',
    });
    expect(localePath('en', '/explore/')).toBe('/explore');
    expect(absolutePublicUrl('https://vibeset.example/base', 'ar', '/collections/summer')).toBe(
      'https://vibeset.example/ar/collections/summer',
    );
  });
  it.each([
    '//evil.example',
    'relative',
    '/ar/explore',
    '/en/explore',
    '/explore?q=private',
    '/studio#spec',
    '/t/bad\n',
    '/t/\\evil',
  ])('rejects noncanonical path %j', (path) => {
    expect(() => localePath('en', path)).toThrow(TypeError);
  });
  it('sets localized fallback images and removes Home alternates from child pages', () => {
    const metadata = pageMetadata({
      locale: 'ar',
      path: '/explore',
      title: 'استكشف',
      description: 'ألوان جديدة',
    });
    expect(metadata.alternates).toEqual({
      canonical: '/ar/explore',
      languages: { en: '/explore', ar: '/ar/explore', 'x-default': '/explore' },
    });
    expect(metadata.openGraph).toMatchObject({
      url: '/ar/explore',
      locale: 'ar_SA',
      images: [{ url: '/og/brand-ar.jpg', width: 1200, height: 630 }],
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      images: ['/og/brand-ar.jpg'],
    });
  });
  it('retains actual theme OG and explicitly supports noindex private/share routes', () => {
    expect(
      pageMetadata({
        locale: 'en',
        path: '/t/moon',
        title: 'Moon',
        description: 'Calm',
        image: 'https://cdn.example/og.jpg',
        absoluteTitle: true,
      }),
    ).toMatchObject({
      title: { absolute: 'Moon' },
      twitter: { images: ['https://cdn.example/og.jpg'] },
    });
    expect(
      pageMetadata({
        locale: 'en',
        path: '/studio',
        title: 'Studio',
        description: 'Create',
        noindex: true,
        follow: true,
      }).robots,
    ).toEqual({ index: false, follow: true });
    expect(
      pageMetadata({
        locale: 'ar',
        path: '/admin/users',
        title: 'المستخدمون',
        description: 'الإدارة',
        noindex: true,
      }).robots,
    ).toEqual({ index: false, follow: false });
  });
});

describe('safe structured data', () => {
  it('validates locale even for empty lists and uses the parsed locale for item names', () => {
    expect(() =>
      breadcrumbJsonLd({ origin: 'https://vibeset.example', locale: 'fr', items: [] }),
    ).toThrow();
    expect(() =>
      collectionJsonLd({
        origin: 'https://vibeset.example',
        locale: 'fr',
        path: '/collections/summer',
        name: 'Summer',
        themes: [],
      }),
    ).toThrow();
    const theme: ThemeCardDTO = {
      id: '0c4a1c48-b8a6-4ab8-90a8-ec192eeed2c2',
      slug: 'moon',
      nameEn: 'Moon',
      nameAr: 'القمر',
      thumbUrl: null,
      dominantColor: null,
      tags: [],
      isFeatured: false,
      downloadCount: 0,
      favoriteCount: 0,
      creator: null,
      publishedAt: null,
    };
    expect(
      collectionJsonLd({
        origin: 'https://vibeset.example',
        locale: 'ar',
        path: '/collections/summer',
        name: 'الصيف',
        themes: [theme],
      }),
    ).toMatchObject({
      inLanguage: 'ar',
      mainEntity: {
        itemListElement: [{ item: { name: 'القمر', url: 'https://vibeset.example/ar/t/moon' } }],
      },
    });
  });
  it('links localized search and stable organization identities without duplicating the Arabic prefix', () => {
    const graph = homeJsonLd({
      origin: 'https://vibeset.example',
      locale: 'ar',
      name: 'Vibeset',
      description: 'اصنع ثيمك',
    });
    const text = JSON.stringify(graph);
    expect(text).toContain('https://vibeset.example/ar/explore?q={search_term_string}');
    expect(text).toContain('https://vibeset.example/#organization');
    expect(text).not.toContain('/ar/ar');
  });
  it('builds absolute breadcrumbs and localized collection lists, with script-safe serialization', () => {
    const graph = breadcrumbJsonLd({
      origin: 'https://vibeset.example',
      locale: 'ar',
      items: [
        { name: 'الرئيسية', path: '/' },
        { name: '</script>', path: '/a/moon' },
      ],
    });
    expect(graph.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: 'https://vibeset.example/ar' },
      {
        '@type': 'ListItem',
        position: 2,
        name: '</script>',
        item: 'https://vibeset.example/ar/a/moon',
      },
    ]);
    expect(serializeJsonLd(graph)).not.toContain('<');
    const list = collectionJsonLd({
      origin: 'https://vibeset.example',
      locale: 'en',
      path: '/collections/summer',
      name: 'Summer',
      themes: [],
    });
    expect(list).toMatchObject({
      '@type': 'CollectionPage',
      mainEntity: { '@type': 'ItemList', numberOfItems: 0, itemListElement: [] },
    });
  });
});

describe('bounded bilingual sitemap XML', () => {
  it('splits by URL entries, counting both locales of every entity', () => {
    expect(
      sitemapIndexXml('https://vibeset.example', SITEMAP_ENTITY_LIMIT).match(/<sitemap>/g),
    ).toHaveLength(1);
    expect(
      sitemapIndexXml('https://vibeset.example', SITEMAP_ENTITY_LIMIT + 1).match(/<sitemap>/g),
    ).toHaveLength(2);
    expect(sitemapIndexXml('https://vibeset.example', 0)).toContain('/sitemap/0.xml');
    expect(() =>
      sitemapShardXml(
        'https://vibeset.example',
        Array.from({ length: SITEMAP_ENTITY_LIMIT + 1 }, () => ({ path: '/', lastModified: null })),
      ),
    ).toThrow(RangeError);
  });
  it('emits both locale locations, x-default and UTC lastmod without losing microseconds', () => {
    const xml = sitemapShardXml('https://vibeset.example', [
      { path: '/t/moon', lastModified: '2026-10-24T12:00:00.123456Z' },
    ]);
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml).toContain('<loc>https://vibeset.example/ar/t/moon</loc>');
    expect(xml).toContain('hreflang="x-default" href="https://vibeset.example/t/moon"');
    expect(xml).toContain('<lastmod>2026-10-24T12:00:00.123456Z</lastmod>');
    expect(escapeXml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;');
  });
  it.each([
    '-1.xml',
    '01.xml',
    '1',
    '1.xml\n',
    '1.0.xml',
    '2147483648.xml',
    '../1.xml',
    '',
    '1e2.xml',
  ])('rejects malformed shard %j', (value) => expect(parseSitemapShard(value)).toBeNull());
  it('parses only bounded canonical numeric XML shard names', () => {
    expect(parseSitemapShard('0.xml')).toBe(0);
    expect(parseSitemapShard('2147483647.xml')).toBe(2147483647);
  });
});
