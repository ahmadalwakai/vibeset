import {
  Box,
  Grid,
  Heading,
  HStack,
  Link as ChakraLink,
  Skeleton,
  Stack,
  Text,
} from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound, unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';
import { z } from 'zod';
import { CatalogError } from '@/components/common/CatalogError';
import { EmptyState } from '@/components/common/EmptyState';
import { InAppBrowserBanner } from '@/components/common/InAppBrowserBanner';
import { TagChip } from '@/components/common/TagChip';
import { HomeRailSkeleton } from '@/components/home/HomeSections';
import { JsonLd } from '@/components/seo/JsonLd';
import { HorizontalRail } from '@/components/theme/HorizontalRail';
import { PreviewCarousel } from '@/components/theme/PreviewCarousel';
import { ThemeActionBar } from '@/components/theme/ThemeActionBar';
import { ThemeCard } from '@/components/theme/ThemeCard';
import { TrackView } from '@/components/theme/TrackView';
import { Link } from '@/i18n/navigation';
import type { ThemeCardDTO, ThemeDetailDTO } from '@/lib/dto';
import { env } from '@/lib/env.client';
import { formatCompact } from '@/lib/utils/format';
import { localized } from '@/lib/utils/localized';
import { publicSlugSchema } from '@/server/public-api';

const paramsSchema = z.object({ locale: z.enum(['en', 'ar']), slug: publicSlugSchema });

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/t/[slug]'>): Promise<Metadata> {
  await connection();
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { slug, locale } = parsed.data;
  const { getThemeDetail } = await import('@/server/queries/themes');
  const theme = await getThemeDetail(slug);
  if (!theme) notFound();
  const t = await getTranslations({ locale, namespace: 'theme.detail' });
  const name = localized(theme, locale);
  const title = t('metadataTitle', { name });
  const description = (
    localized(theme, locale, 'description') || t('metadataDescription', { name })
  ).slice(0, 200);
  const path = `${locale === 'ar' ? '/ar' : ''}/t/${theme.slug}`;
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: path,
      languages: {
        en: `/t/${theme.slug}`,
        ar: `/ar/t/${theme.slug}`,
        'x-default': `/t/${theme.slug}`,
      },
    },
    openGraph: {
      title,
      description,
      url: path,
      type: 'website',
      siteName: 'Vibeset',
      locale: locale === 'ar' ? 'ar_SA' : 'en_GB',
      alternateLocale: [locale === 'ar' ? 'en_GB' : 'ar_SA'],
      ...(theme.ogUrl
        ? { images: [{ url: theme.ogUrl, width: 1200, height: 630, alt: name }] }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(theme.ogUrl ? { images: [theme.ogUrl] } : {}),
    },
    robots: { index: true, follow: true },
  };
}

function ThemeDetailSkeleton(): ReactElement {
  return (
    <Grid
      templateColumns={{ base: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }}
      gap="10"
      py="10"
      aria-hidden
    >
      <Box
        maxW="sm"
        w="full"
        mx="auto"
        position="relative"
        aspectRatio={9 / 19.5}
        overflow="hidden"
        rounded="card"
      >
        <Skeleton position="absolute" inset="0" rounded="card" />
      </Box>
      <Stack gap="5">
        <Skeleton h="12" w="4/5" />
        <Skeleton h="5" w="1/2" />
        <Skeleton h="24" w="full" />
        <Skeleton h="12" w="full" />
      </Stack>
    </Grid>
  );
}

async function RelatedThemes({ theme }: { theme: ThemeDetailDTO }): Promise<ReactElement> {
  await connection();
  const t = await getTranslations('theme.detail');
  const aesthetic = theme.tags.find((tag) => tag.kind === 'aesthetic');
  let related: ThemeCardDTO[] | null = [];
  if (aesthetic) {
    try {
      const { getRelatedThemes } = await import('@/server/queries/themes');
      related = await getRelatedThemes({
        themeId: theme.id,
        aestheticSlug: aesthetic.slug,
        limit: 12,
      });
    } catch (error) {
      unstable_rethrow(error);
      console.error({ scope: 'theme.related', err: error });
      related = null;
    }
  }
  return (
    <Stack as="section" gap="5">
      <Heading as="h2" textStyle="display.lg">
        {t('moreLikeThis')}
      </Heading>
      {related === null ? (
        <CatalogError />
      ) : related.length ? (
        <HorizontalRail label={t('moreLikeThis')}>
          {related.map((item) => (
            <ThemeCard key={item.id} theme={item} />
          ))}
        </HorizontalRail>
      ) : (
        <EmptyState
          title={t('noRelated')}
          description={t('noRelatedDescription')}
          action={
            <ChakraLink asChild minH="11" color="brand.fg">
              <Link href="/explore">{t('explore')}</Link>
            </ChakraLink>
          }
        />
      )}
    </Stack>
  );
}

