// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { BACKUP_KEY, SAVE_DEBOUNCE_MS, usePaintingLog } from './usePaintingLog';
import { STORAGE_KEY } from '@/lib/migrate';
import { seeded } from '@/lib/test-fixtures';

let store: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = new Map();
  setItem = vi.fn((k: string, v: string) => { store.set(k, v); });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem,
    removeItem: (k: string) => { store.delete(k); },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('usePaintingLog', () => {
  it('starts empty and writes a v1 envelope when nothing is stored', async () => {
    const { result } = renderHook(() => usePaintingLog());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.loadError).toBeNull();
    expect(JSON.parse(store.get(STORAGE_KEY)!)).toEqual({
      version: 1,
      state: { categories: [], projects: [], models: [] },
    });
  });

  it('loads a v1 envelope', async () => {
    store.set(STORAGE_KEY, JSON.stringify({ version: 1, state: seeded }));
    const { result } = renderHook(() => usePaintingLog());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.state).toEqual(seeded);
  });

  it('loads legacy data and re-saves it as v1', async () => {
    store.set(STORAGE_KEY, JSON.stringify(seeded));
    const { result } = renderHook(() => usePaintingLog());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.state).toEqual(seeded);
    expect(JSON.parse(store.get(STORAGE_KEY)!)).toEqual({ version: 1, state: seeded });
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['failed validation', JSON.stringify({ version: 1, state: { categories: [], projects: [], models: [null] } })],
  ])('backs up and does not overwrite %s', async (_n, raw) => {
    store.set(STORAGE_KEY, raw);
    const { result } = renderHook(() => usePaintingLog());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.loadError).toEqual(expect.any(String));
    expect(store.get(BACKUP_KEY)).toBe(raw);
    expect(store.get(STORAGE_KEY)).toBe(raw);

    // Changes while the error is unresolved are not persisted
    act(() => result.current.dispatch({ type: 'ADD_CATEGORY', payload: { id: 'x', name: 'X' } }));
    expect(store.get(STORAGE_KEY)).toBe(raw);
  });

  it('never overwrites an earlier backup', async () => {
    store.set(BACKUP_KEY, 'older copy');
    store.set(STORAGE_KEY, '{bad');
    const { result } = renderHook(() => usePaintingLog());
    await waitFor(() => expect(result.current.backupKey).toBe(`${BACKUP_KEY}.2`));
    expect(store.get(BACKUP_KEY)).toBe('older copy');
    expect(store.get(`${BACKUP_KEY}.2`)).toBe('{bad');
    expect(result.current.loadError).toContain(`${BACKUP_KEY}.2`);
  });

  it('says so when the backup cannot be written', async () => {
    store.set(STORAGE_KEY, '{bad');
    setItem.mockImplementation(() => { throw new Error('QuotaExceededError'); });
    const { result } = renderHook(() => usePaintingLog());
    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.backupKey).toBeNull();
    expect(result.current.loadError).toContain('backup copy could not be written');
    expect(result.current.loadError).not.toContain('was kept');
    expect(store.get(STORAGE_KEY)).toBe('{bad');
  });

  it('reports no backup attempt when storage cannot be read', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem,
      removeItem: () => {},
    });
    const { result } = renderHook(() => usePaintingLog());
    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.backupKey).toBeNull();
    expect(result.current.backupFailed).toBe(false);
  });

  it('reports a failed backup when all slots hold different data', async () => {
    store.set(STORAGE_KEY, '{bad');
    store.set(BACKUP_KEY, 'x1');
    for (let n = 2; n <= 20; n++) store.set(`${BACKUP_KEY}.${n}`, `x${n}`);
    const { result } = renderHook(() => usePaintingLog());
    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.backupKey).toBeNull();
    expect(result.current.backupFailed).toBe(true);
  });

  it('startFresh clears the error and resumes saving', async () => {
    store.set(STORAGE_KEY, '{bad');
    const { result } = renderHook(() => usePaintingLog());
    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    act(() => result.current.startFresh());
    await waitFor(() => expect(result.current.loadError).toBeNull());
    expect(JSON.parse(store.get(STORAGE_KEY)!).version).toBe(1);
    expect(store.get(BACKUP_KEY)).toBe('{bad');
  });

  it('flags saveError when setItem throws, and clears it on recovery', async () => {
    const { result } = renderHook(() => usePaintingLog());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    setItem.mockImplementation(() => { throw new Error('QuotaExceededError'); });
    act(() => result.current.dispatch({ type: 'ADD_CATEGORY', payload: { id: 'a', name: 'A' } }));
    await waitFor(() => expect(result.current.saveError).toBe(true));
    setItem.mockImplementation((k: string, v: string) => { store.set(k, v); });
    act(() => result.current.dispatch({ type: 'ADD_CATEGORY', payload: { id: 'b', name: 'B' } }));
    await waitFor(() => expect(result.current.saveError).toBe(false));
  });
});

