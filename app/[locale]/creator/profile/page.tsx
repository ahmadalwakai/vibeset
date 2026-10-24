import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import { Button, Skeleton, Stack } from '@chakra-ui/react';
import { connection } from 'next/server';
import { getTranslations, getLocale } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { CreatorProfileForm } from '@/components/creator/CreatorProfileForm';
import { Link } from '@/i18n/navigation';

// The owner guard intentionally omits private children until the session resolves.
export const instant = false;

async function ProfileContent(): Promise<ReactElement> {
  await connection();
  const [{ getMyCreatorContext }, t] = await Promise.all([
    import('@/server/admin-queries/creator'),
    getTranslations('creator.profile'),
  ]);
  const profile = await getMyCreatorContext();
  return profile?.status === 'approved' ? (
    <CreatorProfileForm key={profile.userId} profile={profile} />
  ) : (
    <EmptyState
      title={t('noProfileTitle')}
      description={t('noProfileBody')}
      action={
        <Button asChild minH="11" colorPalette="brand">
          <Link href="/become-creator">{t('apply')}</Link>
        </Button>
      }
    />
  );
}
export default async function CreatorProfilePage(): Promise<ReactElement> {
  const t = await getTranslations('creator.profile');
  return (
    <Stack gap="7">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense
        fallback={
          <Stack gap="5">
            <Skeleton h="32" />
            <Skeleton h="96" />
          </Stack>
        }
      >
        <ProfileContent />
      </Suspense>
    </Stack>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('creator.profile')]);
  return pageMetadata({
    locale,
    path: '/creator/profile',
    title: t('title'),
    description: t('description'),
    noindex: true,
  });
}
