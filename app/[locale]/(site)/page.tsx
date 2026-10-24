import { Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';
import { BrandHero } from '@/components/home/BrandHero';
import { JsonLd } from '@/components/seo/JsonLd';
import { env } from '@/lib/env.client';
import { pageMetadata } from '@/lib/seo';
import { homeJsonLd } from '@/lib/structured-data';
import {
  HomeAesthetics,
  HomeAestheticsSkeleton,
  HomeCollections,
  HomeCollectionsSkeleton,
  HomeHero,
  HomeRailSkeleton,
  HomeStudioCta,
  HomeThemeRail,
} from '@/components/home/HomeSections';

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('home.metadata')]);
  return pageMetadata({
    locale,
    path: '/',
    title: t('title'),
    description: t('description'),
    absoluteTitle: true,
  });
}

export default async function HomePage(): Promise<ReactElement> {
  const [locale, t, common] = await Promise.all([
    getLocale(),
    getTranslations('home.metadata'),
    getTranslations('common'),
  ]);
  return (
    <Stack gap={{ base: '12', md: '16' }} pb={{ base: '12', md: '20' }}>
      <JsonLd
        data={homeJsonLd({
          origin: env.NEXT_PUBLIC_SITE_URL,
          locale,
          name: common('brandName'),
          description: t('description'),
        })}
      />
      <Suspense fallback={<BrandHero />}>
        <HomeHero />
      </Suspense>
      <Suspense fallback={<HomeRailSkeleton />}>
        <HomeThemeRail sort="trending" />
      </Suspense>
      <Suspense fallback={<HomeAestheticsSkeleton />}>
        <HomeAesthetics />
      </Suspense>
      <Suspense fallback={<HomeRailSkeleton />}>
        <HomeThemeRail sort="new" />
      </Suspense>
      <Suspense fallback={<HomeCollectionsSkeleton />}>
        <HomeCollections />
      </Suspense>
      <HomeStudioCta />
    </Stack>
  );
}
