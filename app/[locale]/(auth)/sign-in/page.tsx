import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { SignInForm } from '@/components/auth/SignInForm';
import { SignInSkeleton } from '@/components/auth/SignInSkeleton';
import { redirect } from '@/i18n/navigation';
import { localizeNextPath, unlocalizeNextPath } from '@/lib/utils/next-path';
import { getSession } from '@/server/guards';

async function SignInContent({
  searchParams,
}: Pick<PageProps<'/[locale]/sign-in'>, 'searchParams'>): Promise<ReactElement> {
  await connection();
  const [{ env }, locale, session, params] = await Promise.all([
    import('@/lib/env.server'),
    getLocale(),
    getSession(),
    searchParams,
  ]);
  const callbackURL = localizeNextPath(params.next, locale);
  if (session && !session.user.banned) redirect({ href: unlocalizeNextPath(callbackURL), locale });

  return (
    <SignInForm
      callbackURL={callbackURL}
      googleAvailable={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)}
      magicLinkAvailable={Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)}
      callbackError={typeof params.error === 'string' && params.error.length > 0}
      banned={Boolean(session?.user.banned)}
    />
  );
}

export default function SignInPage({ searchParams }: PageProps<'/[locale]/sign-in'>): ReactElement {
  return (
    <Suspense fallback={<SignInSkeleton />}>
      <SignInContent searchParams={searchParams} />
    </Suspense>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('auth')]);
  return pageMetadata({
    locale,
    path: '/sign-in',
    title: t('signInTitle'),
    description: t('signInDescription'),
    noindex: true,
  });
}
