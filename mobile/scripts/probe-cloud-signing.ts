import { spawnSync } from 'node:child_process';
import { createPrivateKey } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { assertNativeCompileEnvironment } from '../lib/build-config';
import {
  assertAppGroupPrivacyManifest,
  assertReleaseEntitlements,
  assertReleaseProfile,
  nativeBuildEnvironment,
  RELEASE_IDS,
} from './check-ios-release';

const failureCodeSchema = z.enum([
  'CONFIG',
  'AUTHENTICATION',
  'CLOUD_PERMISSION',
  'CERTIFICATE_QUOTA',
  'DEVELOPMENT_IDENTITY',
  'PROVISIONING',
  'TIMEOUT',
  'ARCHIVE',
  'EXPORT',
  'VERIFICATION',
  'CLEANUP',
]);
export type CloudProbeFailure = z.infer<typeof failureCodeSchema>;
const stageSchema = z.enum([
  'device-archive',
  'archive-verification',
  'cloud-export',
  'export-verification',
]);
type Stage = z.infer<typeof stageSchema>;
const summarySchema = z
  .object({
    version: z.literal(1),
    purpose: z.literal('signing-diagnostic-only'),
    uploaded: z.literal(false),
    testFlightReady: z.literal(false),
    archiveVerified: z.boolean(),
    cloudExportVerified: z.boolean(),
    probeDirectoryRemoved: z.boolean(),
    signingAssetsMayHaveChanged: z.boolean(),
    failureCode: failureCodeSchema.optional(),
    stages: z.array(
      z.object({ stage: stageSchema, succeeded: z.boolean(), elapsedMs: z.number().nonnegative() }),
    ),
  })
  .strict();
export type CloudProbeSummary = z.infer<typeof summarySchema>;

export interface ProbeCommand {
  command: 'xcodebuild' | 'codesign' | 'security' | 'python3' | 'ditto';
  args: string[];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  timeoutMs: number;
  logPath?: string;
  input?: Buffer;
}
export interface ProbeCommandResult {
  stdout: Buffer;
  stderr: Buffer;
}
type ProbeRunner = (request: ProbeCommand) => ProbeCommandResult;

function assertCredentials(environment: NodeJS.ProcessEnv): {
  keyId: string;
  issuerId: string;
  pem: string;
} {
  try {
    const keyId = z
      .string()
      .regex(/^[A-Z0-9]{10}$/)
      .length(10)
      .parse(environment.APP_STORE_CONNECT_KEY_IDENTIFIER);
    const issuerId = z.uuid().length(36).parse(environment.APP_STORE_CONNECT_ISSUER_ID);
    const pem = z.string().min(1).max(16_384).parse(environment.APP_STORE_CONNECT_PRIVATE_KEY);
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
      throw new Error('Wrong API key type.');
    return { keyId, issuerId, pem: key.export({ type: 'pkcs8', format: 'pem' }).toString() };
  } catch {
    throw new Error(
      'The existing Codemagic integration must provide a valid App Store Connect team API key.',
    );
  }
}

export function assertCloudProbeEnvironment(environment: NodeJS.ProcessEnv): void {
  const ids = assertNativeCompileEnvironment(environment);
  if (
    environment.VIBESET_NATIVE_CLOUD_PROBE !== '1' ||
    environment.VIBESET_NATIVE_GENERATE !== 'compile' ||
    environment.CM_TRIGGER_SOURCE !== 'api' ||
    environment.CM_BRANCH !== 'main' ||
    environment.CM_PULL_REQUEST === 'true' ||
    ids.bundleId !== RELEASE_IDS.bundleId ||
    ids.widgetBundleId !== RELEASE_IDS.widgetBundleId ||
    ids.appGroup !== RELEASE_IDS.appGroup ||
    environment.VIBESET_IOS_TEAM_ID !== RELEASE_IDS.teamId
  )
    throw new Error(
      'The diagnostic requires an explicit manual main-branch run for the registered targets.',
    );
  for (const key of [
    'VIBESET_DEVELOPMENT_CERTIFICATE_PATH',
    'VIBESET_DEVELOPMENT_APP_PROFILE_PATH',
    'VIBESET_DEVELOPMENT_CALENDAR_PROFILE_PATH',
  ])
    z.string()
      .min(1)
      .max(4096)
      .refine((value) => isAbsolute(value) && !/[\p{Cc}\p{Cf}]/u.test(value))
      .parse(environment[key]);
  assertCredentials(environment);
}

