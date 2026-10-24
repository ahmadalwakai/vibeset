import { generateKeyPairSync } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import plist from '@expo/plist';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCloudProbeEnvironment,
  assertSavedDevelopmentFiles,
  assertDevelopmentSigning,
  assertDeviceBundle,
  classifyCloudProbeFailure,
  cloudExportOptions,
  cloudSigningCommands,
  runCloudSigningProbe,
} from '../scripts/probe-cloud-signing';
import type { ProbeCommand, ProbeCommandResult } from '../scripts/probe-cloud-signing';
import { RELEASE_IDS } from '../scripts/check-ios-release';

const privateKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();
const environment = {
  NODE_ENV: 'test' as const,
  VIBESET_NATIVE_CLOUD_PROBE: '1',
  VIBESET_NATIVE_GENERATE: 'compile',
  VIBESET_IOS_BUNDLE_ID: RELEASE_IDS.bundleId,
  VIBESET_IOS_WIDGET_BUNDLE_ID: RELEASE_IDS.widgetBundleId,
  VIBESET_IOS_APP_GROUP: RELEASE_IDS.appGroup,
  VIBESET_IOS_TEAM_ID: RELEASE_IDS.teamId,
  CM_TRIGGER_SOURCE: 'api',
  CM_BRANCH: 'main',
  APP_STORE_CONNECT_KEY_IDENTIFIER: 'ABC123DE45',
  APP_STORE_CONNECT_ISSUER_ID: 'd54c5562-4923-45c9-b0e9-630e2994ec22',
  APP_STORE_CONNECT_PRIVATE_KEY: privateKey,
  VIBESET_DEVELOPMENT_CERTIFICATE_PATH: resolve('fixture-development-certificate.p12'),
  VIBESET_DEVELOPMENT_APP_PROFILE_PATH: resolve('fixture-development-app.mobileprovision'),
  VIBESET_DEVELOPMENT_CALENDAR_PROFILE_PATH: resolve(
    'fixture-development-calendar.mobileprovision',
  ),
};
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function entitlement(bundleId: string, development: boolean): Record<string, unknown> {
  return {
    'application-identifier': `${RELEASE_IDS.teamId}.${bundleId}`,
    'com.apple.developer.team-identifier': RELEASE_IDS.teamId,
    'com.apple.security.application-groups': [RELEASE_IDS.appGroup],
    'get-task-allow': development,
  };
}
function profile(bundleId: string, development: boolean): Record<string, unknown> {
  return {
    TeamIdentifier: [RELEASE_IDS.teamId],
    ExpirationDate: '2099-10-24T00:00:00+00:00',
    Entitlements: entitlement(bundleId, development),
    ...(development ? { ProvisionedDevices: ['device-fixture'] } : {}),
  };
}
const deviceInfo = {
  CFBundleIdentifier: RELEASE_IDS.bundleId,
  CFBundleShortVersionString: '0.1.0',
  CFBundleVersion: '1',
  CFBundleSupportedPlatforms: ['iPhoneOS'],
  CFBundleExecutable: 'Vibeset',
};

