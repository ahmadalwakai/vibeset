import { Button, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { StepCard } from '@/components/setup/StepCard';
import { getPathname, Link } from '@/i18n/navigation';
import { cacheLife } from '@/server/cache';

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('setup.android')]);
  return {
    title: { absolute: t('metadataTitle') },
    description: t('metadataDescription'),
    alternates: {
      canonical: getPathname({ locale, href: '/setup/android' }),
      languages: { en: '/setup/android', ar: '/ar/setup/android', 'x-default': '/setup/android' },
    },
  };
}
async function Guide({ locale }: { locale: Locale }): Promise<ReactElement> {
  'use cache';
  cacheLife('days');
  const t = await getTranslations({ locale, namespace: 'setup' });
  return (
    <Stack gap="8" py={{ base: '8', md: '12' }}>
      <PageHeader title={t('android.title')} description={t('android.description')} />
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="5">
        {(['save', 'wallpaper', 'icons', 'customize'] as const).map((step, index) => (
          <StepCard key={step} number={index + 1} title={t(`android.steps.${step}Title`)}>
            <Text>{t(`android.steps.${step}Body`)}</Text>
          </StepCard>
        ))}
      </SimpleGrid>
      <Button asChild size="lg" colorPalette="brand" alignSelf="start">
        <Link href="/explore">{t('common.explore')}</Link>
      </Button>
    </Stack>
  );
}
export default async function AndroidSetupPage(): Promise<ReactElement> {
  return <Guide locale={await getLocale()} />;
}