export function assertSavedDevelopmentFiles(environment: NodeJS.ProcessEnv): void {
  for (const key of [
    'VIBESET_DEVELOPMENT_CERTIFICATE_PATH',
    'VIBESET_DEVELOPMENT_APP_PROFILE_PATH',
    'VIBESET_DEVELOPMENT_CALENDAR_PROFILE_PATH',
  ]) {
    const file = z.string().parse(environment[key]);
    const info = lstatSync(file);
    if (!info.isFile() || !info.size || info.size > 1024 * 1024)
      throw new Error(
        'Saved development certificate and both actual-device profiles are required.',
      );
  }
}

/** Additional checks are specific to the development archive; release guards stay unchanged. */
export function assertDevelopmentSigning(
  input: {
    profile: unknown;
    entitlements: unknown;
    authority: string;
  },
  bundleId: string,
  now = Date.now(),
): void {
  const profile = z
    .object({
      TeamIdentifier: z.array(z.string()),
      ExpirationDate: z.iso.datetime({ offset: true }),
      ProvisionedDevices: z.array(z.string().min(1)).min(1),
      ProvisionsAllDevices: z.boolean().optional(),
      Entitlements: z.object({
        'application-identifier': z.literal(`${RELEASE_IDS.teamId}.${bundleId}`),
        'com.apple.developer.team-identifier': z.literal(RELEASE_IDS.teamId),
        'com.apple.security.application-groups': z.tuple([z.literal(RELEASE_IDS.appGroup)]),
        'get-task-allow': z.literal(true),
      }),
    })
    .parse(input.profile);
  if (
    !profile.TeamIdentifier.includes(RELEASE_IDS.teamId) ||
    Date.parse(profile.ExpirationDate) <= now ||
    profile.ProvisionsAllDevices === true ||
    !/^Authority=(?:Apple Development|iPhone Developer):[^\r\n]+$/m.test(input.authority)
  )
    throw new Error(
      'A matching unexpired Apple Development identity and development profile are required.',
    );
  // Release archives can disable debugger access even when signed for development.
  const entitlements = z
    .object({ 'get-task-allow': z.boolean().optional() })
    .passthrough()
    .parse(input.entitlements);
  assertReleaseEntitlements({ ...entitlements, 'get-task-allow': false }, bundleId);
}

export function assertDeviceBundle(
  input: unknown,
  bundleId: string,
  expectedVersion: string,
  expectedBuild?: string,
): string {
  const info = z
    .object({
      CFBundleIdentifier: z.literal(bundleId),
      CFBundleShortVersionString: z.literal(expectedVersion),
      CFBundleVersion: z.string().min(1).max(32),
      CFBundleSupportedPlatforms: z.tuple([z.literal('iPhoneOS')]),
      CFBundleExecutable: z.string().regex(/^[A-Za-z0-9_-]+$/),
    })
    .parse(input);
  if (expectedBuild !== undefined && info.CFBundleVersion !== expectedBuild)
    throw new Error('Both targets and the export must retain the same archive build number.');
  return info.CFBundleVersion;
}

export function cloudExportOptions(): Record<string, string | boolean> {
  return {
    method: 'app-store-connect',
    destination: 'export',
    signingStyle: 'automatic',
    teamID: RELEASE_IDS.teamId,
    manageAppVersionAndBuildNumber: false,
    testFlightInternalTestingOnly: true,
  };
}

export function cloudSigningCommands(
  privateRoot: string,
  keyId: string,
  issuerId: string,
): { archive: string[]; export: string[] } {
  if (!isAbsolute(privateRoot))
    throw new Error('A private absolute working directory is required.');
  const authentication = [
    '-allowProvisioningUpdates',
    '-authenticationKeyIssuerID',
    issuerId,
    '-authenticationKeyID',
    keyId,
    '-authenticationKeyPath',
    join(privateRoot, 'AuthKey.p8'),
  ];
  const archivePath = join(privateRoot, 'Vibeset.xcarchive');
  return {
    archive: [
      '-workspace',
      'ios/Vibeset.xcworkspace',
      '-scheme',
      'Vibeset',
      '-configuration',
      'Release',
      '-sdk',
      'iphoneos',
      '-destination',
      'generic/platform=iOS',
      '-archivePath',
      archivePath,
      '-derivedDataPath',
      join(privateRoot, 'DerivedData'),
      `DEVELOPMENT_TEAM=${RELEASE_IDS.teamId}`,
      'CODE_SIGN_STYLE=Automatic',
      'CODE_SIGN_IDENTITY=Apple Development',
      'archive',
    ],
    export: [
      '-exportArchive',
      '-archivePath',
      archivePath,
      '-exportOptionsPlist',
      join(privateRoot, 'ExportOptions.plist'),
      '-exportPath',
      join(privateRoot, 'export'),
      ...authentication,
    ],
  };
}

