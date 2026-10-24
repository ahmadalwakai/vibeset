import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { CreatorApplication } from '@/components/creator/CreatorApplication';
import { requireUserPage } from '@/server/guards';

export const metadata: Metadata = { robots: { index: false, follow: false } };
async function ApplicationContent(): Promise<ReactElement> {
  await connection();
  const session = await requireUserPage('/become-creator');
  const [{ getMyCreatorContext }, { getFeatures }] = await Promise.all([
    import('@/server/admin-queries/creator'),
    import('@/server/services/settings'),
  ]);
  const [profile, features] = await Promise.all([getMyCreatorContext(), getFeatures()]);
  return (
    <CreatorApplication
      ownerId={session.user.id}
      profile={profile}
      applicationsOpen={features.creatorApplicationsOpen}
    />
  );
}
export default async function BecomeCreatorPage(): Promise<ReactElement> {
  const t = await getTranslations('creator.application');
  return (
    <Stack gap="7" py={{ base: '6', md: '10' }}>
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense
        fallback={
          <Stack gap="5">
            <Skeleton h="48" rounded="card" />
            <Skeleton h="96" rounded="card" />
          </Stack>
        }
      >
        <ApplicationContent />
      </Suspense>
    </Stack>
  );
}
