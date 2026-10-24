import { describe, expect, it } from 'vitest';
import { assertNativeBuildEnvironment, readNativeIdentifiers } from '../lib/build-config';

const environment = {
  VIBESET_IOS_BUNDLE_ID: 'com.fixtureowner.vibeset',
  VIBESET_IOS_WIDGET_BUNDLE_ID: 'com.fixtureowner.vibeset.calendar',
  VIBESET_IOS_APP_GROUP: 'group.com.fixtureowner.vibeset',
  EXPO_PUBLIC_API_URL: 'https://api.fixture.invalid',
  EXPO_PUBLIC_CDN_URL: 'https://assets.fixture.invalid',
};

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
    ])
      expect(() =>
        assertNativeBuildEnvironment({ ...environment, EXPO_PUBLIC_API_URL: value }),
      ).toThrow();
  });
});
