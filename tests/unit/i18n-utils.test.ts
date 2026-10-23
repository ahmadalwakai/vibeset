import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { HTTP_STATUS } from '@/lib/result';
import { formatCompact, formatDate, formatNumber } from '@/lib/utils/format';
import { localized } from '@/lib/utils/localized';
import ar from '@/messages/ar.json';
import en from '@/messages/en.json';

function leafMessages(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (typeof value !== 'object' || value === null) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(leafMessages(child, prefix ? `${prefix}.${key}` : key)),
    ),
  );
}

describe('localized DTO fields', () => {
  const dto = {
    nameEn: 'Lavender sky',
    nameAr: 'سماء بنفسجية',
    titleEn: 'A quiet morning',
    titleAr: 'صباح هادئ',
    descriptionEn: 'Soft colours for your phone.',
    descriptionAr: 'ألوان لطيفة لهاتفك.',
  };

  it('uses the locale and defaults to the name fields', () => {
    expect(localized(dto, 'en')).toBe(dto.nameEn);
    expect(localized(dto, 'ar')).toBe(dto.nameAr);
  });

  it.each(['name', 'title', 'description'] as const)('selects the requested %s field', (field) => {
    expect(localized(dto, 'en', field)).toBe(dto[`${field}En`]);
    expect(localized(dto, 'ar', field)).toBe(dto[`${field}Ar`]);
  });

  it.each([null, undefined, '', '  \t  '])(
    'falls back to English for missing Arabic %s',
    (value) => {
      expect(localized({ nameEn: dto.nameEn, nameAr: value }, 'ar')).toBe(dto.nameEn);
    },
  );

  it('handles nullable descriptions without returning null or undefined', () => {
    expect(localized({ descriptionEn: null, descriptionAr: null }, 'ar', 'description')).toBe('');
    expect(localized({ titleAr: 'عنوان' }, 'en', 'title')).toBe('');
    expect(localized({ nameAr: 'اسم' }, 'ar')).toBe('اسم');
  });
});

describe('localized numeric formatting', () => {
  it('formats English values with British grouping and honours display options', () => {
    expect(formatNumber(12_345.6, 'en')).toBe('12,345.6');
    expect(formatNumber(1234.5, 'en', { useGrouping: false, maximumFractionDigits: 0 })).toBe(
      '1235',
    );
  });

  it('keeps Arabic numerals Latin even when options request another numbering system', () => {
    const number = formatNumber(12_345.6, 'ar', { numberingSystem: 'arab' });
    expect(number).toBe('12,345.6');
    expect(number).not.toMatch(/[\u0660-\u0669\u06f0-\u06f9]/);
  });

  it('uses compact notation while preserving Arabic labels and Latin digits', () => {
    expect(formatCompact(1200, 'en')).toBe('1.2K');
    expect(formatCompact(1200, 'ar')).toMatch(/1[.,]2/);
    expect(formatCompact(1200, 'ar')).not.toMatch(/[\u0660-\u0669\u06f0-\u06f9]/);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite numeric input %s',
    (value) => {
      expect(() => formatNumber(value, 'en')).toThrow(RangeError);
      expect(() => formatCompact(value, 'ar')).toThrow(RangeError);
    },
  );
});

describe('deterministic date formatting', () => {
  const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;

  it('formats timestamp strings using their UTC calendar day', () => {
    expect(formatDate('2026-10-23T00:30:00+02:00', 'en', dateOptions)).toBe('22/10/2026');
    expect(formatDate('2026-10-23T23:30:00-02:00', 'en', dateOptions)).toBe('24/10/2026');
  });

  it('accepts Date objects, epoch milliseconds and date-only ISO strings', () => {
    const date = new Date('2026-10-23T12:00:00Z');
    expect(formatDate(date, 'en', dateOptions)).toBe('23/10/2026');
    expect(formatDate(date.getTime(), 'en', dateOptions)).toBe('23/10/2026');
    expect(formatDate('2026-10-23', 'en', dateOptions)).toBe('23/10/2026');
  });

  it('enforces UTC and Latin digits despite differing host or requested options', () => {
    const formatted = formatDate('2026-10-23T23:30:00Z', 'ar', {
      ...dateOptions,
      timeZone: 'Pacific/Auckland',
      numberingSystem: 'arab',
    });
    expect(formatted.replace(/[\u200e\u200f]/g, '')).toBe('23/10/2026');
    expect(formatted).not.toMatch(/[\u0660-\u0669\u06f0-\u06f9]/);
  });

  it.each(['2026-10-23T12:00:00', '2026-02-30', 'not-a-date'])(
    'rejects ambiguous or invalid date strings %s',
    (value) => expect(() => formatDate(value, 'en')).toThrow(),
  );

  it('rejects invalid Date objects and values outside the supported date range', () => {
    expect(() => formatDate(new Date(Number.NaN), 'en')).toThrow(RangeError);
    expect(() => formatDate(9e15, 'en')).toThrow(RangeError);
  });
});

describe('message contracts', () => {
  it('includes every phase namespace with identical translated leaf keys', () => {
    const namespaces = [
      'common',
      'nav',
      'home',
      'explore',
      'theme',
      'studio',
      'setup',
      'saved',
      'account',
      'auth',
      'creator',
      'admin',
      'errors',
      'legal',
    ];
    expect(Object.keys(en).sort()).toEqual([...namespaces].sort());
    expect(Object.keys(ar).sort()).toEqual([...namespaces].sort());
    expect(Object.keys(leafMessages(ar)).sort()).toEqual(Object.keys(leafMessages(en)).sort());
    expect(en.common).not.toHaveProperty('bootstrap');
    expect(ar.common).not.toHaveProperty('bootstrap');
  });

  it('provides exactly the shared error codes plus network and offline translations', () => {
    const keys = [...Object.keys(HTTP_STATUS), 'NETWORK', 'OFFLINE'].sort();
    expect(Object.keys(en.errors).sort()).toEqual(keys);
    expect(Object.keys(ar.errors).sort()).toEqual(keys);
  });

  it('formats confirmation and language-switch placeholders in both dictionaries', () => {
    const english = createTranslator({ locale: 'en', messages: en });
    const arabic = createTranslator({ locale: 'ar', messages: ar });
    expect(english('common.confirmationHint', { value: 'DELETE' })).toContain('DELETE');
    expect(arabic('common.confirmationHint', { value: 'احذف' })).toContain('احذف');
    expect(english('nav.switchLanguage', { language: en.nav.languages.ar })).toContain('العربية');
    expect(arabic('nav.switchLanguage', { language: ar.nav.languages.en })).toContain('English');
  });
});
