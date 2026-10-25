// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { axe } from '@/lib/test-axe';
import { MoveMenu, type MoveOption } from './MoveMenu';

afterEach(cleanup);

const setup = (options: MoveOption[] = [
  { id: 'Move up', label: 'Move up', onSelect: vi.fn(), disabled: true },
  { id: 'Move down', label: 'Move down', onSelect: vi.fn() },
]) => {
  render(<main><MoveMenu label="Move project Party" options={options} /></main>);
  return { options, trigger: screen.getByRole('button', { name: 'Move project Party' }) };
};

describe('MoveMenu', () => {
  it('is closed to start with and announces itself as a menu button', () => {
    const { trigger } = setup();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens and closes with clicks on the trigger', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Move up', 'Move down']);
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves focus to the first enabled item on open', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Move down' }));
  });

  it('closes on Escape and returns focus to the trigger', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape and returns focus to the trigger when every item is disabled', () => {
    const { trigger } = setup([
      { id: 'Move up', label: 'Move up', onSelect: () => {}, disabled: true },
      { id: 'Move down', label: 'Move down', onSelect: () => {}, disabled: true },
    ]);
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(trigger); // nothing enabled to focus
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes when focus leaves the menu, without stealing it back', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).not.toBe(trigger);
  });

  it('calls onSelect, closes and returns focus to the trigger when an item is chosen', () => {
    const { trigger, options } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(options[1].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('marks a disabled item aria-disabled and does not activate it', () => {
    const { trigger, options } = setup();
    fireEvent.click(trigger);
    const up = screen.getByRole('menuitem', { name: 'Move up' });
    expect(up.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(up);
    expect(options[0].onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('moves between enabled items with the arrow keys, wrapping round', () => {
    const { trigger } = setup([
      { id: 'A', label: 'A', onSelect: () => {} },
      { id: 'B', label: 'B', onSelect: () => {}, disabled: true },
      { id: 'C', label: 'C', onSelect: () => {} },
    ]);
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'A' }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'C' }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'A' }));
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'C' }));
  });

  it('has no axe violations open or closed', async () => {
    const { trigger } = setup();
    const rules = { 'color-contrast': { enabled: false } };
    expect((await axe(document.body, { rules })).violations).toEqual([]);
    fireEvent.click(trigger);
    expect((await axe(document.body, { rules })).violations).toEqual([]);
  });
});
