import type { Model } from '@/types';

/** A model counts as completed once it is based (not merely painted). */
export function getProjectProgress(projectModels: Model[]) {
  const totalCount = projectModels.reduce((sum, m) => sum + m.count, 0);
  const paintedCount = projectModels.filter(m => m.based).reduce((sum, m) => sum + m.count, 0);
  const percentage = totalCount === 0 ? 0 : Math.round((paintedCount / totalCount) * 100);

  return { totalCount, paintedCount, percentage };
}
