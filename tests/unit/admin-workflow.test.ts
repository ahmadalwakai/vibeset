import { describe, expect, it } from 'vitest';
import {
  nextPublishJobs,
  publishQueueBusy,
  publishQueueReducer,
  reviewDecisionKey,
  reviewItemBlocked,
  reviewDecisionReducer,
  undoableDecision,
} from '../../lib/admin-workflow';
import type { PublishQueueState, ReviewDecisionState } from '../../lib/admin-workflow';

const version = (id: string, reviewVersion = 'v1') => ({ id, reviewVersion });
const key = (id: string, reviewVersion = 'v1'): string =>
  reviewDecisionKey(version(id, reviewVersion));
const stage = (
  state: ReviewDecisionState,
  id: string,
  now = 100,
  reviewVersion = 'v1',
): ReviewDecisionState =>
  reviewDecisionReducer(state, {
    type: 'stage',
    ...version(id, reviewVersion),
    to: 'approved',
    publish: true,
    now,
  });
const start = (
  state: ReviewDecisionState,
  id: string,
  now = 5100,
  reviewVersion = 'v1',
): ReviewDecisionState =>
  reviewDecisionReducer(state, { type: 'start', key: key(id, reviewVersion), now });
const finish = (
  state: ReviewDecisionState,
  id: string,
  error: null | 'NETWORK' | 'CONFLICT' = null,
  reviewVersion = 'v1',
): ReviewDecisionState =>
  reviewDecisionReducer(state, { type: 'finish', key: key(id, reviewVersion), error });
const empty: ReviewDecisionState = { decisions: [] };

describe('review decision undo window', () => {
  it('waits the full five seconds and permits undo only before the boundary', () => {
    const state = stage(empty, 'one');
    expect(start(state, 'one', 5099)).toEqual(state);
    expect(undoableDecision(state, 5099)?.id).toBe('one');
    expect(reviewDecisionReducer(state, { type: 'undo', now: 5099 }).decisions).toEqual([]);
    expect(undoableDecision(state, 5100)).toBeUndefined();
    expect(reviewDecisionReducer(state, { type: 'undo', now: 5100 })).toEqual(state);
    expect(start(state, 'one').decisions[0]?.status).toBe('sending');
  });
  it('undoes the latest eligible decision without cancelling an older request', () => {
    let state = stage(stage(empty, 'one', 0), 'two', 1000);
    state = start(state, 'one', 5000);
    state = reviewDecisionReducer(state, { type: 'undo', now: 5001 });
    expect(state.decisions.map((item) => [item.id, item.status])).toEqual([['one', 'sending']]);
  });
  it('deduplicates staged work and never queues rejected themes for publication', () => {
    const state = stage(empty, 'one');
    expect(stage(state, 'one', 300)).toEqual(state);
    const rejected = reviewDecisionReducer(empty, {
      type: 'stage',
      ...version('two'),
      to: 'rejected',
      reason: 'Duplicate',
      publish: true,
      now: 0,
    });
    expect(rejected.decisions[0]).toMatchObject({ reason: 'Duplicate', publish: false });
  });
  it('accepts only sending responses and gives retries a fresh undo window', () => {
    let state = stage(empty, 'one', 0);
    expect(finish(state, 'one')).toEqual(state);
    state = finish(start(state, 'one', 5000), 'one', 'CONFLICT');
    expect(state.decisions[0]).toMatchObject({ status: 'failed', error: 'CONFLICT' });
    state = reviewDecisionReducer(state, { type: 'retry', key: key('one'), now: 10000 });
    expect(state.decisions[0]).toMatchObject({ status: 'pending', deadline: 15000, error: null });
  });
  it('treats a retried older row as the latest undoable decision', () => {
    let state = finish(start(stage(empty, 'one', 0), 'one', 5000), 'one', 'NETWORK');
    state = stage(state, 'two', 6000);
    state = reviewDecisionReducer(state, { type: 'retry', key: key('one'), now: 7000 });
    expect(undoableDecision(state, 7001)?.id).toBe('one');
    expect(
      reviewDecisionReducer(state, { type: 'undo', now: 7001 }).decisions.map((item) => item.id),
    ).toEqual(['two']);
  });
});

