import type { AppState } from '@/types';
import { isAppState, MAX_MODEL_COUNT } from '@/lib/validate';

export const STORAGE_KEY = 'painting-log-state';
export const STORAGE_VERSION = 1;

export interface StoredState {
  version: typeof STORAGE_VERSION;
  state: AppState;
}

/**
 * Counts above MAX_MODEL_COUNT (allowed before the cap existed) are lowered to
 * it, so older data and imports stay readable instead of failing validation.
 */
function clampCounts(state: unknown): unknown {
  if (typeof state !== 'object' || state === null || !Array.isArray((state as { models?: unknown }).models)) return state;
  const s = state as { models: unknown[] };
  return {
    ...s,
    models: s.models.map(m =>
      typeof m === 'object' && m !== null && Number.isInteger((m as { count?: unknown }).count) && (m as { count: number }).count > MAX_MODEL_COUNT
        ? { ...m, count: MAX_MODEL_COUNT }
        : m,
    ),
  };
}

/**
 * Turns whatever was parsed from storage into a valid AppState, or null if it
 * is unreadable. Accepts the legacy unversioned shape (a plain AppState) and
 * the v1 envelope `{ version: 1, state }`. Unknown versions are rejected so a
 * newer app's data is never misread.
 */
export function migrate(raw: unknown): AppState | null {
  if (typeof raw === 'object' && raw !== null && 'version' in raw) {
    const env = raw as { version: unknown; state?: unknown };
    const state = clampCounts(env.state);
    if (env.version === 1 && isAppState(state)) return state;
    return null;
  }
  const state = clampCounts(raw);
  return isAppState(state) ? state : null;
}
