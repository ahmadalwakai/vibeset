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
  const [locale, t] = await Promise.all([getLocale(), getTranslations('setup.desktop')]);
  return {
    title: { absolute: t('metadataTitle') },
    description: t('metadataDescription'),
    alternates: {
      canonical: getPathname({ locale, href: '/setup/desktop' }),
      languages: { en: '/setup/desktop', ar: '/ar/setup/desktop', 'x-default': '/setup/desktop' },
    },
  };
}
async function Guide({ locale }: { locale: Locale }): Promise<ReactElement> {
  'use cache';
  cacheLife('days');
  const t = await getTranslations({ locale, namespace: 'setup' });
  return (
    <Stack gap="8" py={{ base: '8', md: '12' }}>
      <PageHeader title={t('desktop.title')} description={t('desktop.description')} />
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="5">
        {(['save', 'mac', 'windows', 'icons'] as const).map((step, index) => (
          <StepCard key={step} number={index + 1} title={t(`desktop.steps.${step}Title`)}>
            <Text>{t(`desktop.steps.${step}Body`)}</Text>
          </StepCard>
        ))}
      </SimpleGrid>
      <Button asChild size="lg" colorPalette="brand" alignSelf="start">
        <Link href="/explore">{t('common.explore')}</Link>
      </Button>
    </Stack>
  );
}
export default async function DesktopSetupPage(): Promise<ReactElement> {
  return <Guide locale={await getLocale()} />;
}
