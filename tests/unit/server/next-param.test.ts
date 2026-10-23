import { describe, expect, it } from 'vitest';
import { emailSignInSchema } from '@/lib/validation/auth';
import { localizeNextPath, safeNextPath, unlocalizeNextPath } from '@/lib/utils/next-path';

describe('safe authentication return paths', () => {
  it.each([
    undefined,
    null,
    ['//attacker.example'],
    '',
    'https://attacker.example',
    '//attacker.example',
    '///attacker.example',
    '/\\attacker.example',
    '/%5cattacker.example',
    '/%255cattacker.example',
    '/%2fattacker.example',
    '/%252fattacker.example',
    '/ar//attacker.example',
    '/en//attacker.example',
    '/ar/%2fattacker.example',
    '/%61r//attacker.example',
    '/%0a//attacker.example',
    '/%250d/attacker.example',
    '\n/account',
    '/account\n',
    '/ account',
    ' /account',
    '/account ',
    '/..//attacker.example',
    '/%2e%2e//attacker.example',
    '/bad%escape',
    '/sign-in',
    '/sign-in?next=/account',
    '/ar/sign-in',
    '/en/sign-in#again',
    '/%73ign-in',
    '/ar/%73ign-in',
    '/a'.repeat(1100),
  ])('defaults unsafe input %j to home', (value) => {
    expect(safeNextPath(value)).toBe('/');
  });

  it.each([
    '/',
    '/account',
    '/creator/themes',
    '/ar/account',
    '/explore?tag=calm&tag=purple&next=https%3A%2F%2Fexample.com#themes',
    '/t/%D8%B3%D9%85%D8%A7%D8%A1',
  ])('preserves a safe relative path %s', (value) => {
    expect(safeNextPath(value)).toBe(value);
  });

  it('normalizes local dot segments without changing the origin', () => {
    expect(safeNextPath('/explore/../account?tab=saved')).toBe('/account?tab=saved');
  });

  it('localizes callbacks once and preserves query values and fragments', () => {
    expect(localizeNextPath('/account', 'ar')).toBe('/ar/account');
    expect(localizeNextPath('/ar/account?tab=one&tab=two#saved', 'ar')).toBe(
      '/ar/account?tab=one&tab=two#saved',
    );
    expect(localizeNextPath('/ar/account', 'en')).toBe('/account');
    expect(localizeNextPath('/en/account', 'ar')).toBe('/ar/account');
    expect(localizeNextPath('/', 'ar')).toBe('/ar');
    expect(localizeNextPath('/?tab=saved', 'ar')).toBe('/ar?tab=saved');
    expect(localizeNextPath('//attacker.example', 'ar')).toBe('/ar');
    expect(localizeNextPath('/ar//attacker.example', 'en')).toBe('/');
    expect(unlocalizeNextPath('/ar//attacker.example')).toBe('/');
    expect(unlocalizeNextPath('/ar?tab=saved')).toBe('/?tab=saved');
  });

  it('validates sign-in email independently of server-only email delivery', () => {
    expect(emailSignInSchema.parse({ email: ' person@example.com ' })).toEqual({
      email: 'person@example.com',
    });
    expect(
      emailSignInSchema.safeParse({ email: 'person@example.com\r\nBcc:attacker@example.com' })
        .success,
    ).toBe(false);
    expect(emailSignInSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});
