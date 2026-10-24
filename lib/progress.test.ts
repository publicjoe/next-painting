import { describe, expect, it } from 'vitest';
import { getProjectProgress } from './progress';
import type { Model } from '@/types';

const model = (over: Partial<Model>): Model => ({
  id: 'm', projectId: 'p', name: 'x', count: 1, built: false, primed: false, painted: false, based: false, ...over,
});

describe('getProjectProgress', () => {
  it('is zero for no models', () => {
    expect(getProjectProgress([])).toEqual({ totalCount: 0, paintedCount: 0, percentage: 0 });
  });

  it('counts only based models, weighted by count', () => {
    const result = getProjectProgress([
      model({ count: 3, based: true }),
      model({ count: 1, painted: true }),
    ]);
    expect(result).toEqual({ totalCount: 4, paintedCount: 3, percentage: 75 });
  });
});
