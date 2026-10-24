export interface Category {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  categoryId: string;
  name: string;
}

export interface Model {
  id: string;
  projectId: string;
  name: string;
  count: number;
  built: boolean;
  primed: boolean;
  painted: boolean;
  based: boolean;
}

export interface AppState {
  categories: Category[];
  projects: Project[];
  models: Model[];
}

export type StatusField = 'built' | 'primed' | 'painted' | 'based';
