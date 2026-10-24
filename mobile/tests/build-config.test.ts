import { afterEach, describe, expect, it, vi } from 'vitest';
import appConfig from '../app.config';
import {
  assertNativeBuildEnvironment,
  assertNativeCompileEnvironment,
  readNativeIdentifiers,
} from '../lib/build-config';

const environment = {
  VIBESET_IOS_BUNDLE_ID: 'com.fixtureowner.vibeset',
  VIBESET_IOS_WIDGET_BUNDLE_ID: 'com.fixtureowner.vibeset.calendar',
  VIBESET_IOS_APP_GROUP: 'group.com.fixtureowner.vibeset',
  EXPO_PUBLIC_API_URL: 'https://api.fixture.invalid',
  EXPO_PUBLIC_CDN_URL: 'https://assets.fixture.invalid',
};

afterEach(() => vi.unstubAllEnvs());

describe('native generation configuration', () => {
  it('allows a JavaScript export without inventing Apple identifiers', () => {
    expect(readNativeIdentifiers({})).toBeUndefined();
    expect(() => assertNativeBuildEnvironment({})).toThrow();
  });
  it('requires complete, distinct, well formed app and widget identities', () => {
    for (const patch of [
      { VIBESET_IOS_BUNDLE_ID: undefined },
      { VIBESET_IOS_WIDGET_BUNDLE_ID: environment.VIBESET_IOS_BUNDLE_ID },
      { VIBESET_IOS_APP_GROUP: 'com.fixtureowner.vibeset' },
      { VIBESET_IOS_BUNDLE_ID: 'com.example.vibeset' },
      { VIBESET_IOS_BUNDLE_ID: 'invalid id' },
      { VIBESET_IOS_BUNDLE_ID: `${environment.VIBESET_IOS_BUNDLE_ID}\n` },
      { VIBESET_IOS_WIDGET_BUNDLE_ID: 'com.otherowner.calendar' },
    ])
      expect(() => assertNativeBuildEnvironment({ ...environment, ...patch })).toThrow();
    expect(assertNativeBuildEnvironment(environment)).toEqual({
      bundleId: environment.VIBESET_IOS_BUNDLE_ID,
      widgetBundleId: environment.VIBESET_IOS_WIDGET_BUNDLE_ID,
      appGroup: environment.VIBESET_IOS_APP_GROUP,
    });
  });
  it('refuses credentials, plain HTTP and paths in beta service origins', () => {
    for (const value of [
      'http://localhost:3000',
      'https://user:secret@api.fixture.invalid',
      'https://api.fixture.invalid/path',
      'https://api.fixture.invalid/?key=x',
      'https://api.fixture.invalid\n',
      'https://api.fixture.invalid?',
      'https://api.fixture.invalid#',
      'https://api.fixture.\tinvalid',
    ])
      expect(() =>
        assertNativeBuildEnvironment({ ...environment, EXPO_PUBLIC_API_URL: value }),
      ).toThrow();
  });
  it('allows missing service origins only through the explicit compile guard', () => {
    const identitiesOnly = {
      ...environment,
      EXPO_PUBLIC_API_URL: undefined,
      EXPO_PUBLIC_CDN_URL: undefined,
    };
    expect(assertNativeCompileEnvironment(identitiesOnly)).toEqual({
      bundleId: environment.VIBESET_IOS_BUNDLE_ID,
      widgetBundleId: environment.VIBESET_IOS_WIDGET_BUNDLE_ID,
      appGroup: environment.VIBESET_IOS_APP_GROUP,
    });
    expect(() => assertNativeBuildEnvironment(identitiesOnly)).toThrow();
    expect(() => assertNativeCompileEnvironment({})).toThrow();
    expect(() =>
      assertNativeCompileEnvironment({ ...identitiesOnly, VIBESET_IOS_APP_GROUP: undefined }),
    ).toThrow();
    expect(assertNativeCompileEnvironment(environment)).toEqual(
      assertNativeBuildEnvironment(environment),
    );
  });
  it('refuses partial, empty or malformed compile origins instead of treating them as absent', () => {
    for (const patch of [
      { EXPO_PUBLIC_API_URL: undefined },
      { EXPO_PUBLIC_CDN_URL: undefined },
      { EXPO_PUBLIC_API_URL: '', EXPO_PUBLIC_CDN_URL: '' },
      { EXPO_PUBLIC_API_URL: 'http://localhost:3000' },
      { EXPO_PUBLIC_API_URL: 'https://api.fixture.\ninvalid' },
      { EXPO_PUBLIC_CDN_URL: 'https://user:secret@assets.fixture.invalid' },
      { EXPO_PUBLIC_CDN_URL: 'https://assets.fixture.invalid/path' },
      { EXPO_PUBLIC_CDN_URL: 'https://assets.fixture.invalid?token=value' },
    ])
      expect(() => assertNativeCompileEnvironment({ ...environment, ...patch })).toThrow();
  });
  it('selects compile validation only for the exact opt-in config mode', () => {
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
    vi.stubEnv('EXPO_PUBLIC_API_URL', undefined);
    vi.stubEnv('EXPO_PUBLIC_CDN_URL', undefined);
    vi.stubEnv('VIBESET_NATIVE_GENERATE', '1');
    expect(() => appConfig()).toThrow();
    vi.stubEnv('VIBESET_NATIVE_GENERATE', 'compile');
    const config = appConfig();
    expect(config.ios?.bundleIdentifier).toBe(environment.VIBESET_IOS_BUNDLE_ID);
    expect(config.plugins?.at(-1)).toBe('./widget-plugin.ts');
    vi.stubEnv('VIBESET_IOS_WIDGET_BUNDLE_ID', undefined);
    expect(() => appConfig()).toThrow();
  });
});
