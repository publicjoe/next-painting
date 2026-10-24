import { useEffect, useState } from 'react';

export interface UndoToast {
  id: string;
  message: string;
  /** Move keyboard focus to this toast's Undo button when it appears. */
  focus?: boolean;
}

/** How long a toast stays before it dismisses itself. */
export const TOAST_MS = 8000;

interface ToastItemProps {
  toast: UndoToast;
  onUndo: (id: string) => void;
  /** Timed dismissal: focus is never inside a toast while its timer runs. */
  onDismiss: (id: string) => void;
  /** The Dismiss button; falls back to onDismiss. Lets the owner restore focus. */
  onClose?: (id: string) => void;
}

function ToastItem({ toast, onUndo, onDismiss, onClose }: ToastItemProps) {
  // Hover or keyboard focus pauses the countdown; leaving restarts it in full.
  // Two flags, so leaving with the mouse cannot restart the timer while the
  // keyboard focus is still inside the toast.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [paused, toast.id, onDismiss]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        // Focus moving between the toast's own buttons is not leaving it
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      className="flex items-center gap-4 rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 shadow-lg"
    >
      <span className="flex-1">{toast.message}</span>
      {/* autoFocus: after a delete the focused control is gone, so keyboard focus
          would drop to <body>. The toast stays while it holds focus. */}
      <button type="button" autoFocus={toast.focus} onClick={() => onUndo(toast.id)} className="rounded bg-zinc-700 px-3 py-1 font-medium hover:bg-zinc-600">
        Undo
      </button>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => (onClose ?? onDismiss)(toast.id)}
        className="rounded px-2 py-1 text-zinc-300 hover:bg-zinc-700"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  );
}

// The live region is always mounted: screen readers only announce changes to a
// region that already exists, so it must not appear together with its content.
export function UndoToasts({ toasts, onUndo, onDismiss, onClose }: Omit<ToastItemProps, 'toast'> & { toasts: UndoToast[] }) {
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-4 z-10 flex flex-col gap-2 md:left-auto md:w-96">
      {toasts.map(t => <ToastItem key={t.id} toast={t} onUndo={onUndo} onDismiss={onDismiss} onClose={onClose} />)}
    </div>
  );
}
