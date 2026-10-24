import { useEffect, useState } from 'react';

export interface UndoToast {
  id: string;
  message: string;
}

/** How long a toast stays before it dismisses itself. */
export const TOAST_MS = 8000;

interface ToastItemProps {
  toast: UndoToast;
  onUndo: (id: string) => void;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onUndo, onDismiss }: ToastItemProps) {
  // Hover or keyboard focus pauses the countdown; leaving restarts it in full
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [paused, toast.id, onDismiss]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="flex items-center gap-4 rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 shadow-lg"
    >
      <span className="flex-1">{toast.message}</span>
      <button type="button" onClick={() => onUndo(toast.id)} className="rounded bg-zinc-700 px-3 py-1 font-medium hover:bg-zinc-600">
        Undo
      </button>
    </div>
  );
}

// The live region is always mounted: screen readers only announce changes to a
// region that already exists, so it must not appear together with its content.
export function UndoToasts({ toasts, onUndo, onDismiss }: Omit<ToastItemProps, 'toast'> & { toasts: UndoToast[] }) {
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-4 z-10 flex flex-col gap-2 md:left-auto md:w-96">
      {toasts.map(t => <ToastItem key={t.id} toast={t} onUndo={onUndo} onDismiss={onDismiss} />)}
    </div>
  );
}
