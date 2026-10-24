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
import { pageMetadata } from '@/lib/seo';

export function generateStaticParams(): { locale: (typeof routing.locales)[number] }[] {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#b44bd0',
};

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('home.metadata'), getLocale()]);
  return {
    ...pageMetadata({ locale, path: '/', title: t('title'), description: t('description') }),
    metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
    applicationName: 'Vibeset',
    appleWebApp: { capable: true, title: 'Vibeset', statusBarStyle: 'default' },
    title: { default: t('title'), template: '%s · Vibeset' },
    description: t('description'),
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
