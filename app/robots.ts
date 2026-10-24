import type { MetadataRoute } from 'next';
import { env } from '@/lib/env.client';

export default function robots(): MetadataRoute.Robots {
  const privatePaths = [
    '/admin',
    '/creator',
    '/account',
    '/saved',
    '/api',
    '/dev',
    '/sign-in',
    '/become-creator',
    '/collections/u/',
  ];
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        ...privatePaths,
        ...['ar', 'en'].flatMap((locale) =>
          privatePaths.filter((path) => path !== '/api').map((path) => `/${locale}${path}`),
        ),
      ],
    },
    sitemap: new URL('/sitemap.xml', env.NEXT_PUBLIC_SITE_URL).href,
  };
}
