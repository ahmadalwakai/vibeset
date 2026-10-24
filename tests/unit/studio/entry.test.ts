import { describe, expect, it } from 'vitest';
import { parseStudioEntryQuery } from '../../../lib/validation/studio-entry';

describe('Studio entry precedence', () => {
  it('keeps a shared design when an ignored source is malformed', () => {
    expect(
      parseStudioEntryQuery({
        s: 'valid-compressed-input',
        remix: ['private', 'invalid'],
        from: ['private', 'bad/slug'],
      }),
    ).toEqual({ kind: 'share', value: 'valid-compressed-input' });
  });
  it('resumes an owned remix before a lower-priority source and normalizes its ID', () => {
    const id = 'A1111111-1111-4111-8111-111111111111';
    expect(parseStudioEntryQuery({ remix: id, from: ['invalid', 'source'] })).toEqual({
      kind: 'remix',
      id: id.toLowerCase(),
    });
  });
  it.each(['', '../id', ['one', 'two'], '11111111-1111-4111-8111-111111111111\n'])(
    'rejects a present invalid remix rather than restoring a local draft or source',
    (remix) => {
      expect(parseStudioEntryQuery({ remix, from: 'published-theme' })).toEqual({
        kind: 'invalid',
      });
    },
  );
  it('rejects an invalid present share rather than silently choosing from', () => {
    for (const s of ['', [], ['one', 'two'], 'x'.repeat(6001)])
      expect(parseStudioEntryQuery({ s, from: 'published' })).toEqual({ kind: 'invalid' });
  });
  it('accepts one valid source and refuses duplicate or unsafe sources', () => {
    expect(parseStudioEntryQuery({ from: 'published-theme' })).toEqual({
      kind: 'from',
      slug: 'published-theme',
    });
    expect(parseStudioEntryQuery({ from: ['one', 'two'] })).toEqual({ kind: 'invalid' });
    expect(parseStudioEntryQuery({ from: '../private' })).toEqual({ kind: 'invalid' });
  });
  it('restores a draft only with no explicit entry parameter', () => {
    expect(parseStudioEntryQuery({ unrelated: 'kept' })).toEqual({ kind: 'draft' });
  });
});
