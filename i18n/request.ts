import { notFound } from 'next/navigation';
import * as rootParams from 'next/root-params';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ locale: override }) => {
  // Explicit overrides also work in actions/route handlers, which have no root params.
  const locale = override ?? (await rootParams.locale());
  if (!hasLocale(routing.locales, locale)) notFound();

  return {
    locale,
    timeZone: 'UTC',
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
