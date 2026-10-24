// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Error from './error';
import { STORAGE_KEY } from '@/lib/migrate';

const BACKUP_KEY = `${STORAGE_KEY}.bak`;

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const setup = () => {
  const retry = vi.fn();
  render(<Error error={new globalThis.Error('boom')} retry={retry} />);
  return retry;
};

describe('error boundary', () => {
  it('shows an inline alert, not a native alert, when there is nothing to export', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Export raw data' }));
    const message = screen.getByText('There is no stored data to export.');
    expect(message.getAttribute('role')).toBe('alert');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('asks first, and cancelling leaves the data alone', () => {
    localStorage.setItem(STORAGE_KEY, 'raw');
    const retry = setup();
    const trigger = screen.getByRole('button', { name: 'Reset data' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Reset stored data?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('raw');
    expect(retry).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('backs up, clears and retries on confirm', () => {
    localStorage.setItem(STORAGE_KEY, 'raw');
    const retry = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Reset data' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Reset data')!);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(BACKUP_KEY)).toBe('raw');
    expect(retry).toHaveBeenCalledOnce();
  });
});
