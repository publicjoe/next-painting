// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { axe } from '@/lib/test-axe';
import { TOAST_MS, UndoToasts } from './UndoToasts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const toasts = [{ id: 't1', message: 'Deleted unit "Captain".' }];
const setup = () => {
  const onUndo = vi.fn();
  const onDismiss = vi.fn();
  render(<UndoToasts toasts={toasts} onUndo={onUndo} onDismiss={onDismiss} />);
  return { onUndo, onDismiss };
};
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('UndoToasts', () => {
  it('is a polite status region with a reachable Undo button', () => {
    const { onUndo } = setup();
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo.tabIndex).toBeGreaterThanOrEqual(0);
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledWith('t1');
  });

  it('keeps the live region mounted when empty', () => {
    render(<UndoToasts toasts={[]} onUndo={() => {}} onDismiss={() => {}} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('dismisses itself after the timeout', () => {
    const { onDismiss } = setup();
    wait(TOAST_MS - 1);
    expect(onDismiss).not.toHaveBeenCalled();
    wait(1);
    expect(onDismiss).toHaveBeenCalledWith('t1');
  });

  it('pauses on hover and restarts on leave', () => {
    const { onDismiss } = setup();
    const item = screen.getByText(/Deleted unit/).parentElement!;
    wait(TOAST_MS - 100);
    fireEvent.mouseEnter(item);
    wait(TOAST_MS * 3);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseLeave(item);
    wait(TOAST_MS);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('pauses while the Undo button has keyboard focus', () => {
    const { onDismiss } = setup();
    const undo = screen.getByRole('button', { name: 'Undo' });
    act(() => undo.focus());
    wait(TOAST_MS * 3);
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => undo.blur());
    wait(TOAST_MS);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('has no axe violations', async () => {
    vi.useRealTimers(); // axe uses timers internally
    setup();
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } }); // jsdom cannot measure contrast
    expect(results.violations).toEqual([]);
  });

  it('stays while focused, even after the mouse enters and leaves', () => {
    const { onDismiss } = setup();
    const undo = screen.getByRole('button', { name: 'Undo' });
    act(() => undo.focus());
    const toast = undo.closest('div')!;
    fireEvent.mouseEnter(toast);
    fireEvent.mouseLeave(toast);
    wait(TOAST_MS * 2);
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => undo.blur());
    wait(TOAST_MS);
    expect(onDismiss).toHaveBeenCalledWith('t1');
  });
});