describe('usePaintingLog debounced persistence', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const add = (result: { current: ReturnType<typeof usePaintingLog> }, id: string) =>
    act(() => result.current.dispatch({ type: 'ADD_CATEGORY', payload: { id, name: id } }));
  const stored = () => JSON.parse(store.get(STORAGE_KEY)!).state;

  it('coalesces rapid edits into one write after the quiet period', () => {
    const { result } = renderHook(() => usePaintingLog());
    expect(result.current.isLoaded).toBe(true); // first write is immediate
    setItem.mockClear();

    add(result, 'a');
    act(() => { vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1); });
    add(result, 'b'); // resets the timer
    act(() => { vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1); });
    expect(setItem).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(stored().categories.map((c: { id: string }) => c.id)).toEqual(['a', 'b']);
  });

  it('flushes a pending write synchronously on pagehide', () => {
    const { result } = renderHook(() => usePaintingLog());
    add(result, 'a');
    expect(stored().categories).toEqual([]);
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(stored().categories).toEqual([{ id: 'a', name: 'a' }]);
    // the timer finds nothing left to do
    setItem.mockClear();
    act(() => { vi.advanceTimersByTime(SAVE_DEBOUNCE_MS); });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('flushes a pending write on unmount', () => {
    const { result, unmount } = renderHook(() => usePaintingLog());
    add(result, 'a');
    expect(stored().categories).toEqual([]);
    unmount();
    expect(stored().categories).toEqual([{ id: 'a', name: 'a' }]);
  });

  it('keeps saveError behaviour for debounced and flushed writes', () => {
    const { result } = renderHook(() => usePaintingLog());
    setItem.mockImplementation(() => { throw new Error('QuotaExceededError'); });
    add(result, 'a');
    act(() => { vi.advanceTimersByTime(SAVE_DEBOUNCE_MS); });
    expect(result.current.saveError).toBe(true);
    setItem.mockImplementation((k: string, v: string) => { store.set(k, v); });
    add(result, 'b');
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(result.current.saveError).toBe(false);
    expect(stored().categories).toHaveLength(2);
  });
});

describe('usePaintingLog multi-tab sync', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const fire = (key: string | null, newValue: string | null) =>
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key, newValue })); });

  it('adopts a valid write from another tab without echoing it back', () => {
    const { result } = renderHook(() => usePaintingLog());
    setItem.mockClear();
    fire(STORAGE_KEY, JSON.stringify({ version: 1, state: seeded }));
    expect(result.current.state).toEqual(seeded);
    act(() => { vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2); });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('accepts legacy unversioned data from another tab', () => {
    const { result } = renderHook(() => usePaintingLog());
    fire(STORAGE_KEY, JSON.stringify(seeded));
    expect(result.current.state).toEqual(seeded);
  });

  it('saves local edits made after an external update', () => {
    const { result } = renderHook(() => usePaintingLog());
    fire(STORAGE_KEY, JSON.stringify({ version: 1, state: seeded }));
    setItem.mockClear();
    act(() => result.current.dispatch({ type: 'ADD_CATEGORY', payload: { id: 'z', name: 'Z' } }));
    act(() => { vi.advanceTimersByTime(SAVE_DEBOUNCE_MS); });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get(STORAGE_KEY)!).state.categories).toHaveLength(3);
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['failed validation', JSON.stringify({ version: 1, state: { categories: [], projects: [], models: [null] } })],
    ['an unknown version', JSON.stringify({ version: 99, state: seeded })],
    ['a cleared key', null],
  ])('ignores %s', (_n, value) => {
    store.set(STORAGE_KEY, JSON.stringify({ version: 1, state: seeded }));
    const { result } = renderHook(() => usePaintingLog());
    fire(STORAGE_KEY, value);
    expect(result.current.state).toEqual(seeded);
  });

  it('ignores other keys', () => {
    const { result } = renderHook(() => usePaintingLog());
    fire('something-else', JSON.stringify({ version: 1, state: seeded }));
    expect(result.current.state.categories).toEqual([]);
  });

  it('drops an unsaved local edit when another tab writes first', () => {
    const { result } = renderHook(() => usePaintingLog());
    act(() => result.current.dispatch({ type: 'ADD_CATEGORY', payload: { id: 'z', name: 'Z' } }));
    fire(STORAGE_KEY, JSON.stringify({ version: 1, state: seeded }));
    setItem.mockClear();
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    act(() => { vi.advanceTimersByTime(SAVE_DEBOUNCE_MS); });
    expect(setItem).not.toHaveBeenCalled();
    expect(result.current.state).toEqual(seeded);
  });
});
