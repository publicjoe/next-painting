import type { Category, Model, Project } from '@/types';
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

/**
 * Turn a drop position into the arguments of MOVE_MODEL, with the same index
 * convention as above. A unit row is before or after that row; a project row
 * (in the sidebar) or a project's empty unit table is the end of that project.
 * Header and list targets (categories) are not unit drops.
 */
export function resolveUnitDrop(
  models: Model[],
  projects: Project[],
  activeId: string,
  over: { kind: DndKind; id: string },
  after: boolean
): { toProjectId: string; toIndexInProject: number } | null {
  const active = models.find(m => m.id === activeId);
  if (!active) return null;

  let toProjectId: string;
  let anchorId: string | null = null; // the unit the drop is relative to
  if (over.kind === 'unit') {
    const target = models.find(m => m.id === over.id);
    if (!target || target.id === active.id) return null;
    toProjectId = target.projectId;
    anchorId = target.id;
  } else if (over.kind === 'proj' || over.kind === 'ulist') {
    toProjectId = over.id; // end of that project
  } else {
    return null;
  }
  if (!projects.some(p => p.id === toProjectId)) return null;

  const rest = models.filter(m => m.projectId === toProjectId && m.id !== active.id);
  const toIndexInProject =
    anchorId === null ? rest.length : rest.findIndex(m => m.id === anchorId) + (after ? 1 : 0);

  if (toProjectId === active.projectId) {
    const current = models.filter(m => m.projectId === toProjectId).findIndex(m => m.id === active.id);
    if (current === toIndexInProject) return null;
  }
  return { toProjectId, toIndexInProject };
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