async function ThemeContent({
  params,
}: Pick<PageProps<'/[locale]/t/[slug]'>, 'params'>): Promise<ReactElement> {
  await connection();
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { slug, locale } = parsed.data;
  let theme: ThemeDetailDTO | null = null;
  let failed = false;
  try {
    const { getThemeDetail } = await import('@/server/queries/themes');
    theme = await getThemeDetail(slug);
  } catch (error) {
    unstable_rethrow(error);
    console.error({ scope: 'theme.detail', err: error });
    failed = true;
  }
  if (failed) return <CatalogError />;
  if (!theme) notFound();
  const t = await getTranslations('theme.detail');
  const name = localized(theme, locale);
  const remixOf = theme.remixOf;
  const path = `${locale === 'ar' ? '/ar' : ''}/t/${theme.slug}`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name,
    description: localized(theme, locale, 'description') || t('descriptionFallback'),
    url: new URL(path, env.NEXT_PUBLIC_SITE_URL).href,
    ...(theme.previewHomeUrl ? { image: theme.previewHomeUrl } : {}),
    keywords: theme.tags.map((tag) => localized(tag, locale)).join(', '),
    isAccessibleForFree: true,
    inLanguage: locale,
    dateModified: theme.updatedAt,
    ...(theme.publishedAt ? { datePublished: theme.publishedAt } : {}),
    ...(theme.creator
      ? {
          creator: {
            '@type': 'Person',
            name: theme.creator.displayName,
            url: new URL(
              `${locale === 'ar' ? '/ar' : ''}/c/${theme.creator.handle}`,
              env.NEXT_PUBLIC_SITE_URL,
            ).href,
          },
        }
      : {}),
  };
  return (
    <Stack
      gap={{ base: '10', md: '16' }}
      pt={{ base: '6', md: '10' }}
      pb={{ base: '24', md: '12' }}
    >
      <JsonLd data={structuredData} />
      <TrackView themeId={theme.id} />
      <InAppBrowserBanner />
      <Grid
        templateColumns={{ base: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }}
        gap={{ base: '8', md: '12' }}
        alignItems="start"
      >
        <Box position={{ md: 'sticky' }} top={{ md: '20' }} minW="0">
          <PreviewCarousel theme={theme} />
        </Box>
        <Stack gap="6" minW="0">
          <Heading as="h1" textStyle="display.xl" textWrap="balance" overflowWrap="anywhere">
            {name}
          </Heading>
          {theme.creator ? (
            <Text textStyle="body.sm" color="fg.muted">
              {t('creator')}{' '}
              <ChakraLink asChild color="brand.fg" minH="11">
                <Link href={`/c/${theme.creator.handle}`}>{theme.creator.displayName}</Link>
              </ChakraLink>
            </Text>
          ) : null}
          <Text textStyle="body.md" color="fg.muted">
            {localized(theme, locale, 'description') || t('descriptionFallback')}
          </Text>
          <HStack gap="2" flexWrap="wrap">
            {theme.tags.map((tag) => (
              <TagChip
                key={tag.slug}
                tag={tag}
                href={`/explore?tags=${encodeURIComponent(tag.slug)}`}
              />
            ))}
          </HStack>
          <HStack gap="8">
            <Stack gap="1">
              <Text textStyle="heading.md" fontVariantNumeric="tabular-nums">
                {formatCompact(theme.downloadCount, locale)}
              </Text>
              <Text textStyle="caption" color="fg.muted">
                {t('downloads')}
              </Text>
            </Stack>
            <Stack gap="1">
              <Text textStyle="heading.md" fontVariantNumeric="tabular-nums">
                {formatCompact(theme.favoriteCount, locale)}
              </Text>
              <Text textStyle="caption" color="fg.muted">
                {t('favorites')}
              </Text>
            </Stack>
          </HStack>
          {remixOf ? (
            <Text textStyle="body.sm" color="fg.muted">
              {t.rich('remixOf', {
                name: localized(remixOf, locale),
                link: (children) => (
                  <ChakraLink asChild color="brand.fg">
                    <Link href={`/t/${remixOf.slug}`}>{children}</Link>
                  </ChakraLink>
                ),
              })}
            </Text>
          ) : null}
          <ThemeActionBar theme={theme} />
        </Stack>
      </Grid>
      <Suspense fallback={<HomeRailSkeleton />}>
        <RelatedThemes theme={theme} />
      </Suspense>
    </Stack>
  );
}

export default function ThemePage({ params }: PageProps<'/[locale]/t/[slug]'>): ReactElement {
  return (
    <Suspense fallback={<ThemeDetailSkeleton />}>
      <ThemeContent params={params} />
    </Suspense>
  );
}
