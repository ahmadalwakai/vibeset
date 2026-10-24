import { describe, expect, it } from 'vitest';
import { maintenanceOptionsSchema } from '../../lib/validation/maintenance';

const id = '12345678-1234-4123-8123-123456789abc';
const empty = { themeIds: [], uploadIds: [], appRateKeys: [], authRateKeys: [] };
describe('internal maintenance scope validation', () => {
  it('defaults to production scope only when no scope object is provided', () => {
    expect(maintenanceOptionsSchema.parse({})).toEqual({});
    expect(maintenanceOptionsSchema.parse({ scope: empty })).toEqual({ scope: empty });
    for (const scope of [{}, { themeIds: [id] }, { themeIds: [], uploadIds: [], appRateKeys: [] }])
      expect(maintenanceOptionsSchema.safeParse({ scope }).success).toBe(false);
  });
  it('normalizes/deduplicates UUIDs and bounds every fixture dimension', () => {
    expect(
      maintenanceOptionsSchema.parse({
        scope: {
          ...empty,
          themeIds: [id, id.toUpperCase()],
          appRateKeys: ['track:hash', 'track:hash'],
          authRateKeys: ['a'.repeat(64), 'a'.repeat(64)],
        },
      }).scope,
    ).toEqual({
      ...empty,
      themeIds: [id],
      appRateKeys: ['track:hash'],
      authRateKeys: ['a'.repeat(64)],
    });
    for (const options of [
      { unsupported: true },
      { asOf: '2026-02-29T00:00:00Z' },
      { asOf: '0000-01-01T00:00:00Z' },
      { asOf: '2026-10-24' },
      { scope: { ...empty, themeIds: [id + '\n'] } },
      { scope: { ...empty, appRateKeys: ['secret\u0000'] } },
      { scope: { ...empty, authRateKeys: ['raw-ip-or-path'] } },
      { scope: { ...empty, themeIds: Array.from({ length: 10001 }, () => id) } },
    ])
      expect(maintenanceOptionsSchema.safeParse(options).success).toBe(false);
  });
});
