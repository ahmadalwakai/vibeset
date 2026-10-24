import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import { getTranslations, getLocale } from 'next-intl/server';
import type { ReactElement } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { SavedTabs } from '@/components/saved/SavedTabs';

export default async function SavedPage(): Promise<ReactElement> {
  const t = await getTranslations('saved');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <SavedTabs />
    </>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('saved')]);
  return pageMetadata({
    locale,
    path: '/saved',
    title: t('title'),
    description: t('description'),
    noindex: true,
    follow: true,
  });
}
