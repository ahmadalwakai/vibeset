import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const workflow = readFileSync(new URL('../../codemagic.yaml', import.meta.url), 'utf8');
const embedded = /node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n\s+NODE/.exec(workflow)?.[1];
if (!embedded) throw new Error('The actual simulator capture script is required.');
const source = embedded
  .split('\n')
  .map((line) => line.trimStart())
  .filter((line) => !line.startsWith('import '))
  .join('\n');
const ownedId = '10000000-0000-4000-8000-000000000001';
const captureSchema = z.object({
  appInstallationVerified: z.boolean(),
  launchAccepted: z.boolean(),
  apiReachabilityVerified: z.literal(false),
  uiReadinessVerified: z.literal(false),
  widgetPlacementVerified: z.literal(false),
  testFlightUpload: z.literal(false),
  screenshots: z.array(
    z.object({
      file: z.string(),
      width: z.literal(1320),
      height: z.literal(2868),
      format: z.literal('jpeg'),
      hasAlpha: z.literal(false),
    }),
  ),
  failedStage: z.string().optional(),
  stages: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['succeeded', 'failed']),
      timeoutMs: z.number().positive().max(600_000),
      elapsedMs: z.number().nonnegative(),
      code: z.string().optional(),
    }),
  ),
});

async function exercise(
  mode: 'success' | 'install-timeout' | 'unconfirmed-launch' | 'wrong-size' | 'unsupported-format',
) {
  const calls: { operation: string; args: readonly string[]; timeout: number }[] = [];
  const files = new Map<string, string>();
  const messages: string[] = [];
  const execution: unknown = runInNewContext(`(async () => {\n${source}\n})()`, {
    process: { env: { VIBESET_IOS_BUNDLE_ID: 'com.ahmadalwakai.vibeset' } },
    console: { log: (message: string) => messages.push(message) },
    mkdirSync: () => undefined,
    writeFileSync: (path: string, value: string) => files.set(path, value),
    readFileSync: () => JSON.stringify([{ slug: 'published-theme' }]),
    delay: async (milliseconds: number) => expect(milliseconds).toBe(25_000),
    spawnSync: (command: string, args: readonly string[], options: { timeout: number }) => {
      expect(command).toBe('xcrun');
      expect(args).toEqual(['simctl', 'help', 'io']);
      expect(options.timeout).toBe(30_000);
      return {
        status: 0,
        stdout: '',
        stderr:
          mode === 'unsupported-format'
            ? 'screenshot [--type=png]'
            : 'screenshot [--type=<type>] Can be png, jpeg.',
      };
    },
    execFileSync: (command: string, args: readonly string[], options: { timeout: number }) => {
      if (command === 'sips') {
        expect(options.timeout).toBe(30_000);
        expect(args).toEqual([
          '-g',
          'pixelWidth',
          '-g',
          'pixelHeight',
          '-g',
          'format',
          '-g',
          'hasAlpha',
          expect.stringMatching(/\.jpg$/),
        ]);
        return `capture.jpg\n  pixelWidth: ${mode === 'wrong-size' ? 1206 : 1320}\n  pixelHeight: 2868\n  format: jpeg\n  hasAlpha: no\n`;
      }
      expect(command).toBe('xcrun');
      const operation = args[1] ?? '';
      calls.push({ operation, args, timeout: options.timeout });
      if (operation === 'list' && args[2] !== 'devices')
        return JSON.stringify({
          runtimes: [
            {
              identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-27-0',
              isAvailable: true,
              version: '27.0',
            },
          ],
          devicetypes: [
            {
              identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max',
              name: 'iPhone 17 Pro Max',
            },
          ],
        });
      if (operation === 'list')
        return JSON.stringify({
          devices: {
            runtime: [
              { udid: ownedId, state: 'Booted', isAvailable: true },
              { udid: 'foreign-device', state: 'UNRELATED_PRIVATE_VALUE' },
            ],
          },
        });
      if (operation === 'create') return `${ownedId}\n`;
      if (mode === 'install-timeout' && operation === 'install')
        throw Object.assign(new Error('UNRELATED_PRIVATE_VALUE'), {
          code: 'ETIMEDOUT',
          status: null,
          signal: 'SIGTERM',
        });
      if (mode === 'install-timeout' && operation === 'shutdown')
        throw new Error('secondary cleanup failure');
      if (operation === 'launch')
        return mode === 'unconfirmed-launch' ? '' : 'com.ahmadalwakai.vibeset: 123\n';
      return '';
    },
  });
  let error: unknown;
  try {
    await execution;
  } catch (caught) {
    error = caught;
  }
  const report = captureSchema.parse(
    JSON.parse(files.get('build/simulator-diagnostics/capture.json') ?? '{}'),
  );
  return { calls, files, messages, report, error };
}

