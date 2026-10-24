import type { ErrorMessageCode } from './result';

export const REVIEW_UNDO_MS = 5_000;
export const PUBLISH_CONCURRENCY = 2;
export type ReviewDecisionTarget = 'approved' | 'rejected';
export interface ReviewQueueInput extends PublishQueueInput {
  reviewVersion: string;
}
export interface ReviewDecision {
  id: string;
  key: string;
  reviewVersion: string;
  nameEn: string;
  nameAr: string | null;
  to: ReviewDecisionTarget;
  reason?: string;
  publish: boolean;
  deadline: number;
  status: 'pending' | 'sending' | 'done' | 'failed';
  error: ErrorMessageCode | null;
}
export interface ReviewDecisionState {
  decisions: readonly ReviewDecision[];
}
export type ReviewDecisionAction =
  | {
      type: 'stage';
      id: string;
      reviewVersion: string;
      nameEn?: string;
      nameAr?: string | null;
      to: ReviewDecisionTarget;
      reason?: string;
      publish: boolean;
      now: number;
    }
  | { type: 'undo'; now: number }
  | { type: 'start'; key: string; now: number }
  | { type: 'finish'; key: string; error: ErrorMessageCode | null }
  | { type: 'retry'; key: string; now: number };

export function reviewDecisionKey(theme: Pick<ReviewQueueInput, 'id' | 'reviewVersion'>): string {
  return JSON.stringify([theme.id, theme.reviewVersion]);
}

/** Active work is exclusive per theme; completed work hides only its reviewed submission. */
export function reviewItemBlocked(
  state: ReviewDecisionState,
  theme: Pick<ReviewQueueInput, 'id' | 'reviewVersion'>,
): boolean {
  const key = reviewDecisionKey(theme);
  return state.decisions.some(
    (item) =>
      item.id === theme.id &&
      (item.status === 'pending' ||
        item.status === 'sending' ||
        (item.status === 'done' && item.key === key)),
  );
}

export function undoableDecision(
  state: ReviewDecisionState,
  now: number,
): ReviewDecision | undefined {
  return state.decisions.reduce<ReviewDecision | undefined>(
    (latest, item) =>
      item.status === 'pending' &&
      now < item.deadline &&
      (!latest || item.deadline >= latest.deadline)
        ? item
        : latest,
    undefined,
  );
}

export function reviewDecisionReducer(
  state: ReviewDecisionState,
  action: ReviewDecisionAction,
): ReviewDecisionState {
  if (action.type === 'stage') {
    if (reviewItemBlocked(state, action)) return state;
    const key = reviewDecisionKey(action);
    return {
      decisions: [
        ...state.decisions.filter((item) => item.id !== action.id || item.status !== 'failed'),
        {
          id: action.id,
          key,
          reviewVersion: action.reviewVersion,
          nameEn: action.nameEn ?? action.id,
          nameAr: action.nameAr ?? null,
          to: action.to,
          ...(action.reason ? { reason: action.reason } : {}),
          publish: action.to === 'approved' && action.publish,
          deadline: action.now + REVIEW_UNDO_MS,
          status: 'pending',
          error: null,
        },
      ],
    };
  }
  if (action.type === 'undo') {
    const item = undoableDecision(state, action.now);
    return item ? { decisions: state.decisions.filter((candidate) => candidate !== item) } : state;
  }
  return {
    decisions: state.decisions.map((item) => {
      if (item.key !== action.key) return item;
      if (action.type === 'start')
        return item.status === 'pending' && action.now >= item.deadline
          ? { ...item, status: 'sending' }
          : item;
      if (action.type === 'finish')
        return item.status === 'sending'
          ? { ...item, status: action.error ? 'failed' : 'done', error: action.error }
          : item;
      return item.status === 'failed'
        ? { ...item, status: 'pending', deadline: action.now + REVIEW_UNDO_MS, error: null }
        : item;
    }),
  };
}

export interface PublishQueueInput {
  id: string;
  nameEn: string;
  nameAr: string | null;
}
export type PublishJobStatus = 'queued' | 'rendering' | 'done' | 'skipped' | 'failed' | 'cancelled';
export interface PublishJob extends PublishQueueInput {
  force: boolean;
  status: PublishJobStatus;
  error: ErrorMessageCode | null;
}
export interface PublishQueueState {
  items: readonly PublishJob[];
  paused: boolean;
}
export type PublishQueueAction =
  | { type: 'enqueue'; items: readonly PublishQueueInput[]; force: boolean }
  | { type: 'start'; id: string }
  | { type: 'finish'; id: string; status: 'done' | 'skipped' | 'failed'; error?: ErrorMessageCode }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'cancel' }
  | { type: 'clearFinished' }
  | { type: 'retry'; id?: string };

export function nextPublishJobs(state: PublishQueueState, active: number): readonly PublishJob[] {
  return state.paused
    ? []
    : state.items
        .filter((item) => item.status === 'queued')
        .slice(0, Math.max(0, PUBLISH_CONCURRENCY - active));
}
export function publishQueueBusy(state: PublishQueueState): boolean {
  return state.items.some((item) => item.status === 'queued' || item.status === 'rendering');
}
export function publishQueueReducer(
  state: PublishQueueState,
  action: PublishQueueAction,
): PublishQueueState {
  if (action.type === 'enqueue') {
    const items = [...state.items];
    const seen = new Set<string>();
    for (const input of action.items) {
      if (seen.has(input.id)) continue;
      seen.add(input.id);
      const index = items.findIndex((item) => item.id === input.id);
      const prior = items[index];
      if (prior?.status === 'queued' || prior?.status === 'rendering') continue;
      const next: PublishJob = {
        id: input.id,
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        force: action.force,
        status: 'queued',
        error: null,
      };
      if (index < 0) items.push(next);
      else items[index] = next;
    }
    return { ...state, items };
  }
  if (action.type === 'pause' || action.type === 'resume')
    return { ...state, paused: action.type === 'pause' };
  if (action.type === 'clearFinished')
    return {
      ...state,
      items: state.items.filter((item) => ['queued', 'rendering', 'failed'].includes(item.status)),
    };
  return {
    ...state,
    items: state.items.map((item) => {
      if (action.type === 'cancel')
        return item.status === 'queued' || item.status === 'rendering'
          ? { ...item, status: 'cancelled', error: null }
          : item;
      if (action.type === 'retry')
        return item.status === 'failed' && (!action.id || action.id === item.id)
          ? { ...item, status: 'queued', error: null }
          : item;
      if (item.id !== action.id) return item;
      if (action.type === 'start')
        return item.status === 'queued' ? { ...item, status: 'rendering' } : item;
      // A response arriving after cancellation must never revive an abandoned job.
      return item.status === 'rendering'
        ? { ...item, status: action.status, error: action.error ?? null }
        : item;
    }),
  };
}
