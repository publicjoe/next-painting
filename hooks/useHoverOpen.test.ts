// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { HOVER_OPEN_MS, useHoverOpen } from './useHoverOpen';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const setup = (overId: string | null, isOpenable: (id: string) => boolean = () => true) => {
  const onOpen = vi.fn();
  const hook = renderHook(
    (props: { overId: string | null }) => useHoverOpen({ overId: props.overId, isOpenable, onOpen }),
    { initialProps: { overId } }
  );
  return { onOpen, ...hook };
};

describe('useHoverOpen', () => {
  it('opens after resting for the delay', () => {
    const { onOpen } = setup('c1');
    act(() => { vi.advanceTimersByTime(HOVER_OPEN_MS - 1); });
    expect(onOpen).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('c1');
  });

  it('does not open when overId changes before the delay, and restarts the clock', () => {
    const { onOpen, rerender } = setup('c1');
    act(() => { vi.advanceTimersByTime(499); });
    rerender({ overId: 'c2' });
    act(() => { vi.advanceTimersByTime(499); });
    expect(onOpen).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('c2');
  });

  it('never opens a target that is not openable or when overId is null', () => {
    const closed = setup('c1', () => false);
    const none = setup(null);
    act(() => { vi.advanceTimersByTime(HOVER_OPEN_MS * 2); });
    expect(closed.onOpen).not.toHaveBeenCalled();
    expect(none.onOpen).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer on unmount', () => {
    const { onOpen, unmount } = setup('c1');
    unmount();
    act(() => { vi.advanceTimersByTime(HOVER_OPEN_MS * 2); });
    expect(onOpen).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not call onOpen twice for the same continuous rest, even across re-renders', () => {
    const { onOpen, rerender } = setup('c1');
    act(() => { vi.advanceTimersByTime(HOVER_OPEN_MS); });
    rerender({ overId: 'c1' });
    act(() => { vi.advanceTimersByTime(HOVER_OPEN_MS * 3); });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('does not restart when only the callbacks change identity', () => {
    const onOpen = vi.fn();
    const { rerender } = renderHook(
      ({ tick }: { tick: number }) => useHoverOpen({ overId: 'c1', isOpenable: () => tick >= 0, onOpen: id => onOpen(id) }),
      { initialProps: { tick: 0 } }
    );
    act(() => { vi.advanceTimersByTime(400); });
    rerender({ tick: 1 });
    act(() => { vi.advanceTimersByTime(100); });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('leaves exactly one live timer under Strict Mode double effects', () => {
    const onOpen = vi.fn();
    renderHook(() => useHoverOpen({ overId: 'c1', isOpenable: () => true, onOpen }), { wrapper: StrictMode });
    expect(vi.getTimerCount()).toBe(1);
    act(() => { vi.advanceTimersByTime(HOVER_OPEN_MS); });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('honours a custom delay', () => {
    const onOpen = vi.fn();
    renderHook(() => useHoverOpen({ overId: 'c1', isOpenable: () => true, onOpen, delayMs: 100 }));
    act(() => { vi.advanceTimersByTime(100); });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
