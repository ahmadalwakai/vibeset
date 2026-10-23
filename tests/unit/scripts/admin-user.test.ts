import { describe, expect, it } from 'vitest';
import { parseAdminArgs } from '../../../scripts/admin-user';

describe('admin-user command arguments', () => {
  it('accepts one grant and normalizes the selected email', () => {
    expect(parseAdminArgs(['--grant', '  Admin@Example.com  '])).toEqual({
      kind: 'grant',
      email: 'admin@example.com',
      forceProduction: false,
    });
  });

  it('accepts explicit production authorization for a revocation', () => {
    expect(parseAdminArgs(['--revoke=user@example.com', '--force-production'])).toEqual({
      kind: 'revoke',
      email: 'user@example.com',
      forceProduction: true,
    });
  });

  it('supports listing without a mutation or email', () => {
    expect(parseAdminArgs(['--list'])).toEqual({ kind: 'list' });
  });

  it.each(
    [
      [],
      ['--grant'],
      ['--grant', 'invalid'],
      ['--grant', ''],
      ['--grant', 'a@example.com', '--revoke', 'b@example.com'],
      ['--grant', 'a@example.com', '--list'],
      ['--revoke', 'a@example.com', '--list'],
      ['--grant', 'a@example.com', '--grant', 'b@example.com'],
      ['--list', '--list'],
      ['--list', '--force-production'],
      ['--force-production'],
      ['--unknown'],
      ['a@example.com'],
      ['--list', 'a@example.com'],
      ['--grant', 'a@example.com', '--force-production', '--force-production'],
    ].map((args) => ({ args })),
  )('rejects ambiguous or unsafe arguments: $args', ({ args }) => {
    expect(() => parseAdminArgs(args)).toThrow();
  });
});
