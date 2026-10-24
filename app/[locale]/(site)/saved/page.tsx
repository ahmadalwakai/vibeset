import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { SavedTabs } from '@/components/saved/SavedTabs';

export const metadata: Metadata = { robots: { index: false, follow: true } };
export default async function SavedPage(): Promise<ReactElement> {
  const t = await getTranslations('saved');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <SavedTabs />
    </>
  );
}
