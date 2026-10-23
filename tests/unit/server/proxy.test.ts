import { describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('next-intl/middleware', () => ({ default: () => () => NextResponse.next() }));

import proxy from '@/proxy';

describe('optimistic proxy auth gate', () => {
  it.each([
    '/admin',
    '/admin/themes',
    '/creator/profile',
    '/account',
    '/ar/admin',
    '/ar/account',
    '/en/account',
  ])('redirects %s without a session cookie', (path) => {
    const response = proxy(new NextRequest(`https://vibeset.test${path}?tag=a&tag=b`));
    const destination = new URL(response.headers.get('location') ?? 'https://invalid.test');
    expect(destination.pathname).toBe(path.startsWith('/ar/') ? '/ar/sign-in' : '/sign-in');
    expect(destination.searchParams.get('next')).toBe(`${path}?tag=a&tag=b`);
  });

  it.each(['/', '/ar', '/sign-in', '/explore', '/administrator', '/creator-tools'])(
    'keeps public and unrelated paths %s with the locale middleware',
    (path) => {
      const response = proxy(new NextRequest(`https://vibeset.test${path}`));
      expect(response.headers.get('x-middleware-next')).toBe('1');
    },
  );

  it('only checks cookie presence, leaving real authorization to server guards', () => {
    const request = new NextRequest('https://vibeset.test/admin', {
      headers: { cookie: 'better-auth.session_token=untrusted-presence-only' },
    });
    expect(proxy(request).headers.get('x-middleware-next')).toBe('1');
  });
});
