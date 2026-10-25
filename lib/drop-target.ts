import type { Category, Project } from '@/types';
import type { DndKind } from './dnd-ids';

/**
 * Turn a drop position into the arguments of the MOVE_PROJECT / MOVE_CATEGORY
 * actions. Indexes follow the reducer's convention: they count positions after
 * the dragged item has been removed. No lookups keyed by id, so ids such as
 * '__proto__' are harmless.
 */
export function resolveProjectDrop(
  projects: Project[],
  activeId: string,
  over: { kind: DndKind; id: string },
  after: boolean
): { toCategoryId: string; toIndexInCategory: number } | null {
  const active = projects.find(p => p.id === activeId);
  if (!active) return null;

  let toCategoryId: string;
  let anchorId: string | null = null; // the project the drop is relative to
  if (over.kind === 'proj') {
    const target = projects.find(p => p.id === over.id);
    if (!target || target.id === active.id) return null;
    toCategoryId = target.categoryId;
    anchorId = target.id;
  } else if (over.kind === 'hdr' || over.kind === 'list') {
    toCategoryId = over.id; // end of that category
  } else {
    return null;
  }

  const rest = projects.filter(p => p.categoryId === toCategoryId && p.id !== active.id);
  const toIndexInCategory =
    anchorId === null ? rest.length : rest.findIndex(p => p.id === anchorId) + (after ? 1 : 0);

  if (toCategoryId === active.categoryId) {
    const current = projects.filter(p => p.categoryId === toCategoryId).findIndex(p => p.id === active.id);
    if (current === toIndexInCategory) return null;
  }
  return { toCategoryId, toIndexInCategory };
}

/** Post-removal index for MOVE_CATEGORY, or null when nothing would change or an id is missing. */
export function resolveCategoryDrop(
  categories: Category[],
  activeId: string,
  overId: string,
  after: boolean
): number | null {
  const from = categories.findIndex(c => c.id === activeId);
  if (from === -1 || activeId === overId) return null;
  const rest = categories.filter(c => c.id !== activeId);
  const anchor = rest.findIndex(c => c.id === overId);
  if (anchor === -1) return null;
  const to = anchor + (after ? 1 : 0);
  return to === from ? null : to;
}
