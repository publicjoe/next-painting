import { useReducer, useEffect, useState, useCallback, useRef } from 'react';
import { initialState, reducer } from '@/lib/state';
import { isAppState } from '@/lib/validate';
import { migrate, STORAGE_KEY, STORAGE_VERSION } from '@/lib/migrate';
import { BACKUP_KEY, keepBackup } from '@/lib/backup';
import type { StoredState } from '@/lib/migrate';
import type { AppState } from '@/types';

export { BACKUP_KEY };
/** Quiet period after the last edit before the state is written. */
export const SAVE_DEBOUNCE_MS = 300;

export function usePaintingLog() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Storage key holding a raw copy of unreadable data; null when none could be kept
  const [backupKey, setBackupKey] = useState<string | null>(null);
  // 'failed': a backup was attempted and could not be written. 'none': storage
  // could not be read, so no backup was attempted and the data may still be there.
  const [backupFailed, setBackupFailed] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // True when another tab's write replaced edits this tab had not yet saved
  const [externalReplaced, setExternalReplaced] = useState(false);
  // Latest state waiting for its debounced write (null when nothing is pending)
  const pendingRef = useRef<AppState | null>(null);
  // State that arrived from another tab: already in storage, so never re-saved
  const externalRef = useRef<AppState | null>(null);
  // False until the first write succeeds in this session; that one is immediate
  const hasSavedRef = useRef(false);

  // HYDRATION: why we load localStorage in an effect and not in the reducer's
  // initialiser (as the Vite original did).
  // Next.js renders this component on the server first, where `localStorage`
  // does not exist, then "hydrates" it in the browser. React requires the first
  // browser render to match the server HTML exactly. If we read localStorage
  // during that first render, the browser would produce different markup
  // (saved categories vs. an empty list) and React would report a hydration
  // mismatch. Effects only run in the browser, after hydration, so we start
  // from the neutral `initialState` and swap in the saved data here.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        let migrated = null;
        try {
          migrated = migrate(JSON.parse(stored));
        } catch {
          // JSON.parse failure: handled below like a validation failure
        }
        if (migrated) {
          dispatch({ type: 'REPLACE_STATE', payload: migrated });
        } else {
          // Unreadable: keep a copy of the raw string and do NOT let the
          // persist effect overwrite it until the user chooses to start fresh.
          const kept = keepBackup(stored);
          if (kept) console.error('Stored state is unreadable; raw copy kept under', kept);
          else console.error('Stored state is unreadable and no backup could be written');
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setBackupKey(kept);
          setBackupFailed(kept === null);
          setLoadError(
            kept
              ? `Your saved data could not be read. A raw copy was kept in browser storage as "${kept}".`
              : 'Your saved data could not be read, and a backup copy could not be written. Export it from the browser developer tools before starting fresh.',
          );
        }
      }
    } catch (e) {
      console.error('Failed to read state from local storage', e);
      setLoadError('Browser storage could not be read, so saving is paused.');
    }
    // Intentional setState-in-effect: this is a one-off sync from an external
    // system (localStorage) that only exists after mount, which is the case the
    // rule's own docs allow for.
    setIsLoaded(true);
  }, []);

  // Write the pending state now, synchronously. Used by the debounce timer,
  // `pagehide` and unmount, so a flush can never be skipped by a pending timer.
  const flush = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    try {
      const payload: StoredState = { version: STORAGE_VERSION, state: pending };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      hasSavedRef.current = true;
      setSaveError(false);
    } catch (e) {
      console.error('Failed to save state to local storage', e);
      setSaveError(true);
    }
  }, []);

  // Persist on change, but ONLY once the load above has finished (otherwise the
  // empty initial state would overwrite saved data before it was read) and
  // never while a load error is unresolved. Edits are debounced; the first
  // write of a session (e.g. upgrading legacy data to v1) is immediate.
  useEffect(() => {
    if (!isLoaded || loadError) return;
    // Echo guard: this state came from another tab and is already stored
    if (state === externalRef.current) return;
    pendingRef.current = state;
    if (!hasSavedRef.current) {
      flush();
      return;
    }
    const timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    // A newer state reschedules; the pending value is replaced, never lost
    return () => clearTimeout(timer);
  }, [state, isLoaded, loadError, flush]);

  // Flush on the way out so the last edits survive closing the tab (`pagehide`
  // also covers bfcache; `visibilitychange` to hidden is the more reliable
  // signal on mobile Safari) or unmounting.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, [flush]);

  // Multi-tab: the `storage` event fires only in OTHER tabs. Adopt a valid
  // external write; ignore anything invalid so a bad write cannot clobber us.
  useEffect(() => {
    if (!isLoaded || loadError) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue === null) return;
      if (e.storageArea && e.storageArea !== localStorage) return;
      let incoming: AppState | null = null;
      try {
        const candidate = migrate(JSON.parse(e.newValue));
        if (isAppState(candidate)) incoming = candidate;
      } catch {
        // invalid JSON: ignored
      }
      if (!incoming) return;
      externalRef.current = incoming;
      // The other tab's write wins over our unsaved edits; say so if any were lost
      if (pendingRef.current) setExternalReplaced(true);
      pendingRef.current = null;
      dispatch({ type: 'REPLACE_STATE', payload: incoming });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [isLoaded, loadError]);

  const dismissExternalNotice = useCallback(() => setExternalReplaced(false), []);

  /** Dismiss a load error and resume saving (the raw backup is kept). */
  const startFresh = useCallback(() => {
    dispatch({ type: 'REPLACE_STATE', payload: initialState });
    setLoadError(null);
    setBackupKey(null);
    setBackupFailed(false);
    setExternalReplaced(false);
  }, []);

  return { state, dispatch, isLoaded, loadError, backupKey, backupFailed, saveError, externalReplaced, dismissExternalNotice, startFresh };
}
