import type { AppState } from '@/types';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStr = (v: unknown): v is string => typeof v === 'string';

// '__proto__' is rejected as an id: it is never generated (ids are UUIDs) and
// only ever appears in hand-edited or hostile files.
const isId = (v: unknown): v is string => isStr(v) && v !== '__proto__';

// Collects ids and fails on a non-string/forbidden id or a duplicate.
function uniqueIds(items: Record<string, unknown>[]): Set<string> | null {
  const ids = new Set<string>();
  for (const item of items) {
    if (!isId(item.id) || ids.has(item.id)) return null;
    ids.add(item.id);
  }
  return ids;
}

/** Strict structural + referential check of every item in an AppState. */
export function isAppState(value: unknown): value is AppState {
  if (!isRecord(value)) return false;
  const { categories, projects, models } = value;
  if (!Array.isArray(categories) || !Array.isArray(projects) || !Array.isArray(models)) return false;

  if (!categories.every(c => isRecord(c) && isStr(c.name))) return false;
  if (!projects.every(p => isRecord(p) && isStr(p.name) && isStr(p.categoryId))) return false;
  if (!models.every(m =>
    isRecord(m) &&
    isStr(m.name) &&
    isStr(m.projectId) &&
    typeof m.count === 'number' && Number.isInteger(m.count) && m.count >= 1 &&
    typeof m.built === 'boolean' &&
    typeof m.primed === 'boolean' &&
    typeof m.painted === 'boolean' &&
    typeof m.based === 'boolean'
  )) return false;

  const categoryIds = uniqueIds(categories as Record<string, unknown>[]);
  const projectIds = uniqueIds(projects as Record<string, unknown>[]);
  const modelIds = uniqueIds(models as Record<string, unknown>[]);
  if (!categoryIds || !projectIds || !modelIds) return false;

  // Orphans: every project needs a category, every model a project
  if (!(projects as { categoryId: string }[]).every(p => categoryIds.has(p.categoryId))) return false;
  if (!(models as { projectId: string }[]).every(m => projectIds.has(m.projectId))) return false;
  return true;
}
