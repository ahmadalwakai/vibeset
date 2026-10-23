import type { Locale } from 'next-intl';
import { z } from 'zod';

const dateStringSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

function numberLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
}

function assertFinite(value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError('A finite number is required');
  }
}

export function formatNumber(
  value: number,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  assertFinite(value);

  return new Intl.NumberFormat(numberLocale(locale), {
    ...options,
    numberingSystem: 'latn',
  }).format(value);
}

export function formatCompact(
  value: number,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  return formatNumber(value, locale, { maximumFractionDigits: 1, ...options, notation: 'compact' });
}

export function formatDate(
  value: Date | string | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const timestamp =
    typeof value === 'string'
      ? new Date(dateStringSchema.parse(value)).getTime()
      : typeof value === 'number'
        ? value
        : value.getTime();
  assertFinite(timestamp);

  const date = new Date(timestamp);
  assertFinite(date.getTime());

  return new Intl.DateTimeFormat(numberLocale(locale), {
    ...options,
    timeZone: 'UTC',
    numberingSystem: 'latn',
  }).format(date);
}
