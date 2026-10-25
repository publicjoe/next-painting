import type { AppState, Category, Project, Model, StatusField } from '@/types';

/** An item removed by a delete, with the array position it held. */
export interface Removed<T> { item: T; index: number }

/** Everything a delete removed: enough for RESTORE_ITEMS to undo it. */
export interface RemovedItems {
  categories: Removed<Category>[];
  projects: Removed<Project>[];
  models: Removed<Model>[];
}

export type Action =
  | { type: 'REPLACE_STATE'; payload: AppState }
  | { type: 'ADD_CATEGORY'; payload: Category }
  | { type: 'UPDATE_CATEGORY'; payload: Category }
  | { type: 'DELETE_CATEGORY'; payload: string } // categoryId
  | { type: 'ADD_PROJECT'; payload: Project }
  | { type: 'UPDATE_PROJECT'; payload: Project }
  | { type: 'DELETE_PROJECT'; payload: string } // projectId
  | { type: 'ADD_MODEL'; payload: Model }
  | { type: 'UPDATE_MODEL'; payload: Model }
  | { type: 'DELETE_MODEL'; payload: string } // modelId
  | { type: 'TOGGLE_MODEL_STATUS'; payload: { id: string; field: StatusField } }
  // Positions are counted after the moved item has been removed from its list
  | { type: 'MOVE_CATEGORY'; payload: { id: string; toIndex: number } }
  | { type: 'MOVE_PROJECT'; payload: { id: string; toCategoryId: string; toIndexInCategory: number } }
  | { type: 'MOVE_MODEL'; payload: { id: string; toProjectId: string; toIndexInProject: number } }
  | { type: 'RESTORE_ITEMS'; payload: RemovedItems }; // undo of a delete

export const initialState: AppState = {
  categories: [],
  projects: [],
  models: []
};

const withIndex = <T>(list: T[], keep: (item: T) => boolean): Removed<T>[] =>
  list.flatMap((item, index) => (keep(item) ? [{ item, index }] : []));

/**
 * What DELETE_CATEGORY / DELETE_PROJECT / DELETE_MODEL would remove from
 * `state`, with original positions. Call it before dispatching the delete.
 */
export function removedBy(state: AppState, kind: 'category' | 'project' | 'model', id: string): RemovedItems {
  if (kind === 'model') return { categories: [], projects: [], models: withIndex(state.models, m => m.id === id) };
  const projectIds = new Set(
    state.projects.filter(p => (kind === 'category' ? p.categoryId === id : p.id === id)).map(p => p.id)
  );
  return {
    categories: kind === 'category' ? withIndex(state.categories, c => c.id === id) : [],
    projects: withIndex(state.projects, p => projectIds.has(p.id)),
    models: withIndex(state.models, m => projectIds.has(m.projectId)),
  };
}

// Re-insert at original positions, ascending, so the original order comes
// back. Items already present (same id) are skipped; `accept` drops orphans.
function reinsert<T extends { id: string }>(list: T[], removed: Removed<T>[], accept: (item: T) => boolean): T[] {
  const next = [...list];
  const ids = new Set(list.map(i => i.id));
  for (const { item, index } of [...removed].sort((a, b) => a.index - b.index)) {
    if (ids.has(item.id) || !accept(item)) continue;
    next.splice(Math.min(index, next.length), 0, item);
    ids.add(item.id);
  }
  return next;
}

