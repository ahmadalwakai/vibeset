import { describe, expect, it } from 'vitest';
import {
  decodeCollectionCursor,
  decodeCursor,
  decodeOffsetCursor,
  encodeCollectionCursor,
  encodeCursor,
  encodeOffsetCursor,
} from '../../../lib/utils/cursor';

const id = '00000000-0000-4000-8000-000000000001';
describe('opaque pagination cursor boundaries', () => {
  it('round trips numeric sort values and preserves PostgreSQL microseconds', () => {
    const current = { k: 'new' as const, s: '2026-10-24T12:34:56.123456Z', id };
    expect(decodeCursor(encodeCursor(current), 'new')).toEqual(current);
    for (const k of ['trending', 'popular'] as const) {
      const cursor = { k, s: 12, id };
      expect(decodeCursor(encodeCursor(cursor), k)).toEqual(cursor);
    }
  });
  it('rejects sort and pagination-mode swaps', () => {
    const value = encodeCursor({ k: 'trending', s: 1.25, id });
    expect(() => decodeCursor(value, 'popular')).toThrow();
    expect(() => decodeOffsetCursor(value)).toThrow();
    expect(() => decodeCollectionCursor(value)).toThrow();
    expect(() => decodeCursor(encodeOffsetCursor(2), 'new')).toThrow();
  });
  it.each(['', '%', 'a', '!!!!', 'x'.repeat(1025), btoa('{}'), btoa('{"s":0,"id":"bad"}')])(
    'rejects malformed or oversized tokens %s',
    (value) => {
      expect(() => decodeCursor(value, 'trending')).toThrow();
    },
  );
  it('requires valid UTC timestamp strings without losing their precision', () => {
    for (const s of [
      'not-a-date',
      '2026-02-30T00:00:00Z',
      '2026-10-24T00:00:00.1234567Z',
      '2026-10-24T00:00:00+01:00',
    ])
      expect(() => encodeCursor({ k: 'new', s, id })).toThrow();
    expect(() => encodeCursor({ k: 'popular', s: 1.5, id })).toThrow();
    expect(() => encodeCursor({ k: 'trending', s: Infinity, id })).toThrow();
  });
  it('bounds search offsets at 200 and keeps collection ordering independent', () => {
    for (const offset of [0, 1, 200])
      expect(decodeOffsetCursor(encodeOffsetCursor(offset))).toBe(offset);
    for (const offset of [-1, 1.5, 201]) expect(() => encodeOffsetCursor(offset)).toThrow();
    const cursor = encodeCollectionCursor({ s: 4, id });
    expect(decodeCollectionCursor(cursor)).toEqual({ k: 'collection', s: 4, id });
    expect(() => decodeCursor(cursor, 'new')).toThrow();
  });
});
