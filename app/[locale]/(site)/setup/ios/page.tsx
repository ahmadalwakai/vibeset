import { Box, Stack, Steps, Text } from '@chakra-ui/react';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { IosSetupWizard, SetupWizardSkeleton } from '@/components/setup/IosSetupWizard';
import { getPathname } from '@/i18n/navigation';
import { cacheLife } from '@/server/cache';

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('setup.ios')]);
  return {
    title: { absolute: t('metadataTitle') },
    description: t('metadataDescription'),
    alternates: {
      canonical: getPathname({ locale, href: '/setup/ios' }),
      languages: { en: '/setup/ios', ar: '/ar/setup/ios', 'x-default': '/setup/ios' },
    },
  };
}
async function SetupIntro({ locale }: { locale: Locale }): Promise<ReactElement> {
  'use cache';
  cacheLife('days');
  const t = await getTranslations({ locale, namespace: 'setup' });
  const intro = ['save', 'shortcuts', 'hide', 'wallpaper'] as const;
  return (
    <Stack gap="5">
      <PageHeader title={t('ios.title')} description={t('ios.description')} />
      <Steps.Root count={4} defaultStep={0} colorPalette="brand" orientation="vertical">
        <Steps.List>
          {intro.map((step, index) => (
            <Steps.Item key={step} index={index}>
              <Steps.Trigger minH="11" textAlign="start">
                <Steps.Indicator>
                  <Steps.Number />
                </Steps.Indicator>
                <Steps.Title>{t(`intro.${step}Title`)}</Steps.Title>
              </Steps.Trigger>
              <Steps.Separator />
            </Steps.Item>
          ))}
        </Steps.List>
        {intro.map((step, index) => (
          <Steps.Content key={step} index={index}>
            <Text textStyle="body.md" color="fg.muted">
              {t(`intro.${step}Body`)}
            </Text>
          </Steps.Content>
        ))}
      </Steps.Root>
      <Text textStyle="body.sm" color="fg.muted">
        {t('common.shortcutsNote')}
      </Text>
    </Stack>
  );
}
export default async function IosSetupPage(): Promise<ReactElement> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('setup.ios.faq')]);
  return (
    <Stack gap="10" py={{ base: '8', md: '12' }}>
      <SetupIntro locale={locale} />
      <Suspense fallback={<SetupWizardSkeleton />}>
        <IosSetupWizard />
      </Suspense>
      <Stack gap="5" as="section">
        <Text as="h2" textStyle="heading.md">
          {t('title')}
        </Text>
        {(['banner', 'automatic'] as const).map((key) => (
          <Box key={key}>
            <Text as="h3" textStyle="heading.sm" mb="2">
              {t(`${key}Question`)}
            </Text>
            <Text textStyle="body.md" color="fg.muted">
              {t(`${key}Answer`)}
            </Text>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