describe('isolated cloud-signing diagnostic boundaries', () => {
  it('refuses missing, empty or non-file saved assets before starting any native probe', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'vibeset-missing-development-'));
    roots.push(cwd);
    const configured = {
      ...environment,
      VIBESET_DEVELOPMENT_CERTIFICATE_PATH: join(cwd, 'saved.p12'),
      VIBESET_DEVELOPMENT_APP_PROFILE_PATH: join(cwd, 'app.mobileprovision'),
      VIBESET_DEVELOPMENT_CALENDAR_PROFILE_PATH: join(cwd, 'calendar.mobileprovision'),
    };
    expect(() => assertSavedDevelopmentFiles(configured)).toThrow();
    let commands = 0;
    const result = runCloudSigningProbe(configured, cwd, () => {
      commands += 1;
      throw new Error('No native command may run without saved signing files.');
    });
    expect(commands).toBe(0);
    expect(result.failureCode).toBe('CONFIG');
    expect(result.signingAssetsMayHaveChanged).toBe(false);
    for (const file of [
      configured.VIBESET_DEVELOPMENT_CERTIFICATE_PATH,
      configured.VIBESET_DEVELOPMENT_APP_PROFILE_PATH,
      configured.VIBESET_DEVELOPMENT_CALENDAR_PROFILE_PATH,
    ])
      writeFileSync(file, 'saved-development-asset-fixture');
    expect(() => assertSavedDevelopmentFiles(configured)).not.toThrow();
    writeFileSync(configured.VIBESET_DEVELOPMENT_APP_PROFILE_PATH, '');
    expect(() => assertSavedDevelopmentFiles(configured)).toThrow();
    rmSync(configured.VIBESET_DEVELOPMENT_APP_PROFILE_PATH);
    mkdirSync(configured.VIBESET_DEVELOPMENT_APP_PROFILE_PATH);
    expect(() => assertSavedDevelopmentFiles(configured)).toThrow();
  });
  it('requires the existing integration, exact registered targets and explicit manual main, with no origins needed', () => {
    expect(() => assertCloudProbeEnvironment(environment)).not.toThrow();
    for (const patch of [
      { VIBESET_NATIVE_CLOUD_PROBE: undefined },
      { VIBESET_NATIVE_GENERATE: '1' },
      { CM_TRIGGER_SOURCE: 'webhook' },
      { CM_BRANCH: 'feature/other' },
      { CM_PULL_REQUEST: 'true' },
      { VIBESET_IOS_TEAM_ID: 'OTHERTEAM1' },
      { VIBESET_IOS_WIDGET_BUNDLE_ID: `${RELEASE_IDS.bundleId}.other` },
      { APP_STORE_CONNECT_PRIVATE_KEY: undefined },
      { VIBESET_DEVELOPMENT_CERTIFICATE_PATH: undefined },
      { VIBESET_DEVELOPMENT_APP_PROFILE_PATH: undefined },
      { VIBESET_DEVELOPMENT_CALENDAR_PROFILE_PATH: undefined },
      { APP_STORE_CONNECT_PRIVATE_KEY: 'PRIVATE_ERROR_FIXTURE' },
      { APP_STORE_CONNECT_KEY_IDENTIFIER: 'ABC123DE45\n' },
      { APP_STORE_CONNECT_ISSUER_ID: 'not-an-issuer' },
    ])
      expect(() => assertCloudProbeEnvironment({ ...environment, ...patch })).toThrow();
  });
  it('rejects simulator/mismatched bundles and inconsistent app-extension build versions', () => {
    expect(assertDeviceBundle(deviceInfo, RELEASE_IDS.bundleId, '0.1.0')).toBe('1');
    for (const patch of [
      { CFBundleSupportedPlatforms: ['iPhoneSimulator'] },
      { CFBundleIdentifier: RELEASE_IDS.widgetBundleId },
      { CFBundleShortVersionString: '0.2.0' },
      { CFBundleExecutable: '../../outside' },
    ])
      expect(() =>
        assertDeviceBundle({ ...deviceInfo, ...patch }, RELEASE_IDS.bundleId, '0.1.0'),
      ).toThrow();
    expect(() => assertDeviceBundle(deviceInfo, RELEASE_IDS.bundleId, '0.1.0', '2')).toThrow();
  });
  it('distinguishes a development archive from distribution, wrong-team, expired and missing-device profiles', () => {
    const valid = {
      profile: profile(RELEASE_IDS.bundleId, true),
      entitlements: entitlement(RELEASE_IDS.bundleId, true),
      authority: 'Authority=Apple Development: Fixture (BXK52CMHR2)\n',
    };
    expect(() => assertDevelopmentSigning(valid, RELEASE_IDS.bundleId)).not.toThrow();
    for (const patch of [
      { profile: profile(RELEASE_IDS.bundleId, false) },
      { authority: 'Authority=Apple Distribution: Fixture\n' },
      { profile: { ...profile(RELEASE_IDS.bundleId, true), ProvisionedDevices: [] } },
      {
        profile: { ...profile(RELEASE_IDS.bundleId, true), ExpirationDate: '2000-01-01T00:00:00Z' },
      },
      {
        entitlements: {
          ...entitlement(RELEASE_IDS.bundleId, true),
          'com.apple.security.application-groups': ['group.other'],
        },
      },
    ])
      expect(() =>
        assertDevelopmentSigning({ ...valid, ...patch }, RELEASE_IDS.bundleId),
      ).toThrow();
  });
  it('uses automatic cloud export to disk, never upload/manual certificate mappings/revocation fallbacks', () => {
    const options = cloudExportOptions();
    expect(options).toMatchObject({
      method: 'app-store-connect',
      destination: 'export',
      signingStyle: 'automatic',
      teamID: RELEASE_IDS.teamId,
      testFlightInternalTestingOnly: true,
      manageAppVersionAndBuildNumber: false,
    });
    expect(options).not.toHaveProperty('provisioningProfiles');
    expect(options).not.toHaveProperty('signingCertificate');
    const commands = cloudSigningCommands(
      resolve('private-fixture'),
      environment.APP_STORE_CONNECT_KEY_IDENTIFIER,
      environment.APP_STORE_CONNECT_ISSUER_ID,
    );
    expect(commands.archive).toContain('generic/platform=iOS');
    expect(commands.archive).toContain('CODE_SIGN_IDENTITY=Apple Development');
    expect(commands.archive).not.toContain('-allowProvisioningUpdates');
    expect(commands.archive).not.toContain('-authenticationKeyPath');
    expect(commands.export).toContain('-exportArchive');
    expect(commands.export).toContain('-authenticationKeyPath');
    expect([...commands.archive, ...commands.export].join(' ')).not.toMatch(
      /upload|revoke|delete|ipa-directory/i,
    );
  });
  it.each([
    ['Cloud signing permission error: no access to cloud-managed certificates', 'CLOUD_PERMISSION'],
    [
      'You already have a current Distribution certificate or a pending certificate request',
      'CERTIFICATE_QUOTA',
    ],
    ['No signing certificate "Apple Development" found', 'DEVELOPMENT_IDENTITY'],
    ['No devices registered to create a provisioning profile', 'PROVISIONING'],
    ['Authentication failed HTTP 401', 'AUTHENTICATION'],
    [
      'Command line invocation: xcodebuild -authenticationKeyID REDACTED\nerror: No devices registered to create a provisioning profile',
      'PROVISIONING',
    ],
    [
      'Command line invocation: xcodebuild -authenticationKeyPath REDACTED\nerror: Swift compilation failed',
      'EXPORT',
    ],
    ['unexpected PRIVATE_ERROR_FIXTURE', 'EXPORT'],
  ] as const)('classifies only controlled failure categories from %s', (message, expected) => {
    expect(classifyCloudProbeFailure(message, 'EXPORT')).toBe(expected);
  });
});

