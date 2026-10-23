import { LocaleProvider } from '@chakra-ui/react';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { EmotionRegistry } from '@/components/ui/emotion-registry';
import { Provider } from '@/components/ui/provider';
import { Toaster } from '@/components/ui/toaster';
import { fontVariables } from '@/design/fonts';
import { routing } from '@/i18n/routing';
import { env } from '@/lib/env.client';

export function generateStaticParams(): { locale: (typeof routing.locales)[number] }[] {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8fc' },
    { media: '(prefers-color-scheme: dark)', color: '#16121d' },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('home.metadata');
  return {
    metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
    title: { default: t('title'), template: '%s · Vibeset' },
    description: t('description'),
    alternates: { languages: { en: '/', ar: '/ar', 'x-default': '/' } },
  };
}

export default async function LocaleLayout({
  children,
}: LayoutProps<'/[locale]'>): Promise<ReactElement> {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className={fontVariables}
      suppressHydrationWarning
    >
      <body>
        <EmotionRegistry>
          <Provider>
            <LocaleProvider locale={locale === 'ar' ? 'ar-SA' : 'en-GB'}>
              <NextIntlClientProvider>
                {children}
                <Toaster />
              </NextIntlClientProvider>
            </LocaleProvider>
          </Provider>
        </EmotionRegistry>
      </body>
    </html>
  );
}
