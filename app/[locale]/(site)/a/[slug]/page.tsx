import { Box, Button, HStack, Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';
import { CatalogError } from '@/components/common/CatalogError';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { ThemeGrid } from '@/components/theme/ThemeGrid';
import { ThemeGridSkeleton } from '@/components/theme/ThemeGridSkeleton';
import { AESTHETICS } from '@/content/aesthetics';
import { Link, redirect } from '@/i18n/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { env } from '@/lib/env.client';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, collectionJsonLd } from '@/lib/structured-data';
import type { AestheticTagDTO, Paginated, ThemeCardDTO } from '@/lib/dto';
import { localized } from '@/lib/utils/localized';
import { aestheticSlugSchema, themeListQuerySchema } from '@/lib/validation/themes';

type Props = PageProps<'/[locale]/a/[slug]'>;

export function generateStaticParams(): { slug: string }[] {
  return AESTHETICS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const [{ slug }, locale, t] = await Promise.all([
    params,
    getLocale(),
    getTranslations('explore.aesthetic'),
  ]);
  if (!aestheticSlugSchema.safeParse(slug).success) notFound();
  const { getAestheticTag } = await import('@/server/queries/taxonomy');
  const tag = await getAestheticTag(slug);
  if (!tag) notFound();
  return pageMetadata({
    locale,
    path: `/a/${slug}`,
    title: localized(tag, locale),
    description: localized(tag, locale, 'description') || t('emptyDescription'),
  });
}

async function AestheticContent({ params, searchParams }: Props): Promise<ReactElement> {
  await connection();
  const [{ slug }, raw, locale, t, common] = await Promise.all([
    params,
    searchParams,
    getLocale(),
    getTranslations('explore.aesthetic'),
    getTranslations('common.pagination'),
  ]);
  if (!aestheticSlugSchema.safeParse(slug).success) notFound();
  const href = `/a/${slug}`;
  const parsed = themeListQuerySchema.safeParse({
    sort: 'trending',
    tags: [slug],
    cursor: raw.cursor,
    limit: 24,
  });
  if (!parsed.success) return redirect({ href, locale });
  let result: { tag: AestheticTagDTO | null; themes: Paginated<ThemeCardDTO> };
  try {
    const [{ getAestheticTag }, { listThemes }] = await Promise.all([
      import('@/server/queries/taxonomy'),
      import('@/server/queries/themes'),
    ]);
    const [tag, themes] = await Promise.all([getAestheticTag(slug), listThemes(parsed.data)]);
    result = { tag, themes };
  } catch {
    return <CatalogError />;
  }
  if (!result.tag) notFound();
  const nav = await getTranslations('nav');
  return (
    <Stack gap="8">
      <JsonLd
        data={collectionJsonLd({
          origin: env.NEXT_PUBLIC_SITE_URL,
          locale,
          path: href,
          name: localized(result.tag, locale),
          description: localized(result.tag, locale, 'description'),
          themes: result.themes.items,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd({
          origin: env.NEXT_PUBLIC_SITE_URL,
          locale,
          items: [
            { name: nav('home'), path: '/' },
            { name: localized(result.tag, locale), path: href },
          ],
        })}
      />
      <PageHeader
        eyebrow={t('eyebrow')}
        title={localized(result.tag, locale)}
        description={localized(result.tag, locale, 'description')}
      />
      {result.themes.items.length ? (
        <ThemeGrid themes={result.themes.items} priority />
      ) : (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Button asChild size="lg" colorPalette="brand">
              <Link href="/explore">{t('browse')}</Link>
            </Button>
          }
        />
      )}
      <HStack justify="space-between" gap="3" flexWrap="wrap">
        {parsed.data.cursor ? (
          <Button asChild size="lg" variant="outline">
            <Link href={href}>{common('first')}</Link>
          </Button>
        ) : (
          <Box />
        )}
        {result.themes.nextCursor ? (
          <Button asChild size="lg" colorPalette="brand">
            <Link href={{ pathname: href, query: { cursor: result.themes.nextCursor } }}>
              {common('next')}
            </Link>
          </Button>
        ) : null}
      </HStack>
    </Stack>
  );
}

export default function AestheticPage(props: Props): ReactElement {
  return (
    <Box py={{ base: '8', md: '12' }}>
      <Suspense
        fallback={
          <Stack gap="8">
            <Skeleton h="10" w="2/3" maxW="xl" />
            <Skeleton h="6" w="full" maxW="2xl" />
            <ThemeGridSkeleton />
          </Stack>
        }
      >
        <AestheticContent {...props} />
      </Suspense>
    </Box>
  );
}
