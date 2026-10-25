import { describe, expect, it } from 'vitest';
import { resolveCategoryDrop, resolveProjectDrop, resolveUnitDrop } from './drop-target';
import type { Category, Model, Project } from '@/types';

const p = (id: string, categoryId: string): Project => ({ id, categoryId, name: id });
const cats: Category[] = ['c1', 'c2', 'c3'].map(id => ({ id, name: id }));
// c1: a b c   c2: d e   c3: empty
const projects = [p('a', 'c1'), p('d', 'c2'), p('b', 'c1'), p('e', 'c2'), p('c', 'c1')];
const proj = (id: string) => ({ kind: 'proj' as const, id });

describe('resolveProjectDrop', () => {
  it('drops before a project in another category', () => {
    expect(resolveProjectDrop(projects, 'a', proj('e'), false)).toEqual({ toCategoryId: 'c2', toIndexInCategory: 1 });
  });

  it('drops after a project in another category', () => {
    expect(resolveProjectDrop(projects, 'a', proj('d'), true)).toEqual({ toCategoryId: 'c2', toIndexInCategory: 1 });
    expect(resolveProjectDrop(projects, 'a', proj('e'), true)).toEqual({ toCategoryId: 'c2', toIndexInCategory: 2 });
  });

  it('counts the active project as already removed when dragging down within a category', () => {
    // a b c -> a dropped before c gives b a c: index 1 once a is removed
    expect(resolveProjectDrop(projects, 'a', proj('c'), false)).toEqual({ toCategoryId: 'c1', toIndexInCategory: 1 });
    // a dropped after c gives b c a
    expect(resolveProjectDrop(projects, 'a', proj('c'), true)).toEqual({ toCategoryId: 'c1', toIndexInCategory: 2 });
  });

  it('drops up within a category', () => {
    expect(resolveProjectDrop(projects, 'c', proj('a'), false)).toEqual({ toCategoryId: 'c1', toIndexInCategory: 0 });
    expect(resolveProjectDrop(projects, 'c', proj('a'), true)).toEqual({ toCategoryId: 'c1', toIndexInCategory: 1 });
  });

  it('appends to a non-empty category on hdr and list targets', () => {
    expect(resolveProjectDrop(projects, 'a', { kind: 'hdr', id: 'c2' }, false)).toEqual({ toCategoryId: 'c2', toIndexInCategory: 2 });
    expect(resolveProjectDrop(projects, 'a', { kind: 'list', id: 'c2' }, false)).toEqual({ toCategoryId: 'c2', toIndexInCategory: 2 });
  });

  it('appends within the active category excluding the active project', () => {
    expect(resolveProjectDrop(projects, 'a', { kind: 'list', id: 'c1' }, false)).toEqual({ toCategoryId: 'c1', toIndexInCategory: 2 });
  });

  it('drops into an empty category at index 0', () => {
    expect(resolveProjectDrop(projects, 'a', { kind: 'list', id: 'c3' }, false)).toEqual({ toCategoryId: 'c3', toIndexInCategory: 0 });
    expect(resolveProjectDrop(projects, 'a', { kind: 'hdr', id: 'c3' }, false)).toEqual({ toCategoryId: 'c3', toIndexInCategory: 0 });
  });

  it('returns null when nothing would change', () => {
    expect(resolveProjectDrop(projects, 'b', proj('b'), false)).toBeNull();
    expect(resolveProjectDrop(projects, 'b', proj('c'), false)).toBeNull(); // already before c
    expect(resolveProjectDrop(projects, 'b', proj('a'), true)).toBeNull(); // already after a
    expect(resolveProjectDrop(projects, 'c', { kind: 'list', id: 'c1' }, false)).toBeNull(); // already last
  });

  it('returns null for missing ids and unsupported target kinds', () => {
    expect(resolveProjectDrop(projects, 'zzz', proj('a'), false)).toBeNull();
    expect(resolveProjectDrop(projects, 'a', proj('zzz'), false)).toBeNull();
    expect(resolveProjectDrop(projects, 'a', { kind: 'cat', id: 'c2' }, false)).toBeNull();
  });

  it('is safe with the id __proto__', () => {
    const odd = [p('__proto__', 'c1'), p('x', 'c1')];
    expect(resolveProjectDrop(odd, '__proto__', proj('x'), true)).toEqual({ toCategoryId: 'c1', toIndexInCategory: 1 });
    expect(resolveProjectDrop(odd, '__proto__', proj('x'), false)).toBeNull();
    expect(resolveProjectDrop(odd, 'x', proj('__proto__'), false)).toEqual({ toCategoryId: 'c1', toIndexInCategory: 0 });
  });
});

describe('resolveCategoryDrop', () => {
  it('returns the post-removal index dragging down', () => {
    expect(resolveCategoryDrop(cats, 'c1', 'c3', false)).toBe(1); // c2 c1 c3
    expect(resolveCategoryDrop(cats, 'c1', 'c3', true)).toBe(2); // c2 c3 c1
  });

  it('returns the post-removal index dragging up', () => {
    expect(resolveCategoryDrop(cats, 'c3', 'c1', false)).toBe(0);
    expect(resolveCategoryDrop(cats, 'c3', 'c1', true)).toBe(1);
  });

  it('returns null when nothing would change', () => {
    expect(resolveCategoryDrop(cats, 'c2', 'c2', false)).toBeNull();
    expect(resolveCategoryDrop(cats, 'c2', 'c3', false)).toBeNull();
    expect(resolveCategoryDrop(cats, 'c2', 'c1', true)).toBeNull();
  });

  it('returns null for missing ids', () => {
    expect(resolveCategoryDrop(cats, 'nope', 'c1', false)).toBeNull();
    expect(resolveCategoryDrop(cats, 'c1', 'nope', false)).toBeNull();
  });
});