function exercise(
  failure?: 'permission' | 'timeout' | 'invalid-ipa' | 'stale-warning' | 'archive-timeout',
): {
  result: ReturnType<typeof runCloudSigningProbe>;
  calls: ProbeCommand[];
  privateRoot: string;
  cwd: string;
} {
  const cwd = mkdtempSync(join(tmpdir(), 'vibeset-cloud-probe-test-'));
  roots.push(cwd);
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version: '0.1.0' }));
  const calls: ProbeCommand[] = [];
  const configured = {
    ...environment,
    VIBESET_DEVELOPMENT_CERTIFICATE_PATH: join(cwd, 'development.p12'),
    VIBESET_DEVELOPMENT_APP_PROFILE_PATH: join(cwd, 'app.mobileprovision'),
    VIBESET_DEVELOPMENT_CALENDAR_PROFILE_PATH: join(cwd, 'calendar.mobileprovision'),
  };
  for (const file of [
    configured.VIBESET_DEVELOPMENT_CERTIFICATE_PATH,
    configured.VIBESET_DEVELOPMENT_APP_PROFILE_PATH,
    configured.VIBESET_DEVELOPMENT_CALENDAR_PROFILE_PATH,
  ])
    writeFileSync(file, 'saved-development-asset-fixture');
  let privateRoot = '';
  const writeBundle = (app: string): void => {
    for (const [target, bundleId, executable] of [
      [app, RELEASE_IDS.bundleId, 'Vibeset'],
      [
        join(app, 'PlugIns/ExpoWidgetsTarget.appex'),
        RELEASE_IDS.widgetBundleId,
        'ExpoWidgetsTarget',
      ],
    ] as const) {
      mkdirSync(target, { recursive: true });
      writeFileSync(
        join(target, 'Info.plist'),
        plist.build({
          ...deviceInfo,
          CFBundleIdentifier: bundleId,
          CFBundleExecutable: executable,
        }),
      );
      writeFileSync(join(target, executable), 'test-device-executable');
      writeFileSync(
        join(target, 'PrivacyInfo.xcprivacy'),
        plist.build({
          NSPrivacyAccessedAPITypes: [
            {
              NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
              NSPrivacyAccessedAPITypeReasons: ['1C8F.1'],
            },
          ],
        }),
      );
    }
    writeFileSync(join(app, 'main.jsbundle'), 'test-bundled-javascript');
  };
  const runner = (request: ProbeCommand): ProbeCommandResult => {
    calls.push(request);
    expect(request.timeoutMs).toBeGreaterThan(0);
    expect(request.timeoutMs).toBeLessThanOrEqual(30 * 60_000);
    expect(
      Object.keys(request.environment).filter((key) => key.startsWith('APP_STORE_CONNECT_')),
    ).toEqual([]);
    const out = (value = '', error = '') => ({
      stdout: Buffer.from(value),
      stderr: Buffer.from(error),
    });
    if (request.command === 'xcodebuild') {
      const archive = request.args[request.args.indexOf('-archivePath') + 1];
      if (!archive) throw new Error('Missing archive fixture path');
      privateRoot = dirname(archive);
      expect(readFileSync(join(privateRoot, 'AuthKey.p8'), 'utf8')).toBe(privateKey);
      if (process.platform !== 'win32')
        expect(statSync(join(privateRoot, 'AuthKey.p8')).mode & 0o777).toBe(0o600);
      if (request.args.includes('-exportArchive')) {
        if (failure === 'permission') {
          writeFileSync(
            request.logPath ?? '',
            'Cloud signing permission error PRIVATE_ERROR_FIXTURE',
          );
          throw new Error('PRIVATE_ERROR_FIXTURE');
        }
        if (failure === 'timeout') throw new Error('PROBE_TIMEOUT');
        const directory = join(privateRoot, 'export');
        mkdirSync(directory);
        writeFileSync(join(directory, 'Vibeset.ipa'), 'test-ipa');
      } else {
        if (failure === 'archive-timeout') throw new Error('PROBE_TIMEOUT');
        const app = join(archive, 'Products/Applications/Vibeset.app');
        writeBundle(app);
        if (failure === 'stale-warning') {
          writeFileSync(
            request.logPath ?? '',
            'warning: historical Cloud signing permission error',
          );
          writeFileSync(
            join(app, 'Info.plist'),
            plist.build({ ...deviceInfo, CFBundleSupportedPlatforms: ['iPhoneSimulator'] }),
          );
        }
      }
      return out();
    }
    if (request.command === 'python3') {
      if (!request.input) throw new Error('Fixture plist input missing');
      return request.args[1]?.includes('plistlib.dumps')
        ? out(plist.build(JSON.parse(request.input.toString('utf8'))))
        : out(JSON.stringify(plist.parse(request.input.toString('utf8'))));
    }
    const target = request.args.at(-1) ?? '';
    const bundleId = target.includes('ExpoWidgetsTarget.appex')
      ? RELEASE_IDS.widgetBundleId
      : RELEASE_IDS.bundleId;
    const development = target.includes('Vibeset.xcarchive');
    if (request.command === 'security') return out(plist.build(profile(bundleId, development)));
    if (request.command === 'codesign') {
      if (request.args.includes('--entitlements'))
        return out(plist.build(entitlement(bundleId, development)));
      if (request.args.includes('--verbose=4'))
        return out(
          '',
          `Authority=Apple ${development ? 'Development' : 'Distribution'}: Fixture\n`,
        );
      return out();
    }
    if (request.command === 'ditto') {
      const app = join(target, 'Payload/Vibeset.app');
      writeBundle(app);
      if (failure === 'invalid-ipa')
        writeFileSync(
          join(app, 'Info.plist'),
          plist.build({ ...deviceInfo, CFBundleSupportedPlatforms: ['iPhoneSimulator'] }),
        );
      return out();
    }
    throw new Error('Unexpected fixture command');
  };
  const result = runCloudSigningProbe(configured, cwd, runner);
  return { result, calls, privateRoot, cwd };
}