// A raw index is never passed to splice: non-integers (including NaN) mean
// "the end", and everything else is clamped into 0..length.
const clampIndex = (index: number, length: number): number =>
  Number.isInteger(index) ? Math.min(Math.max(index, 0), length) : length;

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'REPLACE_STATE':
      return action.payload;

    // Categories
    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload] };
    case 'UPDATE_CATEGORY':
      return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c) };
    case 'DELETE_CATEGORY':
      return {
        ...state,
        categories: state.categories.filter(c => c.id !== action.payload),
        projects: state.projects.filter(p => p.categoryId !== action.payload),
        // cascade: drop models belonging to projects in this category
        models: state.models.filter(m => {
          const project = state.projects.find(p => p.id === m.projectId);
          return project?.categoryId !== action.payload;
        })
      };

    case 'MOVE_CATEGORY': {
      const from = state.categories.findIndex(c => c.id === action.payload.id);
      if (from === -1) return state;
      const moved = state.categories[from];
      const rest = state.categories.filter((_, i) => i !== from);
      const to = clampIndex(action.payload.toIndex, rest.length);
      if (to === from) return state;
      return { ...state, categories: [...rest.slice(0, to), moved, ...rest.slice(to)] };
    }

    // Projects
    case 'ADD_PROJECT':
      return { ...state, projects: [...state.projects, action.payload] };
    case 'UPDATE_PROJECT':
      return { ...state, projects: state.projects.map(p => p.id === action.payload.id ? action.payload : p) };
    case 'DELETE_PROJECT':
      return {
        ...state,
        projects: state.projects.filter(p => p.id !== action.payload),
        models: state.models.filter(m => m.projectId !== action.payload),
      };

    case 'MOVE_PROJECT': {
      const { id, toCategoryId, toIndexInCategory } = action.payload;
      const project = state.projects.find(p => p.id === id);
      if (!project || !state.categories.some(c => c.id === toCategoryId)) return state;
      const rest = state.projects.filter(p => p.id !== id);
      // Flat positions of the target category's projects, in order
      const slots = rest.flatMap((p, i) => (p.categoryId === toCategoryId ? [i] : []));
      const at = clampIndex(toIndexInCategory, slots.length);
      // Same category and same place among its projects: nothing to do
      if (project.categoryId === toCategoryId) {
        const current = state.projects.filter(p => p.categoryId === toCategoryId).findIndex(p => p.id === id);
        if (current === at) return state;
      }
      const moved = project.categoryId === toCategoryId ? project : { ...project, categoryId: toCategoryId };
      // Before the project now at that position; after the last one at the end;
      // at the end of the array when the category is empty
      const flat = at < slots.length ? slots[at] : slots.length > 0 ? slots[slots.length - 1] + 1 : rest.length;
      return { ...state, projects: [...rest.slice(0, flat), moved, ...rest.slice(flat)] };
    }

    // Models
    case 'ADD_MODEL':
      return { ...state, models: [...state.models, action.payload] };
    case 'UPDATE_MODEL':
      return { ...state, models: state.models.map(m => m.id === action.payload.id ? action.payload : m) };
    case 'DELETE_MODEL':
      return { ...state, models: state.models.filter(m => m.id !== action.payload) };
    case 'MOVE_MODEL': {
      const { id, toProjectId, toIndexInProject } = action.payload;
      const model = state.models.find(m => m.id === id);
      if (!model || !state.projects.some(p => p.id === toProjectId)) return state;
      const rest = state.models.filter(m => m.id !== id);
      // Flat positions of the target project's units, in order
      const slots = rest.flatMap((m, i) => (m.projectId === toProjectId ? [i] : []));
      const at = clampIndex(toIndexInProject, slots.length);
      // Same project and same place among its units: nothing to do
      if (model.projectId === toProjectId) {
        const current = state.models.filter(m => m.projectId === toProjectId).findIndex(m => m.id === id);
        if (current === at) return state;
      }
      const moved = model.projectId === toProjectId ? model : { ...model, projectId: toProjectId };
      const flat = at < slots.length ? slots[at] : slots.length > 0 ? slots[slots.length - 1] + 1 : rest.length;
      return { ...state, models: [...rest.slice(0, flat), moved, ...rest.slice(flat)] };
    }
    case 'TOGGLE_MODEL_STATUS':
      return {
        ...state,
        models: state.models.map(m =>
          m.id === action.payload.id ? { ...m, [action.payload.field]: !m[action.payload.field] } : m
        )
      };

    case 'RESTORE_ITEMS': {
      // Parents first; a child whose parent no longer exists is not restored
      const categories = reinsert(state.categories, action.payload.categories, () => true);
      const categoryIds = new Set(categories.map(c => c.id));
      const projects = reinsert(state.projects, action.payload.projects, p => categoryIds.has(p.categoryId));
      const projectIds = new Set(projects.map(p => p.id));
      const models = reinsert(state.models, action.payload.models, m => projectIds.has(m.projectId));
      return { categories, projects, models };
    }

    default:
      return state;
  }
}
