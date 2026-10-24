import { describe, expect, it } from 'vitest';
import { getProjectProgress, isComplete } from './progress';
import type { Model } from '@/types';

const model = (over: Partial<Model>): Model => ({
  id: 'm', projectId: 'p', name: 'x', count: 1, built: false, primed: false, painted: false, based: false, ...over,
});

describe('getProjectProgress', () => {
  it('is zero for no models', () => {
    expect(getProjectProgress([])).toEqual({ totalCount: 0, completedCount: 0, percentage: 0 });
  });

  it('counts only fully ticked models, weighted by count', () => {
    const done = { built: true, primed: true, painted: true, based: true };
    const result = getProjectProgress([
      model({ count: 3, ...done }),
      model({ count: 1, painted: true }),
      model({ count: 2, based: true }), // based alone is not complete
    ]);
    expect(result).toEqual({ totalCount: 6, completedCount: 3, percentage: 50 });
  });
});

describe('isComplete', () => {
  it.each(['built', 'primed', 'painted', 'based'] as const)('is false when only %s is missing', (missing) => {
    const all = { built: true, primed: true, painted: true, based: true };
    expect(isComplete(model({ ...all, [missing]: false }))).toBe(false);
    expect(isComplete(model(all))).toBe(true);
  });
});
