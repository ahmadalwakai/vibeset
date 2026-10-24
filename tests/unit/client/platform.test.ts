import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlatform } from '../../../hooks/usePlatform';
import {
  canShareFiles,
  getPlatformInfo,
  isAndroid,
  isIOS,
  isIPad,
  isInAppBrowser,
  isStandalone,
} from '../../../lib/client/platform';

afterEach(() => vi.unstubAllGlobals());

describe('platform detection', () => {
  it.each([
    ['Mozilla iPhone Safari', 'iPhone', 1, 'ios', false],
    ['Mozilla iPad Safari', 'iPad', 5, 'ios', true],
    ['Mozilla Macintosh Safari', 'MacIntel', 5, 'ios', true],
    ['Mozilla Macintosh Safari', 'MacIntel', 0, 'desktop', false],
    ['Mozilla Android Chrome', 'Linux', 5, 'android', false],
    ['Mozilla Windows Chrome', 'Win32', 0, 'desktop', false],
  ])(
    'detects %s without confusing touch iPads with Macs',
    (userAgent, platform, maxTouchPoints, expected, tablet) => {
      vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints });
      expect(getPlatformInfo()).toEqual({
        platform: expected,
        isIPad: tablet,
        inAppBrowser: false,
        standalone: false,
      });
      expect(isIOS()).toBe(expected === 'ios');
      expect(isAndroid()).toBe(expected === 'android');
      expect(isIPad()).toBe(tablet);
    },
  );

  it.each([
    'Instagram',
    'FBAN',
    'FBAV',
    'TikTok',
    'musical_ly',
    'Snapchat',
    'Pinterest',
    'LinkedInApp',
  ])('recognizes the %s embedded browser', (name) => {
    vi.stubGlobal('navigator', { userAgent: `Mozilla ${name}` });
    expect(isInAppBrowser()).toBe(true);
  });

  it('detects standalone display mode and the iOS standalone flag', () => {
    vi.stubGlobal('window', { matchMedia: vi.fn(() => ({ matches: true })) });
    expect(isStandalone()).toBe(true);
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', { standalone: true });
    expect(isStandalone()).toBe(true);
  });

  it('requires both file-share methods and treats capability errors as unsupported', () => {
    const files = [new File(['image'], 'wallpaper.jpg')];
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: vi.fn(() => true) });
    expect(canShareFiles(files)).toBe(true);
    expect(canShareFiles([])).toBe(false);
    vi.stubGlobal('navigator', { canShare: vi.fn(() => true) });
    expect(canShareFiles(files)).toBe(false);
    vi.stubGlobal('navigator', {
      share: vi.fn(),
      canShare: vi.fn(() => {
        throw new Error('blocked');
      }),
    });
    expect(canShareFiles(files)).toBe(false);
  });

  it('is safe without browser globals and renders the hook as null on the server', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('window', undefined);
    expect(getPlatformInfo()).toEqual({
      platform: 'desktop',
      isIPad: false,
      inAppBrowser: false,
      standalone: false,
    });
    function ServerProbe(): string {
      return usePlatform() === null ? 'pending' : 'resolved';
    }
    expect(renderToString(createElement(ServerProbe))).toBe('pending');
  });
});