describe('resolveUnitDrop', () => {
  const u = (id: string, projectId: string): Model => ({ id, projectId, name: id, count: 1, built: false, primed: false, painted: false, based: false });
  const unitProjects: Project[] = [p('pa', 'c1'), p('pb', 'c1'), p('pe', 'c2')];
  // pa: a b c   pb: d e   pe: empty. Interleaved, so the flat array is not grouped.
  const units = [u('a', 'pa'), u('d', 'pb'), u('b', 'pa'), u('e', 'pb'), u('c', 'pa')];
  const unit = (id: string) => ({ kind: 'unit' as const, id });
  const onProject = (id: string) => ({ kind: 'proj' as const, id });

  it('drops before or after a unit in the same project, counting the dragged unit as removed', () => {
    expect(resolveUnitDrop(units, unitProjects, 'a', unit('c'), false)).toEqual({ toProjectId: 'pa', toIndexInProject: 1 });
    expect(resolveUnitDrop(units, unitProjects, 'a', unit('c'), true)).toEqual({ toProjectId: 'pa', toIndexInProject: 2 });
    expect(resolveUnitDrop(units, unitProjects, 'c', unit('a'), false)).toEqual({ toProjectId: 'pa', toIndexInProject: 0 });
    expect(resolveUnitDrop(units, unitProjects, 'c', unit('a'), true)).toEqual({ toProjectId: 'pa', toIndexInProject: 1 });
  });

  it('drops before or after a unit in another project', () => {
    expect(resolveUnitDrop(units, unitProjects, 'a', unit('e'), false)).toEqual({ toProjectId: 'pb', toIndexInProject: 1 });
    expect(resolveUnitDrop(units, unitProjects, 'a', unit('e'), true)).toEqual({ toProjectId: 'pb', toIndexInProject: 2 });
  });

  it('appends to the end of a project dropped on in the sidebar, whichever half', () => {
    expect(resolveUnitDrop(units, unitProjects, 'a', onProject('pb'), false)).toEqual({ toProjectId: 'pb', toIndexInProject: 2 });
    expect(resolveUnitDrop(units, unitProjects, 'a', onProject('pb'), true)).toEqual({ toProjectId: 'pb', toIndexInProject: 2 });
    expect(resolveUnitDrop(units, unitProjects, 'a', onProject('pa'), false)).toEqual({ toProjectId: 'pa', toIndexInProject: 2 });
  });

  it('takes the unit table of an empty project at index 0', () => {
    expect(resolveUnitDrop(units, unitProjects, 'a', { kind: 'ulist', id: 'pe' }, false)).toEqual({ toProjectId: 'pe', toIndexInProject: 0 });
    expect(resolveUnitDrop(units, unitProjects, 'a', onProject('pe'), false)).toEqual({ toProjectId: 'pe', toIndexInProject: 0 });
  });

  it('returns null when nothing would change', () => {
    expect(resolveUnitDrop(units, unitProjects, 'b', unit('b'), false)).toBeNull();
    expect(resolveUnitDrop(units, unitProjects, 'b', unit('c'), false)).toBeNull(); // already before c
    expect(resolveUnitDrop(units, unitProjects, 'b', unit('a'), true)).toBeNull(); // already after a
    expect(resolveUnitDrop(units, unitProjects, 'c', onProject('pa'), false)).toBeNull(); // already last
    expect(resolveUnitDrop(units, unitProjects, 'c', { kind: 'ulist', id: 'pa' }, false)).toBeNull();
  });

  it('is not a drop on a category header, list, category or project list', () => {
    for (const kind of ['hdr', 'list', 'cat'] as const) {
      expect(resolveUnitDrop(units, unitProjects, 'a', { kind, id: 'c2' }, false)).toBeNull();
    }
  });

  it('returns null for missing ids and unknown projects', () => {
    expect(resolveUnitDrop(units, unitProjects, 'zzz', unit('a'), false)).toBeNull();
    expect(resolveUnitDrop(units, unitProjects, 'a', unit('zzz'), false)).toBeNull();
    expect(resolveUnitDrop(units, unitProjects, 'a', onProject('zzz'), false)).toBeNull();
    expect(resolveUnitDrop(units, unitProjects, 'a', { kind: 'ulist', id: 'zzz' }, false)).toBeNull();
    // A unit whose own project is gone cannot be a target
    expect(resolveUnitDrop([...units, u('orphan', 'gone')], unitProjects, 'a', unit('orphan'), false)).toBeNull();
  });

  it('is safe with the id __proto__', () => {
    const odd = [u('__proto__', '__proto__'), u('x', '__proto__')];
    const oddProjects = [p('__proto__', 'c1')];
    expect(resolveUnitDrop(odd, oddProjects, '__proto__', unit('x'), true)).toEqual({ toProjectId: '__proto__', toIndexInProject: 1 });
    expect(resolveUnitDrop(odd, oddProjects, 'x', unit('__proto__'), false)).toEqual({ toProjectId: '__proto__', toIndexInProject: 0 });
    expect(resolveUnitDrop(odd, oddProjects, '__proto__', onProject('__proto__'), false)).toEqual({ toProjectId: '__proto__', toIndexInProject: 1 });
    expect(resolveUnitDrop(odd, oddProjects, 'x', onProject('__proto__'), false)).toBeNull(); // x is already last
  });
});
