import { describe, expect, it } from 'vitest';
import type { ThemeCardDTO } from '../../../lib/dto';
import {
  infiniteThemesReducer as reduce,
  initialInfiniteThemesState as initial,
} from '../../../hooks/infinite-themes-state';

function card(id: string, nameEn = id): ThemeCardDTO {
  return {
    id,
    slug: id,
    nameEn,
    nameAr: null,
    thumbUrl: null,
    dominantColor: null,
    tags: [],
    isFeatured: false,
    downloadCount: 0,
    favoriteCount: 0,
    creator: null,
    publishedAt: null,
  };
}
describe('infinite theme pagination state', () => {
  it('deduplicates pages, preserves row order and advances only on matching success', () => {
    const state = reduce(initial('calm', { items: [card('a')], nextCursor: 'one' }), {
      type: 'start',
      key: 'calm',
      requestId: 1,
      cursor: 'one',
    });
    const result = reduce(state, {
      type: 'success',
      key: 'calm',
      requestId: 1,
      cursor: 'one',
      page: { items: [card('a', 'updated'), card('b'), card('b')], nextCursor: 'two' },
    });
    expect(result.items.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(result.items[0]?.nameEn).toBe('updated');
    expect(result.nextCursor).toBe('two');
    expect(result.loading).toBe(false);
  });
  it('ignores stale responses after query reset and after a newer request', () => {
    const old = reduce(initial('old', { items: [card('a')], nextCursor: 'one' }), {
      type: 'start',
      key: 'old',
      requestId: 1,
      cursor: 'one',
    });
    const reset = reduce(old, {
      type: 'reset',
      key: 'new',
      page: { items: [card('b')], nextCursor: 'next' },
    });
    expect(
      reduce(reset, {
        type: 'success',
        key: 'old',
        requestId: 1,
        cursor: 'one',
        page: { items: [card('stale')], nextCursor: null },
      }),
    ).toBe(reset);
    const active = reduce(reset, { type: 'start', key: 'new', requestId: 2, cursor: 'next' });
    expect(
      reduce(active, {
        type: 'failure',
        key: 'new',
        requestId: 1,
        cursor: 'next',
        error: 'NETWORK',
      }),
    ).toBe(active);
    expect(
      reduce(active, {
        type: 'success',
        key: 'new',
        requestId: 2,
        cursor: 'wrong',
        page: { items: [], nextCursor: null },
      }),
    ).toBe(active);
  });
  it('retains cards and cursor after failure, and permits one explicit retry', () => {
    const state = reduce(initial('q', { items: [card('a')], nextCursor: 'one' }), {
      type: 'start',
      key: 'q',
      requestId: 1,
      cursor: 'one',
    });
    expect(reduce(state, { type: 'start', key: 'q', requestId: 2, cursor: 'one' })).toBe(state);
    const failed = reduce(state, {
      type: 'failure',
      key: 'q',
      requestId: 1,
      cursor: 'one',
      error: 'OFFLINE',
    });
    expect(failed.items).toEqual([card('a')]);
    expect(failed.nextCursor).toBe('one');
    const retry = reduce(failed, { type: 'start', key: 'q', requestId: 2, cursor: 'one' });
    expect(retry.error).toBeNull();
    expect(retry.loading).toBe(true);
    const done = reduce(retry, {
      type: 'success',
      key: 'q',
      requestId: 2,
      cursor: 'one',
      page: { items: [], nextCursor: null },
    });
    expect(done.nextCursor).toBeNull();
  });
  it('stops a non-advancing cursor instead of triggering an observer retry storm', () => {
    const state = reduce(initial('q', { items: [], nextCursor: 'one' }), {
      type: 'start',
      key: 'q',
      requestId: 1,
      cursor: 'one',
    });
    const result = reduce(state, {
      type: 'success',
      key: 'q',
      requestId: 1,
      cursor: 'one',
      page: { items: [], nextCursor: 'one' },
    });
    expect(result.error).toBe('INTERNAL');
    expect(result.loading).toBe(false);
  });
});
