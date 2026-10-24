import type { AppState } from '@/types';
import { isAppState } from '@/lib/validate';

export const STORAGE_KEY = 'painting-log-state';
export const STORAGE_VERSION = 1;

export interface StoredState {
  version: typeof STORAGE_VERSION;
  state: AppState;
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
    if (env.version === 1 && isAppState(env.state)) return env.state;
    return null;
  }
  return isAppState(raw) ? raw : null;
}
