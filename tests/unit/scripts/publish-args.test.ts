import { describe, expect, it } from 'vitest';
import { parsePublishArgs } from '../../../scripts/publish-themes';

const id = 'f5497e73-9a14-4d82-a1eb-baa931101bce';

describe('publish CLI arguments', () => {
  it('defaults to a bounded approved queue', () => {
    expect(parsePublishArgs([])).toEqual({
      status: 'approved',
      limit: 24,
      concurrency: 3,
      force: false,
    });
  });
  it('accepts explicit IDs and selects the entire requested set by default', () => {
    expect(parsePublishArgs([`--ids=${id}`, '--force', '--concurrency=1'])).toEqual({
      ids: [id],
      limit: 1,
      concurrency: 1,
      force: true,
    });
  });
  it('accepts stale selection with bounded concurrency', () => {
    expect(parsePublishArgs(['--status=stale', '--limit=50', '--concurrency=4']).status).toBe(
      'stale',
    );
  });
  it('normalizes UUID case before duplicate checks and database selection', () => {
    expect(parsePublishArgs([`--ids=${id.toUpperCase()}`]).ids).toEqual([id]);
    expect(() => parsePublishArgs([`--ids=${id},${id.toUpperCase()}`])).toThrow();
  });
  it.each([
    ['--status=draft'],
    ['--ids=invalid'],
    [`--ids=${id},${id}`],
    [`--ids=${id}`, '--status=approved'],
    ['--limit=0'],
    ['--limit=501'],
    ['--concurrency=0'],
    ['--concurrency=5'],
    ['--status=approved', '--status=archived'],
    ['--force', '--force'],
    ['unexpected'],
    ['--unknown'],
  ])('rejects ambiguous or invalid selection %j', (...args) => {
    expect(() => parsePublishArgs(args)).toThrow();
  });
});
