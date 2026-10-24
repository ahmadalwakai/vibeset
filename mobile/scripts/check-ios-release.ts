import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { fetchTheme, fetchThemes } from '../lib/api';
import { assertNativeBuildEnvironment } from '../lib/build-config';

export const RELEASE_IDS = Object.freeze({
  bundleId: 'com.ahmadalwakai.vibeset',
  widgetBundleId: 'com.ahmadalwakai.vibeset.calendar',
  appGroup: 'group.com.ahmadalwakai.vibeset',
  teamId: 'BXK52CMHR2',
  appleId: '6826572844',
});

const version = z.string().regex(/^[1-9]\d{0,3}(?:\.\d{1,2}){0,2}$/);
export function releaseBuildNumber(latest: string, projectCounter: string): string {
  // The project-wide counter is unique for concurrent Codemagic workflows.
  // Never turn a failed ASC lookup into the first build or reuse latest+1 concurrently.
  const candidate = z
    .string()
    .regex(/^[1-9]\d{0,3}$/)
    .refine((value) => value === value.trim())
    .parse(projectCounter);
  if (!latest.trim()) return candidate;
  const previous = version.parse(latest.trim()).split('.').map(Number);
  const proposed = [Number(candidate), 0, 0];
  for (let index = 0; index < 3; index += 1) {
    const difference = (proposed[index] ?? 0) - (previous[index] ?? 0);
    if (difference > 0) return candidate;
    if (difference < 0) break;
  }
  throw new Error('The Codemagic project counter must exceed every uploaded build number.');
}

export function nativeBuildEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Xcode prints script-phase environments. Keep API credentials in the parent
  // for ASC/publishing, but remove them from native build tools and descendants.
  const child = { ...environment };
  for (const key of Object.keys(child))
    if (
      key.startsWith('APP_STORE_CONNECT_') ||
      [
        'CERTIFICATE_PRIVATE_KEY',
        'CERTIFICATE_PRIVATE_KEY_PASSWORD',
        'CERTIFICATE_PASSWORD',
        'CM_CERTIFICATE',
        'CM_CERTIFICATE_PASSWORD',
        'CM_PROVISIONING_PROFILE',
        'APP_SPECIFIC_PASSWORD',
      ].includes(key)
    )
      delete child[key];
  return child;
}

export function promoteVerifiedIpa(ipaDirectory: string, verifiedDirectory: string): void {
  const entries = readdirSync(ipaDirectory);
  const packages = entries.filter((name) => name.endsWith('.ipa'));
  if (packages.length !== 1) throw new Error('Expected one verified IPA.');
  const packagePath = resolve(ipaDirectory, z.string().parse(packages[0]));
  const info = lstatSync(packagePath);
  if (!info.isFile() || info.size === 0) throw new Error('Expected a nonempty regular IPA.');
  try {
    lstatSync(verifiedDirectory);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    // Same-parent rename is atomic: a failed promotion never exposes a partial IPA.
    renameSync(ipaDirectory, verifiedDirectory);
    return;
  }
  throw new Error('A publishable directory must not already exist.');
}

