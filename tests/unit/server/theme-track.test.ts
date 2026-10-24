import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACK_EVENTS, trackInputSchema } from '../../../lib/validation/track';

const execute = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('../../../db/index', () => ({ db: { execute } }));
import { trackThemeEvent } from '../../../server/services/theme-track';

const themeId = 'f5497e73-9a14-4d82-a1eb-baa931101bce';
beforeEach(() => {
  vi.resetAllMocks();
  execute.mockResolvedValue({ rows: [{ counted: true }] });
});

describe('anonymous tracking boundary and mutation service', () => {
  it.each(TRACK_EVENTS)('accepts %s and normalizes UUIDs', (event) => {
    expect(trackInputSchema.parse({ themeId: themeId.toUpperCase(), event })).toEqual({
      themeId,
      event,
    });
  });
  it.each([
    { themeId: 'invalid', event: 'view' },
    { themeId: `${themeId}\n`, event: 'view' },
    { themeId, event: 'other' },
    { themeId, event: 'view', userId: 'untrusted-user' },
    { themeId, event: 'view', ip: '203.0.113.42' },
  ])('rejects invalid or personal data before database work: %j', async (input) => {
    await expect(
      trackThemeEvent(input as Parameters<typeof trackThemeEvent>[0]),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(execute).not.toHaveBeenCalled();
  });
  it('executes one atomic mutation and returns no public invalidation tags', async () => {
    expect(await trackThemeEvent({ themeId, event: 'download' })).toEqual({
      data: { counted: true },
      tags: [],
    });
    expect(execute).toHaveBeenCalledOnce();
  });
  it('reports ineligible or missing themes without revealing an HTTP distinction', async () => {
    execute.mockResolvedValue({ rows: [{ counted: false }] });
    expect(await trackThemeEvent({ themeId, event: 'view' })).toEqual({
      data: { counted: false },
      tags: [],
    });
  });
});
