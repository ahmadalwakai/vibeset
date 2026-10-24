import { describe, expect, it } from 'vitest';
import { parseGenerateArgs } from '../../../scripts/generate-themes';

const now = new Date('2026-10-24T12:00:00Z');

describe('generator CLI arguments', () => {
  it('defaults to twelve candidates and the UTC date seed for an explicit selection', () => {
    expect(parseGenerateArgs(['--aesthetic=y2k'], now)).toEqual({
      aesthetic: 'y2k',
      all: false,
      count: 12,
      seed: 20261024,
      'auto-approve': false,
      'dry-run': false,
    });
  });

  it('accepts all recipes, a bounded count and an explicit zero seed for an offline dry run', () => {
    const args = ['--all', '--count=1', '--seed=0', '--dry-run'] as const;
    expect(parseGenerateArgs(args, now)).toEqual({
      all: true,
      count: 1,
      seed: 0,
      'auto-approve': false,
      'dry-run': true,
    });
    expect(args).toEqual(['--all', '--count=1', '--seed=0', '--dry-run']);
  });

  it('accepts upper numeric bounds and auto-approval without a dry run', () => {
    expect(
      parseGenerateArgs(
        ['--aesthetic', 'y2k', '--count=24', '--seed=2147483647', '--auto-approve'],
        now,
      ),
    ).toEqual({
      aesthetic: 'y2k',
      all: false,
      count: 24,
      seed: 2147483647,
      'auto-approve': true,
      'dry-run': false,
    });
  });

  it('derives the date in UTC across both local midnight boundaries', () => {
    expect(parseGenerateArgs(['--all'], new Date('2026-10-24T23:30:00-07:00')).seed).toBe(20261025);
    expect(parseGenerateArgs(['--all'], new Date('2026-10-24T00:30:00+14:00')).seed).toBe(20261023);
  });

  it('interprets decimal digits consistently even when a caller supplies leading zeroes', () => {
    expect(parseGenerateArgs(['--all', '--count=012', '--seed=00042'], now)).toMatchObject({
      count: 12,
      seed: 42,
    });
  });

  it.each([
    [],
    ['--all', '--aesthetic=y2k'],
    ['--aesthetic=missing'],
    ['--aesthetic=Y2K'],
    ['--aesthetic= y2k'],
    ['--aesthetic=y2k\n'],
    ['--aesthetic='],
    ['--all', '--all'],
    ['--aesthetic=y2k', '--aesthetic=y2k'],
    ['--all', '--count=12', '--count=12'],
    ['--all', '--seed=1', '--seed=2'],
    ['--all', '--dry-run', '--dry-run'],
    ['--all', '--auto-approve', '--auto-approve'],
    ['--all', '--auto-approve', '--dry-run'],
    ['--all', '--dry-run', '--auto-approve'],
    ['--all', '--unknown'],
    ['--all', 'unexpected'],
    ['--all=false'],
    ['--aesthetic'],
    ['--all', '--seed'],
    ['--all', '--count'],
    ['--all', '--', '--seed=1'],
  ])('rejects ambiguous, duplicate or unknown selection %j', (...args) => {
    expect(() => parseGenerateArgs(args, now)).toThrow();
  });

  it.each([
    '0',
    '25',
    '-1',
    '1.5',
    'NaN',
    'Infinity',
    '',
    ' ',
    '12\n',
    '0xc',
    '1e1',
    '+12',
    '１２',
  ])('rejects invalid count %j', (count) => {
    expect(() => parseGenerateArgs(['--all', `--count=${count}`], now)).toThrow();
  });

  it.each([
    '-1',
    '2147483648',
    '1.5',
    'NaN',
    'Infinity',
    '',
    ' ',
    '42\n',
    '0x2a',
    '4.2e1',
    '+42',
    '٤٢',
  ])('rejects invalid seed %j', (seed) => {
    expect(() => parseGenerateArgs(['--all', `--seed=${seed}`], now)).toThrow();
  });
});
