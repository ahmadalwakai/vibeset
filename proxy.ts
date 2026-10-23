import createMiddleware from 'next-intl/middleware';
import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default function proxy(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;
  const localePrefix = pathname === '/ar' || pathname.startsWith('/ar/') ? '/ar' : '';
  const path = pathname.replace(/^\/(ar|en)(?=\/|$)/, '') || '/';
  const protectedPath = ['/admin', '/creator', '/account'].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );

  if (protectedPath && !getSessionCookie(request)) {
    const destination = new URL(`${localePrefix}/sign-in`, request.url);
    destination.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(destination);
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
