// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

// Hidden (not open) <dialog> content is excluded from the role tree, so these
// queries also prove the dialog was opened.
const setup = () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <>
      <button type="button">Trigger</button>
      <ConfirmDialog title="Replace all data?" description="This cannot be undone." confirmLabel="Replace" onConfirm={onConfirm} onCancel={onCancel} />
    </>
  );
  return { onConfirm, onCancel };
};

describe('ConfirmDialog', () => {
  it('opens modally, labelled and described, with focus on Cancel', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Replace all data?' });
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe('This cannot be undone.');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('confirms', () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels from the Cancel button', () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels on Escape (the native cancel event)', () => {
    const { onConfirm, onCancel } = setup();
    const event = new Event('cancel', { cancelable: true });
    fireEvent(screen.getByRole('dialog'), event);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true); // the parent decides when it closes
  });

  it('returns focus to the trigger when it unmounts', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(<ConfirmDialog title="T" description="D" confirmLabel="Go" onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('has no axe violations', async () => {
    setup();
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } }); // jsdom cannot measure contrast
    expect(results.violations).toEqual([]);
  });
});
