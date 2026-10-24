import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertReleaseEntitlements,
  assertReleaseExportOptions,
  assertReleaseOrigins,
  assertReleaseProfile,
  releaseBuildNumber,
  RELEASE_IDS,
  nativeBuildEnvironment,
  promoteVerifiedIpa,
} from '../scripts/check-ios-release';

const environment = {
  VIBESET_IOS_BUNDLE_ID: RELEASE_IDS.bundleId,
  VIBESET_IOS_WIDGET_BUNDLE_ID: RELEASE_IDS.widgetBundleId,
  VIBESET_IOS_APP_GROUP: RELEASE_IDS.appGroup,
  VIBESET_IOS_TEAM_ID: RELEASE_IDS.teamId,
  APP_STORE_APPLE_ID: RELEASE_IDS.appleId,
  EXPO_PUBLIC_API_URL: 'https://vibeset.app',
  EXPO_PUBLIC_CDN_URL: 'https://cdn.vibeset.app',
};
function entitlements(bundleId: string) {
  return {
    'application-identifier': `${RELEASE_IDS.teamId}.${bundleId}`,
    'com.apple.developer.team-identifier': RELEASE_IDS.teamId,
    'com.apple.security.application-groups': [RELEASE_IDS.appGroup],
    'get-task-allow': false,
  };
}
const exportOptions = {
  method: 'app-store-connect',
  teamID: RELEASE_IDS.teamId,
  signingStyle: 'manual',
  testFlightInternalTestingOnly: true,
  manageAppVersionAndBuildNumber: false,
  provisioningProfiles: {
    [RELEASE_IDS.bundleId]: 'test-main-profile',
    [RELEASE_IDS.widgetBundleId]: 'test-widget-profile',
  },
};

