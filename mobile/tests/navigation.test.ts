import { describe, expect, expectTypeOf, it } from 'vitest';
import { parseNativeDeepLink } from '../lib/navigation';
import type { NativeNavigationTarget, NativeSetupStep } from '../lib/navigation';

describe('native theme and setup deep links', () => {
  it('opens a theme without requesting any installation action', () => {
    expect(parseNativeDeepLink('vibeset://theme/y2k-lilac')).toEqual({
      kind: 'theme',
      slug: 'y2k-lilac',
    });
    expectTypeOf(parseNativeDeepLink).returns.toEqualTypeOf<NativeNavigationTarget | null>();
  });

  it.each<NativeSetupStep>(['wallpaper', 'icons', 'widget'])(
    'opens the requested %s setup screen',
    (step) => {
      expect(parseNativeDeepLink(`vibeset://setup/y2k-lilac?step=${step}`)).toEqual({
        kind: 'setup',
        slug: 'y2k-lilac',
        step,
      });
    },
  );

  it('defaults a setup link to the wallpaper step and preserves canonical slug bounds', () => {
    expect(parseNativeDeepLink('vibeset://setup/0')).toEqual({
      kind: 'setup',
      slug: '0',
      step: 'wallpaper',
    });
    const longest = `a${'-b'.repeat(79)}c`;
    expect(longest).toHaveLength(160);
    expect(parseNativeDeepLink(`vibeset://theme/${longest}`)).toEqual({
      kind: 'theme',
      slug: longest,
    });
    expect(parseNativeDeepLink(`vibeset://theme/${longest}d`)).toBeNull();
  });

  it.each([
    undefined,
    null,
    1,
    {},
    { toString: () => 'vibeset://theme/y2k-lilac' },
    '',
    'https://theme/y2k-lilac',
    'javascript:alert(1)',
    'vibeset://admin/y2k-lilac',
    'VIBESET://theme/y2k-lilac',
    'vibeset://Theme/y2k-lilac',
    'vibeset:///theme/y2k-lilac',
    'vibeset://theme/',
    'vibeset://theme/Y2k-lilac',
    'vibeset://theme/-lilac',
    'vibeset://theme/lilac_name',
    'vibeset://theme/ثيم',
    'vibeset://theme/lilac/extra',
    'vibeset://theme/lilac/',
    'vibeset://theme/../setup/lilac',
    'vibeset://theme/%2e%2e/setup/lilac',
    'vibeset://theme/lilac%2fextra',
    'vibeset://theme/%79%32%6b',
    'vibeset://theme\\lilac',
    'vibeset://user@theme/lilac',
    'vibeset://theme:443/lilac',
    'vibeset://theme/lilac#icons',
    'vibeset://theme/lilac#',
    'vibeset://theme/lilac?',
    'vibeset://theme/lilac?step=icons',
    'vibeset://setup/lilac?step=unknown',
    'vibeset://setup/lilac?step=',
    'vibeset://setup/lilac?',
    'vibeset://setup/lilac?Step=icons',
    'vibeset://setup/lilac?step=%69cons',
    'vibeset://setup/lilac?step=icons&step=widget',
    'vibeset://setup/lilac?step=icons&save=true',
    'vibeset://setup/lilac?save=true',
    'vibeset://setup/lilac?step=icons#confirm',
    ' vibeset://theme/lilac',
    'vibeset://theme/lilac ',
    'vibeset://theme/lilac\n',
    'vibeset://theme/li\tlac',
    'vibeset://theme/lilac\u0000',
    'vibeset://theme/lilac\u200b',
    'vibeset://setup/lilac?step=icons\r\n',
    'x'.repeat(10_000),
  ])('rejects malformed or action-bearing external input %#', (value) => {
    expect(parseNativeDeepLink(value)).toBeNull();
  });
});
