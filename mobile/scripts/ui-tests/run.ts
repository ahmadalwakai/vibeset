import { execFileSync } from 'node:child_process';
import { copyFileSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const stepSchema = z.enum(['wallpaper', 'icons', 'widget']);
const attachmentManifestSchema = z.array(
  z.object({
    attachments: z
      .array(
        z.object({
          exportedFileName: z.string().min(1),
          suggestedHumanReadableName: z.string(),
        }),
      )
      .default([]),
  }),
);

export interface SetupUiScreenshot {
  file: string;
  width: 1320;
  height: 2868;
  format: 'jpeg';
  hasAlpha: false;
}

/** Never executes an exported attachment; only copies bounded named JPEG files. */
export function setupAttachmentPaths(
  input: unknown,
): { step: z.infer<typeof stepSchema>; file: string }[] {
  const entries = attachmentManifestSchema.parse(input).flatMap(({ attachments }) => attachments);
  return stepSchema.options.map((step) => {
    const matches = entries.filter(
      ({ suggestedHumanReadableName }) =>
        suggestedHumanReadableName.startsWith(`setup-${step}_`) ||
        suggestedHumanReadableName === `setup-${step}` ||
        suggestedHumanReadableName === `setup-${step}.jpg`,
    );
    if (matches.length !== 1)
      throw new Error('Each asserted setup screen requires exactly one retained screenshot');
    const file = matches[0]?.exportedFileName;
    if (!file || path.basename(file) !== file || !/^[a-zA-Z0-9._-]+\.(?:jpg|jpeg)$/i.test(file))
      throw new Error('Screenshot export must be an ordinary local JPEG filename');
    return { step, file };
  });
}

export function runSetupUiTests(udid: string, output: string): SetupUiScreenshot[] {
  z.uuid().length(36).parse(udid);
  if (process.platform !== 'darwin') throw new Error('Actual XCTest UI diagnostics require macOS');
  const result = path.join(output, 'setup-ui.xcresult');
  const exported = path.join(output, 'setup-ui-attachments');
  execFileSync('ruby', ['scripts/ui-tests/prepare.rb'], { stdio: 'inherit', timeout: 60_000 });
  try {
    execFileSync(
      'python3',
      [
        'scripts/ui-tests/run-bounded.py',
        '1200',
        path.join(output, 'setup-ui-xcodebuild.log'),
        'xcodebuild',
        '-workspace',
        'ios/Vibeset.xcworkspace',
        '-scheme',
        'Vibeset',
        '-configuration',
        'Release',
        '-sdk',
        'iphonesimulator',
        '-destination',
        `platform=iOS Simulator,id=${udid}`,
        '-destination-timeout',
        '60',
        '-derivedDataPath',
        'build/simulator',
        '-resultBundlePath',
        result,
        '-only-testing:VibesetSetupUITests',
        '-parallel-testing-enabled',
        'NO',
        'CODE_SIGN_IDENTITY=',
        'CODE_SIGNING_REQUIRED=NO',
        'CODE_SIGNING_ALLOWED=NO',
        'test',
      ],
      { timeout: 20 * 60_000 + 30_000, stdio: 'inherit' },
    );
  } catch {
    throw new Error('Actual catalogue-to-setup XCTest failed; inspect the retained result bundle');
  }
  const help = execFileSync('xcrun', ['xcresulttool', 'help', 'export', 'attachments'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (!help.includes('--path') || !help.includes('--output-path'))
    throw new Error('Installed xcresulttool must support documented attachment export');
  execFileSync(
    'xcrun',
    ['xcresulttool', 'export', 'attachments', '--path', result, '--output-path', exported],
    { stdio: 'inherit', timeout: 60_000 },
  );
  const manifest = readFileSync(path.join(exported, 'manifest.json'));
  if (manifest.byteLength > 1024 * 1024) throw new Error('Unexpectedly large screenshot manifest');
  const attachments = setupAttachmentPaths(JSON.parse(manifest.toString('utf8')));
  const root = realpathSync(exported);
  return attachments.map(({ step, file }) => {
    const source = path.join(exported, file),
      metadata = lstatSync(source);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size < 1 ||
      metadata.size > 8 * 1024 * 1024 ||
      !realpathSync(source).startsWith(`${root}${path.sep}`)
    )
      throw new Error('The exported screenshot must be a bounded ordinary file');
    const destination = path.join(output, `setup-${step}.jpg`);
    copyFileSync(source, destination);
    const info = execFileSync(
      'sips',
      ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'format', '-g', 'hasAlpha', destination],
      { encoding: 'utf8', timeout: 30_000 },
    );
    if (
      !/^\s*pixelWidth:\s*1320\s*$/m.test(info) ||
      !/^\s*pixelHeight:\s*2868\s*$/m.test(info) ||
      !/^\s*format:\s*jpeg\s*$/m.test(info) ||
      !/^\s*hasAlpha:\s*no\s*$/m.test(info)
    )
      throw new Error(
        'XCTest screenshots must retain actual opaque1320x2868pixels without resizing',
      );
    return { file: destination, width: 1320, height: 2868, format: 'jpeg', hasAlpha: false };
  });
}
