import type { AppState } from '@/types';
import { isAppState, MAX_MODEL_COUNT, MAX_NAME_LENGTH } from '@/lib/validate';

export const STORAGE_KEY = 'painting-log-state';
export const STORAGE_VERSION = 1;

export interface StoredState {
  version: typeof STORAGE_VERSION;
  state: AppState;
}

export interface MigrateResult {
  state: AppState;
  /** True when a count was lowered to the cap or a name shortened to fit. */
  adjusted: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Brings data saved before the limits existed inside them, instead of failing
 * validation: whole-number counts above MAX_MODEL_COUNT are lowered to it, and
 * names longer than MAX_NAME_LENGTH are shortened. Anything else is left for
 * isAppState to judge.
 */
function fitLimits(state: unknown): { state: unknown; adjusted: boolean } {
  if (!isRecord(state)) return { state, adjusted: false };
  let adjusted = false;
  const fix = (items: unknown, isModel: boolean) =>
    Array.isArray(items)
      ? items.map(item => {
          if (!isRecord(item)) return item;
          let next = item;
          if (typeof item.name === 'string' && item.name.length > MAX_NAME_LENGTH) {
            next = { ...next, name: item.name.slice(0, MAX_NAME_LENGTH) };
            adjusted = true;
          }
          if (isModel && typeof item.count === 'number' && Number.isInteger(item.count) && item.count > MAX_MODEL_COUNT) {
            next = { ...next, count: MAX_MODEL_COUNT };
            adjusted = true;
          }
          return next;
        })
      : items;
  const fitted = {
    ...state,
    categories: fix(state.categories, false),
    projects: fix(state.projects, false),
    models: fix(state.models, true),
  };
  return { state: fitted, adjusted };
}

/**
 * Keeps only the known fields of each item, so unknown properties are never persisted.
 * The catch: data written by a newer app that added fields without bumping
 * STORAGE_VERSION would lose them on this app's next save. Any schema change
 * must therefore bump STORAGE_VERSION, which makes older code refuse the data
 * (see README, "Data format and versioning").
 */
function strip(s: AppState): AppState {
  return {
    categories: s.categories.map(c => ({ id: c.id, name: c.name })),
    projects: s.projects.map(p => ({ id: p.id, categoryId: p.categoryId, name: p.name })),
    models: s.models.map(m => ({
      id: m.id, projectId: m.projectId, name: m.name, count: m.count,
      built: m.built, primed: m.primed, painted: m.painted, based: m.based,
    })),
  };
}

/**
 * Turns whatever was parsed from storage into a valid AppState, or null if it
 * is unreadable, and reports whether any value had to be adjusted to fit the
 * limits. Accepts the legacy unversioned shape (a plain AppState) and the v1
 * envelope `{ version: 1, state }`. Unknown versions are rejected so a newer
 * app's data is never misread. The result is validated and carries only known
 * fields, so callers need not check it again.
 */
export function migrateWithReport(raw: unknown): MigrateResult | null {
  let candidate: unknown = raw;
  if (isRecord(raw) && 'version' in raw) {
    if (raw.version !== 1) return null;
    candidate = raw.state;
  }
  const { state, adjusted } = fitLimits(candidate);
  return isAppState(state) ? { state: strip(state), adjusted } : null;
}

/** As `migrateWithReport`, for callers that do not need to know about adjustments. */
export function migrate(raw: unknown): AppState | null {
  return migrateWithReport(raw)?.state ?? null;
}
