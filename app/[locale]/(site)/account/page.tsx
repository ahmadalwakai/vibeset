import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactElement } from 'react';
import { AccountSettings } from '@/components/account/AccountSettings';
import { PageHeader } from '@/components/common/PageHeader';
import { requireUserPage } from '@/server/guards';

export const metadata: Metadata = { robots: { index: false, follow: false } };
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
