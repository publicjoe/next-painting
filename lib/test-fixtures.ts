import type { AppState } from '@/types';

export const seeded: AppState = {
  categories: [{ id: 'c1', name: 'WH40k' }, { id: 'c2', name: 'D&D' }],
  projects: [
    { id: 'p1', categoryId: 'c1', name: 'Marines' },
    { id: 'p2', categoryId: 'c2', name: 'Party' },
  ],
  models: [
    { id: 'm1', projectId: 'p1', name: 'Captain', count: 1, built: false, primed: false, painted: false, based: false },
    { id: 'm2', projectId: 'p2', name: 'Rogue', count: 2, built: true, primed: false, painted: false, based: false },
  ],
};
