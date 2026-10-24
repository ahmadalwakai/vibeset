import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { z } from 'zod';

const cdnOrigin = new URL(
  z
    .url({ protocol: /^https?$/ })
    .parse(process.env.NEXT_PUBLIC_CDN_URL || 'https://cdn.vibeset.app'),
).origin;
const isDevelopment = process.env.NODE_ENV === 'development';
type CspDirective = readonly [name: string, ...sources: string[]];
const cspDirectives: CspDirective[] = [
  ['default-src', "'self'"],
  ['script-src', "'self'", "'unsafe-inline'", ...(isDevelopment ? ["'unsafe-eval'"] : [])],
  ['style-src', "'self'", "'unsafe-inline'"],
  ['img-src', "'self'", 'data:', 'blob:', cdnOrigin, 'https://lh3.googleusercontent.com'],
  [
    'connect-src',
    "'self'",
    cdnOrigin,
    'https://*.r2.cloudflarestorage.com',
    ...(isDevelopment ? ['ws:', 'wss:'] : []),
  ],
  ['font-src', "'self'"],
  ['worker-src', "'self'", 'blob:'],
  ['frame-ancestors', "'none'"],
  ['object-src', "'none'"],
  ['base-uri', "'self'"],
  ['form-action', "'self'", 'https://accounts.google.com'],
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  agentRules: false,
  poweredByHeader: false,
  output: 'standalone',
  experimental: {
    globalNotFound: true,
    optimizePackageImports: ['@chakra-ui/react', '@phosphor-icons/react'],
  },
  serverExternalPackages: ['@resvg/resvg-js'],
  outputFileTracingIncludes: {
    // Native libvips companions are loaded by Sharp's addon, outside JS imports.
    '/*': ['./node_modules/@img/sharp-*/**/*'],
    '/api/admin/**': ['./public/glyphs/**/*', './assets/fonts/**/*'],
    '/\\[locale\\]/admin/**': ['./public/glyphs/**/*', './assets/fonts/**/*'],
    '/\\[locale\\]/creator/**': ['./public/glyphs/**/*', './assets/fonts/**/*'],
  },
  async headers(): Promise<{ source: string; headers: { key: string; value: string }[] }[]> {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspDirectives.map((directive) => directive.join(' ')).join('; '),
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        source: '/glyphs/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source:
          '/themes/:themeId/v:version([1-9]\\d*)/:attemptId/:file((?:thumb|preview-home|preview-lock)\\.webp|(?:og|wallpaper-(?:phone|tablet|desktop))\\.jpg)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