export function classifyCloudProbeFailure(
  output: string,
  fallback: CloudProbeFailure,
): CloudProbeFailure {
  if (
    /cloud signing permission|access to cloud-managed|CLOUD_MANAGED_APP_DISTRIBUTION/i.test(output)
  )
    return 'CLOUD_PERMISSION';
  if (
    /current.{0,40}certificate|pending certificate request|maximum.{0,40}certificate|certificate.{0,30}limit/i.test(
      output,
    )
  )
    return 'CERTIFICATE_QUOTA';
  if (
    /revoke certificate|no signing certificate ["']?(?:Apple Development|iPhone Developer)|private key.{0,40}not.{0,20}(?:installed|found)/i.test(
      output,
    )
  )
    return 'DEVELOPMENT_IDENTITY';
  if (
    /\b(?:authentication|authorization)\s+(?:failed|error|denied)|\b(?:failed|unable) to authenticate|\bunauthorized\b|invalid.{0,20}(?:JWT|API key)|HTTP.{0,5}401/i.test(
      output,
    )
  )
    return 'AUTHENTICATION';
  if (/no profiles|provisioning profile|no devices|register.{0,30}device/i.test(output))
    return 'PROVISIONING';
  return fallback;
}

function runCommand(request: ProbeCommand): ProbeCommandResult {
  const descriptor = request.logPath ? openSync(request.logPath, 'a', 0o600) : undefined;
  try {
    // On macOS, supervise the complete native-tool process group. Killing only
    // xcodebuild could leave build scripts running while their directory is removed.
    const supervisor = [
      'import os,signal,subprocess,sys',
      'child=subprocess.Popen(sys.argv[2:],start_new_session=True)',
      'def stop(*_):',
      ' try: os.killpg(child.pid,signal.SIGKILL)',
      ' except ProcessLookupError: pass',
      ' child.wait()',
      'signal.signal(signal.SIGTERM,stop)',
      'try:',
      ' code=child.wait(timeout=float(sys.argv[1]))',
      'except subprocess.TimeoutExpired:',
      ' stop()',
      ' sys.exit(124)',
      'except BaseException:',
      ' stop()',
      ' raise',
      'sys.exit(code if code>=0 else 128-code)',
    ].join('\n');
    const result = spawnSync(
      'python3',
      ['-c', supervisor, String(request.timeoutMs / 1000), request.command, ...request.args],
      {
        cwd: request.cwd,
        env: request.environment,
        timeout: request.timeoutMs + 10_000,
        killSignal: 'SIGKILL',
        maxBuffer: 2 * 1024 * 1024,
        input: request.input,
        stdio:
          descriptor === undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', descriptor, descriptor],
      },
    );
    if (result.error || result.status !== 0) {
      const timeout =
        result.status === 124 ||
        (result.error && 'code' in result.error && result.error.code === 'ETIMEDOUT');
      throw new Error(timeout ? 'PROBE_TIMEOUT' : 'PROBE_COMMAND_FAILED');
    }
    return { stdout: result.stdout ?? Buffer.alloc(0), stderr: result.stderr ?? Buffer.alloc(0) };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function tail(file: string): string {
  try {
    const size = lstatSync(file).size;
    const bytes = Buffer.alloc(Math.min(size, 16_384));
    const descriptor = openSync(file, 'r');
    try {
      readSync(descriptor, bytes, 0, bytes.length, Math.max(0, size - bytes.length));
    } finally {
      closeSync(descriptor);
    }
    return bytes.toString('utf8');
  } catch {
    return '';
  }
}

/** A throwaway export only: no upload command, publishing hook or distributable artifact. */
export function runCloudSigningProbe(
  environment: NodeJS.ProcessEnv,
  cwd: string,
  runner: ProbeRunner = runCommand,
): CloudProbeSummary {
  const summary: CloudProbeSummary = {
    version: 1,
    purpose: 'signing-diagnostic-only',
    uploaded: false,
    testFlightReady: false,
    archiveVerified: false,
    cloudExportVerified: false,
    probeDirectoryRemoved: false,
    signingAssetsMayHaveChanged: false,
    stages: [],
  };
  let privateRoot: string | undefined;
  let stage: Stage | undefined;
  let logPath: string | undefined;
  const deadline = Date.now() + 50 * 60_000;
  const cleanEnvironment = nativeBuildEnvironment(environment);
  const command = (
    name: ProbeCommand['command'],
    args: string[],
    timeoutMs: number,
    input?: Buffer,
  ): ProbeCommandResult => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('PROBE_TIMEOUT');
    return runner({
      command: name,
      args,
      timeoutMs: Math.min(timeoutMs, remaining),
      cwd,
      environment: cleanEnvironment,
      ...(input ? { input } : {}),
      ...(name === 'xcodebuild' && logPath ? { logPath } : {}),
    });
  };
  const parsePlist = (input: Buffer): unknown =>
    JSON.parse(
      command(
        'python3',
        [
          '-c',
          'import sys,json,plistlib,datetime; print(json.dumps(plistlib.loads(sys.stdin.buffer.read()),default=lambda v:v.replace(tzinfo=datetime.timezone.utc).isoformat() if isinstance(v,datetime.datetime) else None))',
        ],
        30_000,
        input,
      ).stdout.toString('utf8'),
    );
  const verify = (
    app: string,
    kind: 'development' | 'distribution',
    expectedVersion: string,
    expectedBuild?: string,
  ): string => {
    let build = expectedBuild;
    for (const [target, bundleId] of [
      [app, RELEASE_IDS.bundleId],
      [join(app, 'PlugIns/ExpoWidgetsTarget.appex'), RELEASE_IDS.widgetBundleId],
    ] as const) {
      const rawInfo = parsePlist(readFileSync(join(target, 'Info.plist')));
      build = assertDeviceBundle(rawInfo, bundleId, expectedVersion, build);
      const executable = z
        .object({ CFBundleExecutable: z.string() })
        .parse(rawInfo).CFBundleExecutable;
      if (
        !lstatSync(join(target, executable)).isFile() ||
        !lstatSync(join(target, executable)).size
      )
        throw new Error('The compiled device executable is missing.');
      assertAppGroupPrivacyManifest(
        parsePlist(readFileSync(join(target, 'PrivacyInfo.xcprivacy'))),
      );
      command('codesign', ['--verify', '--deep', '--strict', target], 60_000);
      const entitlements = parsePlist(
        command('codesign', ['--display', '--entitlements', ':-', target], 60_000).stdout,
      );
      const profile = parsePlist(
        command('security', ['cms', '-D', '-i', join(target, 'embedded.mobileprovision')], 60_000)
          .stdout,
      );
      const authority = command(
        'codesign',
        ['--display', '--verbose=4', target],
        60_000,
      ).stderr.toString('utf8');
      if (kind === 'development')
        assertDevelopmentSigning({ profile, entitlements, authority }, bundleId);
      else {
        assertReleaseEntitlements(entitlements, bundleId);
        assertReleaseProfile(profile, bundleId);
        if (!/^Authority=(?:Apple Distribution|iPhone Distribution):[^\r\n]+$/m.test(authority))
          throw new Error('The exported IPA requires an Apple distribution signature.');
      }
    }
    if (
      !lstatSync(join(app, 'main.jsbundle')).isFile() ||
      !lstatSync(join(app, 'main.jsbundle')).size
    )
      throw new Error('The device application must contain bundled JavaScript.');
    return z.string().parse(build);
  };
  const step = (name: Stage, action: () => void): void => {
    stage = name;
    logPath = undefined;
    const started = Date.now();
    const entry = { stage: name, succeeded: false, elapsedMs: 0 };
    summary.stages.push(entry);
    try {
      action();
      entry.succeeded = true;
    } finally {
      entry.elapsedMs = Date.now() - started;
    }
  };
  try {
    assertCloudProbeEnvironment(environment);
    assertSavedDevelopmentFiles(environment);
    const credentials = assertCredentials(environment);
    privateRoot = mkdtempSync(join(tmpdir(), 'vibeset-cloud-signing-'));
    chmodSync(privateRoot, 0o700);
    writeFileSync(join(privateRoot, 'AuthKey.p8'), credentials.pem, { mode: 0o600, flag: 'wx' });
    const privateDirectory = privateRoot;
    const commands = cloudSigningCommands(
      privateDirectory,
      credentials.keyId,
      credentials.issuerId,
    );
    const version = z
      .object({ version: z.string() })
      .parse(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))).version;
    let build: string | undefined;
    step('device-archive', () => {
      logPath = join(privateDirectory, 'archive.log');
      command('xcodebuild', commands.archive, 30 * 60_000);
    });
    step('archive-verification', () => {
      build = verify(
        join(privateDirectory, 'Vibeset.xcarchive/Products/Applications/Vibeset.app'),
        'development',
        version,
      );
      summary.archiveVerified = true;
    });
    const optionsJson = Buffer.from(JSON.stringify(cloudExportOptions()));
    const options = command(
      'python3',
      [
        '-c',
        'import sys,json,plistlib; sys.stdout.buffer.write(plistlib.dumps(json.load(sys.stdin)))',
      ],
      30_000,
      optionsJson,
    ).stdout;
    writeFileSync(join(privateDirectory, 'ExportOptions.plist'), options, {
      mode: 0o600,
      flag: 'wx',
    });
    step('cloud-export', () => {
      logPath = join(privateDirectory, 'export.log');
      summary.signingAssetsMayHaveChanged = true;
      command('xcodebuild', commands.export, 15 * 60_000);
    });
    step('export-verification', () => {
      const exportDirectory = join(privateDirectory, 'export');
      const packages = readdirSync(exportDirectory).filter((file) => file.endsWith('.ipa'));
      if (packages.length !== 1) throw new Error('Exactly one private IPA export is required.');
      const ipa = join(exportDirectory, z.string().parse(packages[0]));
      if (!lstatSync(ipa).isFile() || !lstatSync(ipa).size)
        throw new Error('Private IPA export is empty.');
      const unpacked = join(privateDirectory, 'inspection');
      mkdirSync(unpacked, { mode: 0o700 });
      command('ditto', ['-x', '-k', ipa, unpacked], 60_000);
      verify(join(unpacked, 'Payload/Vibeset.app'), 'distribution', version, build);
      summary.cloudExportVerified = true;
    });
  } catch (error) {
    const fallback =
      stage === 'device-archive'
        ? 'ARCHIVE'
        : stage === 'cloud-export'
          ? 'EXPORT'
          : stage
            ? 'VERIFICATION'
            : 'CONFIG';
    summary.failureCode =
      error instanceof Error && error.message === 'PROBE_TIMEOUT'
        ? 'TIMEOUT'
        : classifyCloudProbeFailure(logPath ? tail(logPath) : '', fallback);
  } finally {
    try {
      if (privateRoot) rmSync(privateRoot, { recursive: true, force: true });
      summary.probeDirectoryRemoved = true;
    } catch {
      summary.failureCode = 'CLEANUP';
    }
  }
  const directory = resolve(cwd, 'build/cloud-signing-diagnostics');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, 'summary.json'),
    JSON.stringify(summarySchema.parse(summary), null, 2),
    { mode: 0o600 },
  );
  return summary;
}

function main(): void {
  const mode = z.enum(['preflight', 'run']).parse(process.argv[2]);
  if (process.argv.length !== 3 || process.platform !== 'darwin')
    throw new Error('The explicit signing diagnostic requires macOS.');
  if (mode === 'preflight') {
    assertCloudProbeEnvironment(process.env);
    assertSavedDevelopmentFiles(process.env);
    console.log('Manual diagnostic configuration accepted; no signing or upload request was made.');
    return;
  }
  const summary = runCloudSigningProbe(process.env, process.cwd());
  console.log(JSON.stringify(summary));
  if (summary.failureCode) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  try {
    main();
  } catch {
    console.error(
      'Cloud signing diagnostic configuration failed. Use the existing integration and an explicit manual main-branch run; no upload is configured.',
    );
    process.exitCode = 1;
  }
