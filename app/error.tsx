'use client';

import { useState } from 'react';
import { STORAGE_KEY } from '@/lib/migrate';
import { keepBackup } from '@/lib/backup';
import { downloadFile } from '@/lib/download';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// Route-level error boundary. Most likely cause here is stored data that the
// app cannot render, so offer a raw export before any reset.
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const exportRaw = () => {
    setExportMessage(null);
    let raw: string | null = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch { /* storage blocked */ }
    if (raw === null) {
      setExportMessage('There is no stored data to export.');
      return;
    }
    downloadFile(raw, `paintlog-raw-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const resetAndRetry = () => {
    setConfirmingReset(false);
    setExportMessage(null);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        // Never clear data that has no copy: export it first instead
        if (!keepBackup(raw)) {
          setExportMessage('A backup copy could not be written, so nothing was reset. Export the raw data first.');
          return;
        }
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* storage blocked: retry anyway */ }
    retry();
  };

  return (
    <>
    <div className="flex h-dvh items-center justify-center bg-zinc-900 p-8 text-zinc-100">
      <div className="max-w-md text-center">
        {/* Only the explanation is announced; the buttons are not part of the alert */}
        <div role="alert">
          <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
          <p className="mb-6 text-zinc-400">
            PaintLog hit an unexpected error. Your data has not been changed. You can try again, or
            export the raw stored data before resetting.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => retry()} className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
            Try again
          </button>
          <button type="button" onClick={exportRaw} className="rounded-lg bg-zinc-700 px-4 py-2 font-medium hover:bg-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
            Export raw data
          </button>
          <button type="button" onClick={() => setConfirmingReset(true)} className="rounded-lg bg-red-700 px-4 py-2 font-medium hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
            Reset data
          </button>
        </div>
        {exportMessage && <p role="alert" className="mt-4 text-sm text-amber-200">{exportMessage}</p>}
      </div>
    </div>
    {confirmingReset && (
      <ConfirmDialog
        title="Reset stored data?"
        description="This clears your stored PaintLog data. A raw copy is kept as a backup in browser storage."
        confirmLabel="Reset data"
        onConfirm={resetAndRetry}
        onCancel={() => setConfirmingReset(false)}
      />
    )}
    </>
  );
}