describe('cloud probe orchestration with fake native tools and real temporary filesystem', () => {
  it('validates both signing kinds and removes its private probe directory, retaining only an honest non-upload summary', () => {
    const { result, calls, privateRoot, cwd } = exercise();
    expect(result).toMatchObject({
      archiveVerified: true,
      cloudExportVerified: true,
      probeDirectoryRemoved: true,
      signingAssetsMayHaveChanged: true,
      uploaded: false,
      testFlightReady: false,
    });
    expect(result.failureCode).toBeUndefined();
    expect(calls.filter(({ command }) => command === 'xcodebuild')).toHaveLength(2);
    expect(existsSync(privateRoot)).toBe(false);
    const json = readFileSync(join(cwd, 'build/cloud-signing-diagnostics/summary.json'), 'utf8');
    expect(JSON.parse(json)).toEqual(result);
    expect(json).not.toContain('PRIVATE KEY');
    expect(json).not.toContain('PRIVATE_ERROR_FIXTURE');
    expect(json).not.toContain(privateRoot);
  });
  it.each(['permission', 'timeout', 'invalid-ipa'] as const)(
    'fails safely on %s without upload, retained IPA or raw error output',
    (failure) => {
      const { result, calls, privateRoot, cwd } = exercise(failure);
      expect(result.archiveVerified).toBe(true);
      expect(result.cloudExportVerified).toBe(false);
      expect(result.signingAssetsMayHaveChanged).toBe(true);
      expect(result.failureCode).toBe(
        failure === 'permission'
          ? 'CLOUD_PERMISSION'
          : failure === 'timeout'
            ? 'TIMEOUT'
            : 'VERIFICATION',
      );
      expect(result.probeDirectoryRemoved).toBe(true);
      expect(existsSync(privateRoot)).toBe(false);
      expect(calls.some(({ args }) => args.includes('upload'))).toBe(false);
      expect(
        readFileSync(join(cwd, 'build/cloud-signing-diagnostics/summary.json'), 'utf8'),
      ).not.toContain('PRIVATE_ERROR_FIXTURE');
    },
  );
  it('does not let a prior successful stage warning mask bundle verification failure or start export', () => {
    const { result, calls } = exercise('stale-warning');
    expect(result.failureCode).toBe('VERIFICATION');
    expect(result.archiveVerified).toBe(false);
    expect(result.signingAssetsMayHaveChanged).toBe(false);
    expect(calls.filter(({ command }) => command === 'xcodebuild')).toHaveLength(1);
  });
  it('cleans up a timed-out archive and never starts cloud export afterward', () => {
    const { result, calls, privateRoot } = exercise('archive-timeout');
    expect(result.failureCode).toBe('TIMEOUT');
    expect(result.archiveVerified).toBe(false);
    expect(result.signingAssetsMayHaveChanged).toBe(false);
    expect(result.probeDirectoryRemoved).toBe(true);
    expect(existsSync(privateRoot)).toBe(false);
    expect(calls.filter(({ command }) => command === 'xcodebuild')).toHaveLength(1);
  });
});