describe('signed native release gates', () => {
  it('strips signing integration credentials from build descendants without mutating publisher credentials', () => {
    const parent = {
      NODE_ENV: 'test' as const,
      APP_STORE_CONNECT_PRIVATE_KEY: 'test-private-value',
      APP_STORE_CONNECT_KEY_IDENTIFIER: 'test-key-id',
      APP_STORE_CONNECT_ISSUER_ID: 'test-issuer-id',
      APP_STORE_CONNECT_API_KEY_KEY: 'test-alias',
      CERTIFICATE_PRIVATE_KEY: 'test-certificate-key',
      CERTIFICATE_PRIVATE_KEY_PASSWORD: 'test-certificate-password',
      CM_CERTIFICATE: 'test-certificate',
      CM_CERTIFICATE_PASSWORD: 'test-password',
      CM_PROVISIONING_PROFILE: 'test-profile',
      CERTIFICATE_PASSWORD: 'test-password',
      APP_SPECIFIC_PASSWORD: 'test-password',
      EXPO_PUBLIC_API_URL: environment.EXPO_PUBLIC_API_URL,
      APP_STORE_APPLE_ID: RELEASE_IDS.appleId,
      PATH: '/usr/bin',
      VIBESET_NATIVE_BUILD_NUMBER: '23',
    };
    expect(nativeBuildEnvironment(parent)).toEqual({
      NODE_ENV: 'test',
      EXPO_PUBLIC_API_URL: environment.EXPO_PUBLIC_API_URL,
      APP_STORE_APPLE_ID: RELEASE_IDS.appleId,
      PATH: '/usr/bin',
      VIBESET_NATIVE_BUILD_NUMBER: '23',
    });
    expect(parent.APP_STORE_CONNECT_PRIVATE_KEY).toBe('test-private-value');
  });
  it('atomically promotes exactly one nonempty IPA and refuses stale publishable output', () => {
    const root = mkdtempSync(join(tmpdir(), 'vibeset-release-'));
    const raw = join(root, 'ipa');
    const ready = join(root, 'verified');
    try {
      mkdirSync(raw);
      expect(() => promoteVerifiedIpa(raw, ready)).toThrow();
      expect(existsSync(ready)).toBe(false);
      writeFileSync(join(raw, 'Vibeset.ipa'), '');
      expect(() => promoteVerifiedIpa(raw, ready)).toThrow();
      expect(existsSync(ready)).toBe(false);
      writeFileSync(join(raw, 'Vibeset.ipa'), 'test-ipa-bytes');
      writeFileSync(join(raw, 'second.ipa'), 'second-test-ipa');
      expect(() => promoteVerifiedIpa(raw, ready)).toThrow();
      expect(existsSync(ready)).toBe(false);
      rmSync(join(raw, 'second.ipa'));
      promoteVerifiedIpa(raw, ready);
      expect(readFileSync(join(ready, 'Vibeset.ipa'), 'utf8')).toBe('test-ipa-bytes');
      expect(existsSync(raw)).toBe(false);
      mkdirSync(raw);
      writeFileSync(join(raw, 'Vibeset.ipa'), 'new-test-ipa');
      expect(() => promoteVerifiedIpa(raw, ready)).toThrow();
      expect(readFileSync(join(ready, 'Vibeset.ipa'), 'utf8')).toBe('test-ipa-bytes');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('uses unique CI counters and compares all three ASC version components without latest+1 fallback', () => {
    expect(releaseBuildNumber('', '23')).toBe('23');
    expect(releaseBuildNumber('22\n', '23')).toBe('23');
    expect(releaseBuildNumber('22.99.99', '23')).toBe('23');
    expect(() => releaseBuildNumber('23', '23')).toThrow();
    expect(() => releaseBuildNumber('23.0.1', '23')).toThrow();
    expect(() => releaseBuildNumber('24', '23')).toThrow();
  });
  it.each(['0', '-1', '1\n', '1.2', '10000', 'not-a-counter', ''])(
    'refuses invalid CI counter %j',
    (counter) => {
      expect(() => releaseBuildNumber('', counter)).toThrow();
    },
  );
  it.each(['null', 'Permission denied', '1.234', '10000', '1.2.3.4'])(
    'never interprets unexpected ASC output %j as no builds',
    (latest) => {
      expect(() => releaseBuildNumber(latest, '100')).toThrow();
    },
  );
  it('validates exact public configuration without claiming live availability', () => {
    expect(() => assertReleaseOrigins(environment)).not.toThrow();
    expect(() =>
      assertReleaseOrigins({ ...environment, VIBESET_IOS_TEAM_ID: 'OTHERTEAM1' }),
    ).toThrow();
    expect(() =>
      assertReleaseOrigins({
        ...environment,
        VIBESET_IOS_WIDGET_BUNDLE_ID: `${RELEASE_IDS.bundleId}.other`,
      }),
    ).toThrow();
  });
  it.each([
    'https://example.com',
    'https://api.example.com',
    'https://api.example',
    'https://cdn.invalid',
    'https://localhost',
    'https://192.168.1.2',
    'http://vibeset.app',
    'https://vibeset.app/path',
    'https://user:password@vibeset.app',
  ])('refuses placeholder/private/insecure release origin %s', (origin) => {
    expect(() => assertReleaseOrigins({ ...environment, EXPO_PUBLIC_API_URL: origin })).toThrow();
  });
  it.each([RELEASE_IDS.bundleId, RELEASE_IDS.widgetBundleId])(
    'requires the matching team, release identity and exact App Group for %s',
    (bundleId) => {
      const valid = entitlements(bundleId);
      expect(() => assertReleaseEntitlements(valid, bundleId)).not.toThrow();
      for (const invalid of [
        { ...valid, 'application-identifier': `${RELEASE_IDS.teamId}.other.app` },
        { ...valid, 'com.apple.developer.team-identifier': 'OTHERTEAM1' },
        { ...valid, 'get-task-allow': true },
        { ...valid, 'com.apple.security.application-groups': [] },
        {
          ...valid,
          'com.apple.security.application-groups': [RELEASE_IDS.appGroup, 'group.unrelated'],
        },
      ])
        expect(() => assertReleaseEntitlements(invalid, bundleId)).toThrow();
    },
  );
  it('rejects expired, ad-hoc, enterprise or wrong-team profiles before upload', () => {
    const now = new Date('2026-10-24T12:00:00Z').getTime();
    const valid = {
      TeamIdentifier: [RELEASE_IDS.teamId],
      ExpirationDate: '2027-10-24T00:00:00+00:00',
      Entitlements: entitlements(RELEASE_IDS.bundleId),
    };
    expect(() => assertReleaseProfile(valid, RELEASE_IDS.bundleId, now)).not.toThrow();
    for (const invalid of [
      { ...valid, ExpirationDate: '2026-10-24T12:00:00Z' },
      { ...valid, ProvisionedDevices: [] },
      { ...valid, ProvisionsAllDevices: true },
      { ...valid, TeamIdentifier: ['OTHERTEAM1'] },
      { ...valid, Entitlements: entitlements(RELEASE_IDS.widgetBundleId) },
    ])
      expect(() => assertReleaseProfile(invalid, RELEASE_IDS.bundleId, now)).toThrow();
  });
  it('requires both exact profiles and internal-only, manual export without automatic version rewriting', () => {
    expect(() => assertReleaseExportOptions(exportOptions)).not.toThrow();
    for (const invalid of [
      { ...exportOptions, provisioningProfiles: { [RELEASE_IDS.bundleId]: 'only-main' } },
      { ...exportOptions, testFlightInternalTestingOnly: false },
      { ...exportOptions, manageAppVersionAndBuildNumber: true },
      { ...exportOptions, signingStyle: 'automatic' },
      { ...exportOptions, method: 'ad-hoc' },
      { ...exportOptions, teamID: 'OTHERTEAM1' },
    ])
      expect(() => assertReleaseExportOptions(invalid)).toThrow();
  });
});
