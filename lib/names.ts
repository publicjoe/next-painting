import type { AppState, Category, Project } from '@/types';

/**
 * The naming rules: no two categories share a name, and no two projects in one
 * category do (the same project name in different categories is fine). Names
 * are compared ignoring case, surrounding spaces and Unicode composition, so
 * "Cafe" with a combining accent matches the composed form. The buttons are
 * labelled by name, so two identical ones would be ambiguous.
 *
 * Pure functions with no lookups keyed by id or name (Maps and Sets only), so
 * a name or id such as '__proto__' is harmless. Stored data that already holds
 * duplicates must keep loading, so none of this is part of validation: only an
 * add, a rename, a move, an undo or an import is checked, and only for the item
 * being changed.
 */

/** The form two names are compared in. */
export const canonicalName = (name: string): string => name.trim().normalize('NFC').toLowerCase();

export const sameName = (a: string, b: string): boolean => canonicalName(a) === canonicalName(b);

/** The category already using `name`, ignoring the category `exceptId` (the one being renamed). */
export function findCategoryClash(categories: Category[], name: string, exceptId?: string): Category | undefined {
  const wanted = canonicalName(name);
  return categories.find(c => c.id !== exceptId && canonicalName(c.name) === wanted);
}

/** The project in `categoryId` already using `name`, ignoring the project `exceptId` (the one being renamed or moved). */
export function findProjectClash(projects: Project[], categoryId: string, name: string, exceptId?: string): Project | undefined {
  const wanted = canonicalName(name);
  return projects.find(p => p.categoryId === categoryId && p.id !== exceptId && canonicalName(p.name) === wanted);
}

/**
 * The category already using `name`, for renaming `current` to it, or undefined. A name
 * that compares equal to the category's own current name (a case or spacing change)
 * is always allowed, even where stored data already holds a namesake. The forms and
 * the reducer both use this, so they agree.
 */
export function findCategoryRenameClash(categories: Category[], current: Category, name: string): Category | undefined {
  if (sameName(current.name, name)) return undefined;
  return findCategoryClash(categories, name, current.id);
}

/**
 * The project already using the name in the target category when `current` is renamed
 * to `name` (and moved to `categoryId`, when given), or undefined. Allowed without a
 * check when neither the compared name nor the category changes, even where stored
 * data already holds a namesake.
 */
export function findProjectRenameClash(projects: Project[], current: Project, name: string, categoryId: string = current.categoryId): Project | undefined {
  if (sameName(current.name, name) && current.categoryId === categoryId) return undefined;
  return findProjectClash(projects, categoryId, name, current.id);
}

/**
 * The project that would share a name with `projectId` if it moved to
 * `toCategoryId`. Staying in its own category is never a clash (that is a
 * reorder), and an unknown project clashes with nothing.
 */
export function findMoveClash(projects: Project[], projectId: string, toCategoryId: string): Project | undefined {
  const project = projects.find(p => p.id === projectId);
  if (!project || project.categoryId === toCategoryId) return undefined;
  return findProjectClash(projects, toCategoryId, project.name, project.id);
}

// Messages, shared by the forms, the Move menu, the drag announcer and the undo and import checks

export const categoryClashMessage = (name: string): string =>
  `A category named "${name.trim()}" already exists.`;

export const projectClashMessage = (name: string, categoryName: string): string =>
  `A project named "${name.trim()}" already exists in category "${categoryName}".`;

/** Why a move is refused. Names the project, the category and the project it would clash with. */
export const moveClashMessage = (project: Project, categoryName: string, clash: Project): string =>
  `"${project.name}" was not moved to category "${categoryName}": it already has a project named "${clash.name}".`;

/** What a refused rename says; the typed name is kept in the field so it can be fixed. */
const renameRefused = (clash: string, currentName: string): string =>
  `${clash.replace(/\.$/, '')}, so "${currentName}" was not renamed. Edit the name or press Escape.`;

export const categoryRenameRefusedMessage = (name: string, currentName: string): string =>
  renameRefused(categoryClashMessage(name), currentName);

export const projectRenameRefusedMessage = (name: string, categoryName: string, currentName: string): string =>
  renameRefused(projectClashMessage(name, categoryName), currentName);

const nameOfCategory = (categories: Category[], id: string): string => categories.find(c => c.id === id)?.name ?? 'unknown';

/**
 * Whether an import file breaks the rules, as a message naming the first clash,
 * or null. Separate from isAppState on purpose: stored data with duplicates
 * must still load. Run on the migrated state (names already shortened to the
 * limit, which can itself make two long names equal). Linear, with a Set per
 * category, because a file can hold thousands of items.
 */
export function findImportNameClash(state: Pick<AppState, 'categories' | 'projects'>): string | null {
  const seenCategories = new Map<string, string>();
  for (const c of state.categories) {
    const key = canonicalName(c.name);
    const first = seenCategories.get(key);
    if (first !== undefined) {
      return first === c.name
        ? `Could not import: two categories are named "${c.name}".`
        : `Could not import: the categories "${first}" and "${c.name}" have the same name.`;
    }
    seenCategories.set(key, c.name);
  }
  const seenProjects = new Map<string, Map<string, string>>();
  for (const p of state.projects) {
    let inCategory = seenProjects.get(p.categoryId);
    if (!inCategory) {
      inCategory = new Map();
      seenProjects.set(p.categoryId, inCategory);
    }
    const key = canonicalName(p.name);
    const first = inCategory.get(key);
    if (first !== undefined) {
      const where = nameOfCategory(state.categories, p.categoryId);
      return first === p.name
        ? `Could not import: two projects in category "${where}" are named "${p.name}".`
        : `Could not import: the projects "${first}" and "${p.name}" in category "${where}" have the same name.`;
    }
    inCategory.set(key, p.name);
  }
  return null;
}

/** The part of a delete's removed items that undo has to check. */
export interface RestoreCandidates {
  categories: { item: Category }[];
  projects: { item: Project }[];
}

/**
 * The first item whose undo would recreate a clash, as a message, or null.
 * Checked against what is in `state` now (not against the other items being
 * restored with it, which already lived together), skipping items whose id is
 * already present because the restore skips those too. The reducer applies the
 * same test per item.
 */
export function findRestoreClash(state: Pick<AppState, 'categories' | 'projects'>, removed: RestoreCandidates): string | null {
  const categoryIds = new Set(state.categories.map(c => c.id));
  const projectIds = new Set(state.projects.map(p => p.id));
  for (const { item } of removed.categories) {
    if (categoryIds.has(item.id)) continue;
    if (findCategoryClash(state.categories, item.name)) return categoryClashMessage(item.name);
  }
  for (const { item } of removed.projects) {
    if (projectIds.has(item.id)) continue;
    if (findProjectClash(state.projects, item.categoryId, item.name)) {
      const where = nameOfCategory([...state.categories, ...removed.categories.map(r => r.item)], item.categoryId);
      return projectClashMessage(item.name, where);
    }
  }
  return null;
}
