import { pageMetadata } from '@/lib/seo';
import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations, getLocale, getMessages } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { CreatorApplication } from '@/components/creator/CreatorApplication';
import { requireUserPage } from '@/server/guards';
import { ClientMessages } from '@/components/common/ClientMessages';
import { selectClientMessages } from '@/lib/client-messages';

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
  const [t, messages] = await Promise.all([getTranslations('creator.application'), getMessages()]);
  return (
    <ClientMessages messages={selectClientMessages(messages, 'creator')}>
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
    </ClientMessages>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('creator.application')]);
  return pageMetadata({
    locale,
    path: '/become-creator',
    title: t('title'),
    description: t('description'),
    noindex: true,
  });
}
