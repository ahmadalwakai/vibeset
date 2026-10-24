import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCardLongPress } from '../../../lib/client/card-long-press';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('card touch long press', () => {
  it('opens at500ms exactly once and suppresses only its following pointer click', () => {
    const open = vi.fn();
    const gesture = createCardLongPress(open);
    gesture.start(1, 10, 20);
    vi.advanceTimersByTime(499);
    expect(open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(open).toHaveBeenCalledTimes(1);
    gesture.release(1);
    vi.advanceTimersByTime(1000);
    expect(open).toHaveBeenCalledTimes(1);
    expect(gesture.consumeClick()).toBe(true);
    expect(gesture.consumeClick()).toBe(false);
  });
  it('keeps ordinary taps as normal links', () => {
    const open = vi.fn();
    const gesture = createCardLongPress(open);
    gesture.start(1, 0, 0);
    vi.advanceTimersByTime(400);
    gesture.release(1);
    vi.advanceTimersByTime(1000);
    expect(open).not.toHaveBeenCalled();
    expect(gesture.consumeClick()).toBe(false);
  });
  it('tolerates8px but cancels larger movement in any direction', () => {
    const open = vi.fn();
    const gesture = createCardLongPress(open);
    gesture.start(1, 10, 10);
    expect(gesture.move(1, 18, 10)).toBe(true);
    expect(gesture.move(1, 16, 16)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(open).not.toHaveBeenCalled();
    expect(gesture.consumeClick()).toBe(false);
  });
  it('ignores other pointer ids and cancels the timer on scroll/pointercancel/unmount', () => {
    const open = vi.fn();
    const gesture = createCardLongPress(open);
    gesture.start(1, 10, 10);
    gesture.move(2, 200, 200);
    gesture.release(2);
    vi.advanceTimersByTime(499);
    expect(gesture.blocksContextMenu()).toBe(true);
    gesture.cancel();
    vi.advanceTimersByTime(500);
    expect(open).not.toHaveBeenCalled();
    expect(gesture.blocksContextMenu()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('restarts the threshold and clears stale suppression for a new gesture', () => {
    const open = vi.fn();
    const gesture = createCardLongPress(open);
    gesture.start(1, 0, 0);
    vi.advanceTimersByTime(500);
    gesture.release(1);
    gesture.start(2, 0, 0);
    expect(gesture.consumeClick()).toBe(false);
    vi.advanceTimersByTime(300);
    gesture.start(3, 0, 0);
    vi.advanceTimersByTime(499);
    expect(open).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(open).toHaveBeenCalledTimes(2);
    gesture.cancel();
  });
});
