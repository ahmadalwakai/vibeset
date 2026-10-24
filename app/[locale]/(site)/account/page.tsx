import { pageMetadata } from '@/lib/seo';
import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations, getLocale } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';
import { AccountSettings } from '@/components/account/AccountSettings';
import { PageHeader } from '@/components/common/PageHeader';
import { requireUserPage } from '@/server/guards';

async function AccountContent(): Promise<ReactElement> {
  await connection();
  await requireUserPage('/account');
  const { getAccountProfile } = await import('@/server/admin-queries/user');
  return <AccountSettings profile={await getAccountProfile()} />;
}
export default async function AccountPage(): Promise<ReactElement> {
  const t = await getTranslations('account');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense
        fallback={
          <Stack gap="5" pb="12">
            <Skeleton h="96" rounded="card" />
            <Skeleton h="36" rounded="card" />
          </Stack>
        }
      >
        <AccountContent />
      </Suspense>
    </>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('account')]);
  return pageMetadata({
    locale,
    path: '/account',
    title: t('title'),
    description: t('description'),
    noindex: true,
  });
}
