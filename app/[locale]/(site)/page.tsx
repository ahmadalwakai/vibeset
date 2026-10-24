import { Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';
import { BrandHero } from '@/components/home/BrandHero';
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
  return {
    title: { absolute: t('title') },
    description: t('description'),
    alternates: {
      canonical: locale === 'ar' ? '/ar' : '/',
      languages: { en: '/', ar: '/ar', 'x-default': '/' },
    },
  };
}

export default function HomePage(): ReactElement {
  return (
    <Stack gap={{ base: '12', md: '16' }} pb={{ base: '12', md: '20' }}>
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
