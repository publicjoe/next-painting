import { useEffect, useId, useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Modal confirmation on the native <dialog>. The parent mounts it only while a
// question is open. showModal() gives the platform's focus trap, inert
// background and Escape handling; we add the parts it does not guarantee
// everywhere: initial focus on the safe button and focus return to the trigger.
export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descId}
      // Escape fires `cancel`; keep the dialog open until the parent unmounts it
      onCancel={(e) => { e.preventDefault(); onCancel(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-zinc-700 bg-zinc-800 p-6 text-zinc-100 shadow-xl backdrop:bg-black/60"
    >
      <h2 id={titleId} className="mb-2 text-lg font-semibold">{title}</h2>
      <p id={descId} className="mb-6 text-sm text-zinc-300">{description}</p>
      <div className="flex justify-end gap-3">
        <button type="button" ref={cancelRef} onClick={onCancel} className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-600">
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600">
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
