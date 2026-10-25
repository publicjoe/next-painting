import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { MoreIcon } from './icons';

export interface MoveOption {
  /** Unique within one menu. Labels need not be: two categories can share a name. */
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface MoveMenuProps {
  /** Accessible name of the trigger, for example "Move project Party". */
  label: string;
  options: MoveOption[];
  /** Identifies the trigger so a parent can find it again after a re-render moves it. */
  focusKey?: string;
}

/**
 * A button that opens a small menu of move actions. This is the single-pointer
 * alternative to dragging. Disabled options use aria-disabled so they stay
 * discoverable, and do nothing when activated.
 */
export function MoveMenu({ label, options, focusKey }: MoveMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const enabled = () => items.current.filter((el): el is HTMLButtonElement => !!el && el.getAttribute('aria-disabled') !== 'true');

  // On open, focus the first enabled item
  useEffect(() => {
    // With nothing enabled, keep focus on the trigger (Safari does not focus a clicked button)
    if (open) (enabled()[0] ?? trigger.current)?.focus();
  }, [open]);

  // A press outside closes the menu. Focus is left where the user put it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  // Attached to the root, so it still sees keys while focus is on the trigger
  // (which is where it stays when every item is disabled).
  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      setOpen(false); // let focus move on naturally
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const list = enabled();
      if (list.length === 0) return;
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      let next: number;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = list.length - 1;
      else if (e.key === 'ArrowDown') next = (at + 1) % list.length;
      else next = (at - 1 + list.length) % list.length;
      list[next].focus();
    }
  };

  return (
    <span ref={root} onKeyDown={onKeyDown} className="relative inline-flex">
      <button
        type="button"
        ref={trigger}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        data-focus-key={focusKey}
        className="inline-flex min-h-6 min-w-6 items-center justify-center rounded p-2 text-zinc-400 hover:text-blue-300 focus-visible:text-blue-300"
      >
        <MoreIcon />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-20 mt-1 min-w-40 rounded-lg border border-zinc-600 bg-zinc-900 py-1 text-sm text-zinc-200 shadow-lg"
        >
          {options.map((option, i) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              ref={(el) => { items.current[i] = el; }}
              aria-disabled={option.disabled ? true : undefined}
              onClick={() => {
                if (option.disabled) return;
                option.onSelect();
                close();
              }}
              className="block w-full px-3 py-1.5 text-left hover:bg-zinc-700 focus-visible:bg-zinc-700 aria-disabled:text-zinc-500 aria-disabled:hover:bg-transparent"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
