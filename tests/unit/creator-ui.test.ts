import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { applicationStatus, applicationVersion } from '../../components/creator/application-state';
import { THEME_STATUSES } from '../../lib/theme-status';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';

const rejected = {
  userId: 'creator',
  status: 'rejected' as const,
  updatedAt: '2026-10-24T01:00:00Z',
};
describe('creator application optimistic status', () => {
  it('shows pending immediately after a new application succeeds', () => {
    expect(applicationStatus(null, null)).toBeUndefined();
    expect(applicationStatus(null, applicationVersion(null))).toBe('pending');
  });
  it('shows a reapplication as pending only until its source snapshot changes', () => {
    const version = applicationVersion(rejected);
    expect(applicationStatus(rejected, version)).toBe('pending');
    expect(applicationStatus({ ...rejected, updatedAt: '2026-10-24T02:00:00Z' }, version)).toBe(
      'rejected',
    );
  });
  it.each(['approved', 'suspended', 'pending'] as const)(
    'does not mask a server decision %s after refresh',
    (status) => {
      expect(applicationStatus({ ...rejected, status }, applicationVersion(rejected))).toBe(status);
    },
  );
  it('does not apply another account’s optimistic state', () => {
    expect(
      applicationStatus({ ...rejected, userId: 'another-creator' }, applicationVersion(rejected)),
    ).toBe('rejected');
  });
});

describe('creator message contracts', () => {
  for (const locale of ['en', 'ar'] as const) {
    const messages = locale === 'en' ? en : ar;
    it(`provides creator/theme statuses, editor and upload instructions in ${locale}`, () => {
      const errors: unknown[] = [];
      const t = createTranslator({
        locale,
        messages: messages.creator,
        onError: (error) => errors.push(error),
      });
      for (const status of ['pending', 'suspended', ...THEME_STATUSES] as const)
        expect(t(`status.${status}`)).not.toBe(`status.${status}`);
      expect(t('uploads.uploading', { progress: 42 })).toContain('42%');
      expect(t('editor.applySuggestion', { number: 2 })).toContain('2');
      expect(t('uploads.errors.avatar_too_small')).toContain('256');
      expect(t('fields.counter', { count: 24, max: 280 })).toBe('24 / 280');
      expect(errors).toEqual([]);
    });
  }
});
