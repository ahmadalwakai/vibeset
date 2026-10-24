import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { REPORT_REASONS } from '../../lib/validation/reports';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';

describe('P11 translation contracts', () => {
  for (const locale of ['en', 'ar'] as const) {
    const messages = locale === 'en' ? en : ar;
    it(`translates all report reasons and bounded detail counts in ${locale}`, () => {
      const errors: unknown[] = [];
      const t = createTranslator({
        locale,
        messages: messages.theme.reports,
        onError: (error) => errors.push(error),
      });
      for (const reason of REPORT_REASONS) {
        expect(t(`reasons.${reason}`)).not.toBe(`reasons.${reason}`);
      }
      expect(t('counter', { count: 24, max: 1_000 })).toBe('24 / 1000');
      expect(errors).toEqual([]);
    });
    it(`handles collection plural forms with Latin digits in ${locale}`, () => {
      const errors: unknown[] = [];
      const t = createTranslator({
        locale,
        messages: messages.saved.collections,
        onError: (error) => errors.push(error),
      });
      for (const count of [0, 1, 2, 3, 11, 100, 500]) {
        const label = t('itemCount', { count });
        expect(label).not.toBe('itemCount');
        expect(label).not.toMatch(/[\u0660-\u0669\u06f0-\u06f9]/u);
        if (count >= 3) expect(label).toContain(String(count));
      }
      expect(errors).toEqual([]);
    });
  }
  it('uses native, explicit typed deletion words in each language', () => {
    expect(en.account.deleteWord).toBe('DELETE');
    expect(ar.account.deleteWord).toBe('حذف');
  });
});
