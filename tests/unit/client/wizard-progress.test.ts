import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initialWizardState,
  persistedWizardProgress,
  wizardProgressSchema,
  wizardReducer,
  wizardSummary,
} from '../../../lib/wizard-progress';
import {
  readWizardProgress,
  wizardStorageKey,
  writeWizardProgress,
} from '../../../lib/client/wizard-progress';

const custom = 'custom:custom-11111111-1111-4111-8111-111111111111';
const ids = ['app:notes', custom, 'app:camera'];
afterEach(() => vi.unstubAllGlobals());

function memoryStorage(): Map<string, string> {
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  });
  return entries;
}

describe('wizard progress reducer', () => {
  it('tracks selected catalogue and custom IDs in their given order', () => {
    const initial = initialWizardState(ids);
    expect(wizardSummary(initial)).toEqual({
      done: 0,
      total: 3,
      complete: false,
      nextId: 'app:notes',
      percent: 0,
    });
    const next = wizardReducer(initial, { type: 'done', id: custom, value: true });
    expect(wizardSummary(next)).toEqual({
      done: 1,
      total: 3,
      complete: false,
      nextId: 'app:notes',
      percent: 33,
    });
    expect(wizardReducer(next, { type: 'done', id: custom, value: true }).done).toEqual([custom]);
  });

  it('ignores unknown IDs, deduplicates persisted rows, and prunes removed selections', () => {
    const state = initialWizardState(ids, {
      v: 1,
      done: ['app:gone', custom, custom],
      completed: true,
    });
    expect(state.done).toEqual([custom]);
    expect(wizardReducer(state, { type: 'done', id: 'app:unknown', value: true })).toBe(state);
    const next = wizardReducer(state, { type: 'reconcile', selectedIds: ['app:camera'] });
    expect(next.done).toEqual([]);
    expect(next.completed).toBe(true);
  });

  it('derives the next unfinished row and never claims an empty selection', () => {
    let state = initialWizardState(ids);
    state = wizardReducer(state, { type: 'done', id: 'app:notes', value: true });
    expect(wizardSummary(state).nextId).toBe(custom);
    expect(wizardReducer(state, { type: 'claim-completion' }).completed).toBe(false);
    const empty = initialWizardState([]);
    expect(wizardSummary(empty)).toEqual({
      done: 0,
      total: 0,
      complete: false,
      nextId: null,
      percent: 0,
    });
    expect(wizardReducer(empty, { type: 'claim-completion' }).completed).toBe(false);
  });

  it('retains a claimed completion after uncheck/recheck and reload, until explicit reset', () => {
    let state = initialWizardState(['app:notes']);
    state = wizardReducer(state, { type: 'done', id: 'app:notes', value: true });
    state = wizardReducer(state, { type: 'claim-completion' });
    expect(state.completed).toBe(true);
    expect(wizardReducer(state, { type: 'claim-completion' })).toBe(state);
    state = wizardReducer(state, { type: 'done', id: 'app:notes', value: false });
    expect(state.completed).toBe(true);
    state = initialWizardState(['app:notes'], persistedWizardProgress(state));
    state = wizardReducer(state, { type: 'done', id: 'app:notes', value: true });
    expect(wizardReducer(state, { type: 'claim-completion' })).toBe(state);
    state = wizardReducer(state, { type: 'reset' });
    expect(state).toMatchObject({ done: [], completed: false, selectedIds: ['app:notes'] });
    state = wizardReducer(state, { type: 'done', id: 'app:notes', value: true });
    expect(wizardReducer(state, { type: 'claim-completion' }).completed).toBe(true);
  });

  it('strips reducer-only state from persisted output', () => {
    expect(persistedWizardProgress(initialWizardState(ids))).toEqual({
      v: 1,
      done: [],
      completed: false,
    });
  });

  it.each([
    { v: 2, done: [], completed: false },
    { v: 1, done: ['notes'], completed: false },
    { v: 1, done: ['custom:custom-invalid'], completed: false },
    { v: 1, done: [], completed: 'true' },
    { v: 1, done: [], completed: false, private: true },
    { v: 1, done: Array.from({ length: 146 }, (_, i) => `app:app-${i}`), completed: false },
  ])('rejects corrupt or oversized progress %j', (value) => {
    expect(wizardProgressSchema.safeParse(value).success).toBe(false);
  });
});

describe('versioned wizard persistence', () => {
  it('scopes progress to a theme or the generic guide and reads only persisted fields', () => {
    const entries = memoryStorage();
    const state = wizardReducer(initialWizardState(ids), { type: 'done', id: custom, value: true });
    writeWizardProgress('lavender-dream', state);
    expect(readWizardProgress('lavender-dream')).toEqual({
      v: 1,
      done: [custom],
      completed: false,
    });
    expect(readWizardProgress(null)).toBeNull();
    expect(wizardStorageKey(null)).toBe('vibeset:ios-wizard:default');
    expect(
      JSON.parse(entries.get(wizardStorageKey('lavender-dream')) ?? 'null'),
    ).not.toHaveProperty('selectedIds');
  });

  it.each(['{broken', 'null', '{"v":2,"done":[],"completed":false}', 'x'.repeat(32_769)])(
    'ignores corrupt localStorage values',
    (raw) => {
      const entries = memoryStorage();
      entries.set(wizardStorageKey(null), raw);
      expect(readWizardProgress(null)).toBeNull();
    },
  );

  it('remains usable when storage is denied', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('Denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('Denied', 'SecurityError');
      },
    });
    expect(readWizardProgress(null)).toBeNull();
    expect(() => writeWizardProgress(null, { v: 1, done: [], completed: false })).not.toThrow();
  });

  it('retains completion across remounts with blocked storage and clears it only on reset', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('Denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('Denied', 'SecurityError');
      },
    });
    let state = initialWizardState(['app:notes']);
    state = wizardReducer(state, { type: 'done', id: 'app:notes', value: true });
    state = wizardReducer(state, { type: 'claim-completion' });
    writeWizardProgress('blocked-theme', state);
    const resumed = initialWizardState(['app:notes'], readWizardProgress('blocked-theme'));
    expect(resumed.completed).toBe(true);
    expect(resumed.done).toEqual(['app:notes']);
    expect(wizardReducer(resumed, { type: 'claim-completion' })).toBe(resumed);
    writeWizardProgress('blocked-theme', wizardReducer(resumed, { type: 'reset' }));
    expect(readWizardProgress('blocked-theme')).toEqual({ v: 1, done: [], completed: false });
    expect(readWizardProgress('different-theme')).toBeNull();
  });

  it('clears volatile fallback after missing or corrupt readable storage', () => {
    const entries = memoryStorage();
    writeWizardProgress('removed-theme', { v: 1, done: ['app:notes'], completed: true });
    entries.delete(wizardStorageKey('removed-theme'));
    expect(readWizardProgress('removed-theme')).toBeNull();
    entries.set(wizardStorageKey('removed-theme'), '{broken');
    expect(readWizardProgress('removed-theme')).toBeNull();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Denied');
      },
    });
    expect(readWizardProgress('removed-theme')).toBeNull();
  });

  it('rejects unsafe keys and invalid progress before writing', () => {
    const entries = memoryStorage();
    expect(() => wizardStorageKey('../theme')).toThrow();
    expect(() =>
      writeWizardProgress(null, { v: 1, done: ['invalid'], completed: false }),
    ).toThrow();
    expect(entries.size).toBe(0);
  });
});
