import 'server-only';
import { cache } from 'react';
import { getSessionCookie } from 'better-auth/cookies';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { creatorProfiles } from '@/db/schema/moderation';
import type { AuthSession, CreatorProfile, CreatorSession } from '@/lib/auth';
import { localizeNextPath, safeNextPath } from '@/lib/utils/next-path';
import { AppError } from './errors';

export type { AuthSession } from '@/lib/auth';

export const getSession = cache(async (): Promise<AuthSession | null> => {
  const requestHeaders = await headers();
  if (!getSessionCookie(requestHeaders)) return null;

  const { auth } = await import('./auth');
  // Permission changes and revocation must take effect without waiting for a cookie-cache expiry.
  return auth.api.getSession({ headers: requestHeaders, query: { disableCookieCache: true } });
});

export const getCreatorProfile = cache(async (userId: string): Promise<CreatorProfile | null> => {
  const { db } = await import('@/db');
  const rows = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
});

export async function requireUser(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) throw new AppError('UNAUTHENTICATED');
  if (session.user.banned) throw new AppError('FORBIDDEN');
  return session;
}

export async function requireCreator(): Promise<CreatorSession> {
  const session = await requireUser();
  const creator = await getCreatorProfile(session.user.id);
  if (session.user.role !== 'admin' && creator?.status !== 'approved') {
    throw new AppError('FORBIDDEN');
  }
  return { ...session, creator: creator?.status === 'approved' ? creator : null };
}

export async function requireAdmin(): Promise<AuthSession> {
  const session = await requireUser();
  if (session.user.role !== 'admin') throw new AppError('FORBIDDEN');
  return session;
}

async function redirectToSignIn(nextPath: string): Promise<never> {
  const locale = await getLocale();
  const path = localizeNextPath(safeNextPath(nextPath), locale === 'ar' ? 'ar' : 'en');
  const query = new URLSearchParams({ next: path });
  redirect(`${locale === 'ar' ? '/ar' : ''}/sign-in?${query}`);
}

export async function requireUserPage(nextPath: string): Promise<AuthSession> {
  try {
    return await requireUser();
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (error.code === 'UNAUTHENTICATED') return redirectToSignIn(nextPath);
    if (error.code === 'FORBIDDEN') notFound();
    throw error;
  }
}

export async function requireCreatorPage(): Promise<CreatorSession> {
  try {
    return await requireCreator();
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (error.code === 'UNAUTHENTICATED') return redirectToSignIn('/creator');
    if (error.code === 'FORBIDDEN') notFound();
    throw error;
  }
}

export async function requireAdminPage(): Promise<AuthSession> {
  try {
    return await requireAdmin();
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (error.code === 'UNAUTHENTICATED') return redirectToSignIn('/admin');
    if (error.code === 'FORBIDDEN') notFound();
    throw error;
  }
}
