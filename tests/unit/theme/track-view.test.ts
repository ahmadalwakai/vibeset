import { describe, expect, it, vi } from 'vitest';
import { trackViewOnce } from '@/components/theme/TrackView';

vi.mock('@/lib/client/track', () => ({ track: vi.fn() }));

const THEME_A = '11111111-1111-4111-8111-111111111111';
const THEME_B = '22222222-2222-4222-8222-222222222222';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('theme view session guard', () => {
  it('tracks one visit across remounts and deduplicates a later page instance via session storage', () => {
    const storage = memoryStorage();
    const send = vi.fn();
    const seen = new Set<string>();
    trackViewOnce(THEME_A, storage, send, seen);
    trackViewOnce(THEME_A, storage, send, seen);
    trackViewOnce(THEME_A, storage, send, new Set());
    expect(send).toHaveBeenCalledExactlyOnceWith(THEME_A, 'view');
    expect(storage.getItem('vibeset:viewed:' + THEME_A)).toBe('1');
  });

  it('records different themes separately and allows a visit in a new session', () => {
    const send = vi.fn();
    const storage = memoryStorage();
    const seen = new Set<string>();
    trackViewOnce(THEME_A, storage, send, seen);
    trackViewOnce(THEME_B, storage, send, seen);
    trackViewOnce(THEME_A, memoryStorage(), send, new Set());
    expect(send.mock.calls).toEqual([
      [THEME_A, 'view'],
      [THEME_B, 'view'],
      [THEME_A, 'view'],
    ]);
  });

  it.each(['true', '0', 'null', '1\n', '"1"'])(
    'does not trust malformed stored marker %j',
    (marker) => {
      const storage = memoryStorage();
      storage.setItem('vibeset:viewed:' + THEME_A, marker);
      const send = vi.fn();
      trackViewOnce(THEME_A, storage, send, new Set());
      expect(send).toHaveBeenCalledExactlyOnceWith(THEME_A, 'view');
    },
  );

  it('keeps a memory guard when session storage is blocked', () => {
    const storage = {
      getItem: (): never => {
        throw new DOMException('Blocked', 'SecurityError');
      },
      setItem: (): never => {
        throw new DOMException('Blocked', 'SecurityError');
      },
    };
    const send = vi.fn();
    const seen = new Set<string>();
    trackViewOnce(THEME_A, storage, send, seen);
    trackViewOnce(THEME_A, storage, send, seen);
    expect(send).toHaveBeenCalledExactlyOnceWith(THEME_A, 'view');
  });

  it('marks the visit before sending, preventing synchronous re-entry duplication', () => {
    const seen = new Set<string>();
    const send = vi.fn(() => {
      trackViewOnce(THEME_A, null, send, seen);
    });
    trackViewOnce(THEME_A, null, send, seen);
    expect(send).toHaveBeenCalledOnce();
  });
});