describe('actual Codemagic simulator capture orchestration', () => {
  it('records bounded successful stages and separates boot baseline from actual app launch', async () => {
    const { calls, report, error } = await exercise('success');
    expect(error).toBeUndefined();
    expect(calls.find(({ operation }) => operation === 'bootstatus')?.timeout).toBe(600_000);
    expect(calls.find(({ operation }) => operation === 'install')?.timeout).toBe(300_000);
    expect(calls.find(({ operation }) => operation === 'launch')?.timeout).toBe(120_000);
    const install = calls.findIndex(({ operation }) => operation === 'install');
    expect(
      calls.slice(0, install).some(({ args }) => args.at(-1)?.endsWith('booted-home.jpg')),
    ).toBe(true);
    expect(report.appInstallationVerified).toBe(true);
    expect(report.launchAccepted).toBe(true);
    expect(report.screenshots).toHaveLength(6);
    expect(calls.filter(({ operation }) => operation === 'io')).toHaveLength(6);
    expect(
      calls.filter(({ operation }) => operation === 'openurl').map(({ args }) => args.at(-1)),
    ).toEqual(
      ['wallpaper', 'icons', 'widget'].map(
        (step) => `vibeset://setup/published-theme?step=${step}`,
      ),
    );
    expect(
      calls
        .filter(({ operation }) => operation === 'io')
        .every(({ args }) => args.includes('--type=jpeg')),
    ).toBe(true);
    expect(report.stages.every(({ status }) => status === 'succeeded')).toBe(true);
    expect(calls.slice(-2).map(({ operation }) => operation)).toEqual(['shutdown', 'delete']);
  });

  it('retains the install failure despite diagnostic or shutdown failures and only describes its owned simulator', async () => {
    const { calls, files, messages, report, error } = await exercise('install-timeout');
    expect(String(error)).toContain('failed at install');
    expect(report.failedStage).toBe('install');
    expect(report.appInstallationVerified).toBe(false);
    expect(report.launchAccepted).toBe(false);
    expect(calls.some(({ operation }) => operation === 'launch')).toBe(false);
    expect(report.stages.find(({ name }) => name === 'install')?.code).toBe('ETIMEDOUT');
    expect(calls.at(-1)?.operation).toBe('delete');
    expect(files.get('build/simulator-diagnostics/failure-device.json')).toBe(
      JSON.stringify({ state: 'Booted', isAvailable: true }, null, 2),
    );
    expect([...files.values(), ...messages].join('\n')).not.toContain('UNRELATED_PRIVATE_VALUE');
    expect(messages.some((message) => message.includes('install: failed'))).toBe(true);
  });

  it('fails instead of claiming runtime success when launch does not confirm a process', async () => {
    const { calls, report, error } = await exercise('unconfirmed-launch');
    expect(String(error)).toContain('failed at validation');
    expect(report.appInstallationVerified).toBe(true);
    expect(report.launchAccepted).toBe(false);
    expect(calls.some(({ args }) => args.at(-1)?.endsWith('/launch.jpg'))).toBe(false);
    expect(calls.at(-1)?.operation).toBe('delete');
  });

  it('fails closed on unsupported installed screenshot syntax before creating a simulator', async () => {
    const { calls, report, error } = await exercise('unsupported-format');
    expect(String(error)).toContain('failed at validation');
    expect(calls).toHaveLength(0);
    expect(report.screenshots).toEqual([]);
  });

  it('rejects an actual wrong-sized capture without resizing or claiming UI readiness', async () => {
    const { calls, report, error } = await exercise('wrong-size');
    expect(String(error)).toContain('failed at validation');
    expect(report.screenshots).toEqual([]);
    expect(report.uiReadinessVerified).toBe(false);
    expect(calls.some(({ operation }) => operation === 'install')).toBe(false);
    expect(calls.at(-1)?.operation).toBe('delete');
  });
});
