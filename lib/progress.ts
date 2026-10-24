import type { Model } from '@/types';

/** A model is complete once every stage (built, primed, painted, based) is ticked. */
export const isComplete = (m: Model) => m.built && m.primed && m.painted && m.based;

/** Progress is weighted by each model's count, and only complete models count. */
export function getProjectProgress(projectModels: Model[]) {
  const totalCount = projectModels.reduce((sum, m) => sum + m.count, 0);
  const completedCount = projectModels.filter(isComplete).reduce((sum, m) => sum + m.count, 0);
  const percentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return { totalCount, completedCount, percentage };
}