export function assertReleaseOrigins(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  const ids = assertNativeBuildEnvironment(environment);
  if (
    ids.bundleId !== RELEASE_IDS.bundleId ||
    ids.widgetBundleId !== RELEASE_IDS.widgetBundleId ||
    ids.appGroup !== RELEASE_IDS.appGroup ||
    environment.VIBESET_IOS_TEAM_ID !== RELEASE_IDS.teamId ||
    environment.APP_STORE_APPLE_ID !== RELEASE_IDS.appleId
  )
    throw new Error('Release identifiers do not match the verified Apple app.');
  for (const raw of [environment.EXPO_PUBLIC_API_URL, environment.EXPO_PUBLIC_CDN_URL]) {
    const url = new URL(z.string().parse(raw));
    if (
      !url.hostname.includes('.') ||
      /(?:^|\.)(?:example|invalid|test|localhost|local)$/.test(url.hostname) ||
      /^(?:\d+\.){3}\d+$/.test(url.hostname) ||
      url.hostname.includes(':') ||
      ['example.com', 'example.net', 'example.org'].some(
        (suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`),
      )
    )
      throw new Error('Release services must use explicitly configured public HTTPS hostnames.');
  }
}

const entitlementsSchema = z.object({
  'application-identifier': z.string(),
  'com.apple.developer.team-identifier': z.string(),
  'com.apple.security.application-groups': z.array(z.string()),
  'get-task-allow': z.boolean().optional(),
});
export function assertReleaseEntitlements(input: unknown, bundleId: string): void {
  const value = entitlementsSchema.parse(input);
  if (
    value['application-identifier'] !== `${RELEASE_IDS.teamId}.${bundleId}` ||
    value['com.apple.developer.team-identifier'] !== RELEASE_IDS.teamId ||
    value['get-task-allow'] === true ||
    value['com.apple.security.application-groups'].length !== 1 ||
    value['com.apple.security.application-groups'][0] !== RELEASE_IDS.appGroup
  )
    throw new Error('The signed target has incorrect release entitlements.');
}

export function assertReleaseProfile(input: unknown, bundleId: string, now = Date.now()): void {
  const profile = z
    .object({
      TeamIdentifier: z.array(z.string()),
      ExpirationDate: z.iso.datetime({ offset: true }),
      ProvisionedDevices: z.unknown().optional(),
      ProvisionsAllDevices: z.boolean().optional(),
      Entitlements: z.unknown(),
    })
    .parse(input);
  if (
    !profile.TeamIdentifier.includes(RELEASE_IDS.teamId) ||
    new Date(profile.ExpirationDate).getTime() <= now ||
    profile.ProvisionedDevices !== undefined ||
    profile.ProvisionsAllDevices === true
  )
    throw new Error('Both targets require unexpired App Store distribution profiles.');
  assertReleaseEntitlements(profile.Entitlements, bundleId);
}

export function assertReleaseExportOptions(input: unknown): void {
  const options = z
    .object({
      method: z.enum(['app-store', 'app-store-connect']),
      teamID: z.literal(RELEASE_IDS.teamId),
      signingStyle: z.literal('manual'),
      testFlightInternalTestingOnly: z.literal(true),
      manageAppVersionAndBuildNumber: z.literal(false),
      provisioningProfiles: z.record(z.string(), z.string().min(1)),
    })
    .parse(input);
  const keys = Object.keys(options.provisioningProfiles).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== RELEASE_IDS.bundleId ||
    keys[1] !== RELEASE_IDS.widgetBundleId
  )
    throw new Error('An exact app and calendar extension profile mapping is required.');
}

/** Both processes read the widget's same-App-Group UserDefaults suite. */
export function assertAppGroupPrivacyManifest(input: unknown): void {
  const manifest = z
    .object({
      NSPrivacyAccessedAPITypes: z.array(
        z.object({
          NSPrivacyAccessedAPIType: z.string(),
          NSPrivacyAccessedAPITypeReasons: z.array(z.string()),
        }),
      ),
    })
    .parse(input);
  if (
    !manifest.NSPrivacyAccessedAPITypes.some(
      (entry) =>
        entry.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryUserDefaults' &&
        entry.NSPrivacyAccessedAPITypeReasons.includes('1C8F.1'),
    )
  )
    throw new Error(
      'Both app and widget privacy manifests must declare App Group UserDefaults reason 1C8F.1.',
    );
}

function verifyAppPrivacyManifests(app: string): void {
  for (const target of [app, resolve(app, 'PlugIns/ExpoWidgetsTarget.appex')]) {
    const manifestPath = resolve(target, 'PrivacyInfo.xcprivacy');
    if (!lstatSync(manifestPath).isFile())
      throw new Error('Each compiled target requires its own ordinary privacy manifest resource.');
    assertAppGroupPrivacyManifest(plist(readFileSync(manifestPath)));
  }
}

async function checkLiveServices(): Promise<void> {
  assertReleaseOrigins(process.env);
  if (
    process.env.CM_TRIGGER_SOURCE !== 'api' ||
    process.env.CM_BRANCH !== 'main' ||
    process.env.CM_PULL_REQUEST === 'true'
  )
    throw new Error('The signed workflow must be started manually for the reviewed main branch.');
  const page = await fetchThemes({ sort: 'new', limit: 24 });
  const cdn = new URL(z.string().parse(process.env.EXPO_PUBLIC_CDN_URL)).origin;
  for (const card of page.items) {
    const theme = await fetchTheme(card.slug);
    const phone = theme.wallpapers.find((asset) => asset.size === 'phone');
    if (!phone || !theme.thumbUrl || !theme.previewHomeUrl) continue;
    for (const [raw, mime, bytes] of [
      [phone.url, 'image/jpeg', phone.bytes],
      [theme.thumbUrl, 'image/webp', undefined],
      [theme.previewHomeUrl, 'image/webp', undefined],
    ] as const) {
      const url = new URL(raw);
      if (url.origin !== cdn || url.search || url.hash || url.username || url.password)
        throw new Error('Published assets must match the configured public CDN.');
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'error',
        credentials: 'omit',
        signal: AbortSignal.timeout(15_000),
      });
      const length = response.headers.get('content-length');
      if (
        !response.ok ||
        response.redirected ||
        response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== mime ||
        length === null ||
        !/^\d+$/.test(length) ||
        Number(length) <= 0 ||
        (bytes !== undefined && Number(length) !== bytes)
      )
        throw new Error(
          'Published preview and wallpaper files must be accessible on the real CDN.',
        );
    }
    console.log('Release configuration, live published catalogue and CDN asset checks passed.');
    return;
  }
  throw new Error(
    'The beta needs at least one real published theme with previews and a phone wallpaper.',
  );
}

function plist(input: Uint8Array): unknown {
  // Stdlib parsing handles XML/binary plists and dates; certificate bytes are not printed or retained.
  const source =
    'import sys,json,plistlib,datetime; print(json.dumps(plistlib.loads(sys.stdin.buffer.read()),default=lambda v:v.replace(tzinfo=datetime.timezone.utc).isoformat() if isinstance(v,datetime.datetime) else None))';
  return JSON.parse(
    execFileSync('python3', ['-c', source], {
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
  );
}

function verifyArchive(): void {
  if (process.platform !== 'darwin') throw new Error('Signed archive verification requires macOS.');
  const archiveRoot = resolve('build/ios/xcarchive');
  const archives = readdirSync(archiveRoot).filter((name) => name.endsWith('.xcarchive'));
  if (archives.length !== 1) throw new Error('Expected one release archive.');
  const app = resolve(
    archiveRoot,
    z.string().parse(archives[0]),
    'Products/Applications/Vibeset.app',
  );
  const ipaRoot = resolve('build/ios/ipa');
  const packages = readdirSync(ipaRoot).filter((name) => name.endsWith('.ipa'));
  if (packages.length !== 1) throw new Error('Expected one exported IPA.');
  const inspection = resolve('build/ios-release/ipa-check');
  mkdirSync(inspection);
  execFileSync('ditto', ['-x', '-k', resolve(ipaRoot, z.string().parse(packages[0])), inspection], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exportedApp = resolve(inspection, 'Payload/Vibeset.app');
  const targets = [
    [app, RELEASE_IDS.bundleId],
    [resolve(app, 'PlugIns/ExpoWidgetsTarget.appex'), RELEASE_IDS.widgetBundleId],
    [exportedApp, RELEASE_IDS.bundleId],
    [resolve(exportedApp, 'PlugIns/ExpoWidgetsTarget.appex'), RELEASE_IDS.widgetBundleId],
  ] as const;
  const expectedVersion = z
    .object({ version: z.string() })
    .parse(JSON.parse(readFileSync('package.json', 'utf8'))).version;
  verifyAppPrivacyManifests(app);
  verifyAppPrivacyManifests(exportedApp);
  for (const [path, bundleId] of targets) {
    execFileSync('codesign', ['--verify', '--deep', '--strict', path], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const info = z
      .object({
        CFBundleIdentifier: z.string(),
        CFBundleVersion: z.string(),
        CFBundleShortVersionString: z.string(),
      })
      .parse(plist(readFileSync(resolve(path, 'Info.plist'))));
    if (
      info.CFBundleIdentifier !== bundleId ||
      info.CFBundleVersion !== process.env.VIBESET_NATIVE_BUILD_NUMBER ||
      info.CFBundleShortVersionString !== expectedVersion
    )
      throw new Error('Archived app/extension versions do not match the approved build.');
    assertReleaseEntitlements(
      plist(
        execFileSync('codesign', ['--display', '--entitlements', ':-', path], {
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      ),
      bundleId,
    );
    assertReleaseProfile(
      plist(
        execFileSync('security', ['cms', '-D', '-i', resolve(path, 'embedded.mobileprovision')], {
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      ),
      bundleId,
    );
  }
  for (const path of [app, exportedApp])
    if (!readFileSync(resolve(path, 'main.jsbundle')).byteLength)
      throw new Error('The release archive and IPA must contain bundled JavaScript.');
  assertReleaseExportOptions(plist(readFileSync('build/ios-release/export-options.plist')));
  console.log(
    'App and extension signatures, App Store profiles, App Group, privacy resources, versions and bundled JavaScript verified.',
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === 'privacy') {
    if (args.length !== 2) throw new Error('Provide exactly one compiled app directory.');
    verifyAppPrivacyManifests(resolve(z.string().min(1).parse(args[1])));
    console.log('Compiled app and widget App Group privacy manifest resources verified.');
    return;
  }
  if (args[0] === 'run-build') {
    const command = z.enum(['npm', 'pod', 'agvtool', 'xcode-project']).parse(args[1]);
    const result = spawnSync(command, args.slice(2), {
      env: nativeBuildEnvironment(process.env),
      stdio: 'inherit',
    });
    if (result.error || result.status !== 0) throw new Error('Native build command failed.');
    return;
  }
  if (args.length !== 1) throw new Error('Choose a release verification mode.');
  if (args[0] === 'preflight') await checkLiveServices();
  else if (args[0] === 'number')
    console.log(
      releaseBuildNumber(
        readFileSync('build/ios-release/latest-build-number.txt', 'utf8'),
        process.env.PROJECT_BUILD_NUMBER ?? '',
      ),
    );
  else if (args[0] === 'export-options')
    assertReleaseExportOptions(plist(readFileSync('build/ios-release/export-options.plist')));
  else if (args[0] === 'publishable') {
    verifyArchive();
    const checked = releaseBuildNumber(
      readFileSync('build/ios-release/latest-build-number.txt', 'utf8'),
      process.env.PROJECT_BUILD_NUMBER ?? '',
    );
    if (checked !== process.env.VIBESET_NATIVE_BUILD_NUMBER)
      throw new Error('The verified archive must use the current increasing CI build number.');
    promoteVerifiedIpa(resolve('build/ios/ipa'), resolve('build/ios/verified'));
  } else throw new Error('Unknown release check.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  void main().catch(() => {
    console.error(
      'Native release check failed. Verify the reviewed main branch, real services, ASC build counter, both App Store profiles and signed App Group entitlements. No upload was started by this check.',
    );
    process.exitCode = 1;
  });
