import { describe, expect, it } from 'vitest';
import { parseStudioEntryQuery } from '../../../lib/validation/studio-entry';

describe('Studio entry precedence', () => {
  it('keeps a shared design when an ignored source is malformed', () => {
    expect(
      parseStudioEntryQuery({ s: 'valid-compressed-input', from: ['private', 'bad/slug'] }),
    ).toEqual({ kind: 'share', value: 'valid-compressed-input' });
  });
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