describe('submission-scoped review decisions', () => {
  it('allows a revised resubmission while suppressing stale snapshots of the completed version', () => {
    let state = finish(start(stage(empty, 'theme', 0), 'theme', 5000), 'theme');
    expect(reviewItemBlocked(state, version('theme', 'v1'))).toBe(true);
    expect(reviewItemBlocked(state, version('theme', 'v2'))).toBe(false);
    expect(stage(state, 'theme', 6000, 'v1')).toEqual(state);
    state = stage(state, 'theme', 6000, 'v2');
    expect(state.decisions.map((item) => item.key)).toEqual([
      key('theme', 'v1'),
      key('theme', 'v2'),
    ]);
    state = finish(start(state, 'theme', 11000, 'v2'), 'theme', null, 'v2');
    expect(reviewItemBlocked(state, version('theme', 'v1'))).toBe(true);
    expect(reviewItemBlocked(state, version('theme', 'v2'))).toBe(true);
    expect(reviewItemBlocked(state, version('theme', 'v3'))).toBe(false);
  });
  it('keeps active work exclusive per theme across concurrently refreshed versions', () => {
    const state = stage(empty, 'theme', 0);
    expect(reviewItemBlocked(state, version('theme', 'v2'))).toBe(true);
    expect(stage(state, 'theme', 100, 'v2')).toEqual(state);
    const sending = start(state, 'theme', 5000);
    expect(stage(sending, 'theme', 5100, 'v2')).toEqual(sending);
  });
  it('does not let an old version response or retry mutate a newer submission', () => {
    let state = finish(start(stage(empty, 'theme', 0), 'theme', 5000), 'theme');
    state = start(stage(state, 'theme', 6000, 'v2'), 'theme', 11000, 'v2');
    expect(finish(state, 'theme', 'NETWORK', 'v1')).toEqual(state);
    expect(
      reviewDecisionReducer(state, { type: 'retry', key: key('theme', 'v1'), now: 12000 }),
    ).toEqual(state);
    expect(state.decisions[1]?.status).toBe('sending');
  });
  it('replaces obsolete failed work when a fresh submission is deliberately staged', () => {
    let state = finish(start(stage(empty, 'theme', 0), 'theme', 5000), 'theme', 'NETWORK');
    expect(reviewItemBlocked(state, version('theme'))).toBe(false);
    state = stage(state, 'theme', 6000, 'v2');
    expect(state.decisions).toHaveLength(1);
    expect(state.decisions[0]?.key).toBe(key('theme', 'v2'));
  });
  it('uses collision-safe pairs for opaque theme/version keys', () => {
    expect(key('a:b', 'c')).not.toBe(key('a', 'b:c'));
  });
  it('preserves the captured server precondition through a failed request and retry', () => {
    const token = 'a'.repeat(64);
    let state = stage(empty, 'theme', 0, token);
    state = finish(start(state, 'theme', 5000, token), 'theme', 'CONFLICT', token);
    state = reviewDecisionReducer(state, { type: 'retry', key: key('theme', token), now: 7000 });
    expect(state.decisions[0]).toMatchObject({
      reviewVersion: token,
      key: key('theme', token),
      status: 'pending',
    });
  });
});

describe('publish orchestration state', () => {
  const empty: PublishQueueState = { items: [], paused: false };
  const rows = ['one', 'two', 'three'].map((id) => ({ id, nameEn: id, nameAr: null }));
  const queued = (): PublishQueueState =>
    publishQueueReducer(empty, { type: 'enqueue', items: rows, force: false });
  it('retains only job metadata when a caller passes a larger theme DTO', () => {
    const row = {
      id: 'one',
      nameEn: 'One',
      nameAr: null,
      spec: { private: true },
      history: ['audit'],
    };
    const state = publishQueueReducer(empty, { type: 'enqueue', items: [row], force: false });
    expect(state.items[0]).toEqual({
      id: 'one',
      nameEn: 'One',
      nameAr: null,
      force: false,
      status: 'queued',
      error: null,
    });
  });
  it('deduplicates queue additions and respects two concurrent renders', () => {
    let state = queued();
    state = publishQueueReducer(state, {
      type: 'enqueue',
      items: [...rows, rows[0]].filter((item) => item !== undefined),
      force: true,
    });
    expect(state.items).toHaveLength(3);
    expect(state.items.every((item) => !item.force)).toBe(true);
    expect(nextPublishJobs(state, 0).map((item) => item.id)).toEqual(['one', 'two']);
    expect(nextPublishJobs(state, 1).map((item) => item.id)).toEqual(['one']);
    expect(nextPublishJobs(state, 2)).toEqual([]);
    expect(nextPublishJobs(state, 3)).toEqual([]);
  });
  it('pauses new work while allowing an accepted render to complete', () => {
    let state = publishQueueReducer(queued(), { type: 'start', id: 'one' });
    state = publishQueueReducer(state, { type: 'pause' });
    expect(nextPublishJobs(state, 1)).toEqual([]);
    state = publishQueueReducer(state, { type: 'finish', id: 'one', status: 'done' });
    expect(state.items[0]?.status).toBe('done');
    expect(
      nextPublishJobs(publishQueueReducer(state, { type: 'resume' }), 0).map((item) => item.id),
    ).toEqual(['two', 'three']);
  });
  it('cancels queued/rendering work and ignores a late successful response', () => {
    let state = publishQueueReducer(queued(), { type: 'start', id: 'one' });
    state = publishQueueReducer(state, { type: 'cancel' });
    expect(state.items.every((item) => item.status === 'cancelled')).toBe(true);
    expect(publishQueueBusy(state)).toBe(false);
    expect(publishQueueReducer(state, { type: 'finish', id: 'one', status: 'done' })).toEqual(
      state,
    );
  });
  it('retains failures for explicit retry and clears successful/cancelled history only', () => {
    let state = publishQueueReducer(queued(), { type: 'start', id: 'one' });
    state = publishQueueReducer(state, {
      type: 'finish',
      id: 'one',
      status: 'failed',
      error: 'NETWORK',
    });
    state = publishQueueReducer(state, { type: 'start', id: 'two' });
    state = publishQueueReducer(state, { type: 'finish', id: 'two', status: 'skipped' });
    state = publishQueueReducer(state, { type: 'clearFinished' });
    expect(state.items.map((item) => item.id)).toEqual(['one', 'three']);
    state = publishQueueReducer(state, { type: 'retry', id: 'one' });
    expect(state.items[0]).toMatchObject({ status: 'queued', error: null });
    expect(publishQueueBusy(state)).toBe(true);
  });
});
