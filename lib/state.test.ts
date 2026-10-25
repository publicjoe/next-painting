import { describe, expect, it } from 'vitest';
import { initialState, reducer, removedBy } from '@/lib/state';
import type { Action } from '@/lib/state';
import { seeded } from '@/lib/test-fixtures';
import { migrateWithReport } from '@/lib/migrate';
import { isAppState } from '@/lib/validate';
import type { AppState } from '@/types';

describe('reducer', () => {
  it('replaces state', () => {
    expect(reducer(seeded, { type: 'REPLACE_STATE', payload: initialState })).toEqual(initialState);
  });

  it('adds, renames and deletes a category', () => {
    let s = reducer(initialState, { type: 'ADD_CATEGORY', payload: { id: 'c9', name: 'New' } });
    expect(s.categories).toEqual([{ id: 'c9', name: 'New' }]);
    s = reducer(s, { type: 'UPDATE_CATEGORY', payload: { id: 'c9', name: 'Renamed' } });
    expect(s.categories[0].name).toBe('Renamed');
    s = reducer(s, { type: 'DELETE_CATEGORY', payload: 'c9' });
    expect(s.categories).toEqual([]);
  });

  it('cascades category deletion to projects and models', () => {
    const next = reducer(seeded, { type: 'DELETE_CATEGORY', payload: 'c1' });
    expect(next.categories.map(c => c.id)).toEqual(['c2']);
    expect(next.projects.map(p => p.id)).toEqual(['p2']);
    expect(next.models.map(m => m.id)).toEqual(['m2']);
  });

  it('adds and updates a project', () => {
    let s = reducer(seeded, { type: 'ADD_PROJECT', payload: { id: 'p3', categoryId: 'c1', name: 'Orks' } });
    expect(s.projects).toHaveLength(3);
    s = reducer(s, { type: 'UPDATE_PROJECT', payload: { id: 'p3', categoryId: 'c1', name: 'Greenskins' } });
    expect(s.projects[2].name).toBe('Greenskins');
  });

  it('cascades project deletion to models', () => {
    const next = reducer(seeded, { type: 'DELETE_PROJECT', payload: 'p2' });
    expect(next.projects.map(p => p.id)).toEqual(['p1']);
    expect(next.models.map(m => m.id)).toEqual(['m1']);
  });

  it('adds, updates and deletes a model', () => {
    const model = { id: 'm3', projectId: 'p1', name: 'Sergeant', count: 1, built: false, primed: false, painted: false, based: false };
    let s = reducer(seeded, { type: 'ADD_MODEL', payload: model });
    expect(s.models).toHaveLength(3);
    s = reducer(s, { type: 'UPDATE_MODEL', payload: { ...model, count: 5 } });
    expect(s.models[2].count).toBe(5);
    s = reducer(s, { type: 'DELETE_MODEL', payload: 'm3' });
    expect(s.models.map(m => m.id)).toEqual(['m1', 'm2']);
  });

  it('toggles only the requested status field', () => {
    const next = reducer(seeded, { type: 'TOGGLE_MODEL_STATUS', payload: { id: 'm1', field: 'painted' } });
    expect(next.models[0]).toMatchObject({ painted: true, built: false, name: 'Captain' });
    expect(next.models[1]).toEqual(seeded.models[1]);
  });

  it('returns the same state for an unknown action', () => {
    expect(reducer(seeded, { type: 'NOPE' } as unknown as Action)).toBe(seeded);
  });

  describe('MOVE_CATEGORY and MOVE_PROJECT', () => {
    // Projects interleaved across categories, so the flat-array mapping matters
    const state: AppState = {
      categories: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }, { id: 'C', name: 'C' }, { id: 'E', name: 'Empty' }],
      projects: [
        { id: 'p1', categoryId: 'A', name: 'P1' },
        { id: 'p2', categoryId: 'B', name: 'P2' },
        { id: 'p3', categoryId: 'A', name: 'P3' },
        { id: 'p4', categoryId: 'C', name: 'P4' },
        { id: 'p5', categoryId: 'A', name: 'P5' },
        { id: 'p6', categoryId: 'B', name: 'P6' },
      ],
      models: [
        { id: 'm1', projectId: 'p1', name: 'M1', count: 1, built: false, primed: false, painted: false, based: false },
        { id: 'm2', projectId: 'p4', name: 'M2', count: 2, built: true, primed: false, painted: false, based: false },
      ],
    };
    const abc: AppState = { categories: state.categories.slice(0, 3), projects: [], models: [] };
    const moveCategory = (s: AppState, id: string, toIndex: number) =>
      reducer(s, { type: 'MOVE_CATEGORY', payload: { id, toIndex } });
    const moveProject = (s: AppState, id: string, toCategoryId: string, toIndexInCategory: number) =>
      reducer(s, { type: 'MOVE_PROJECT', payload: { id, toCategoryId, toIndexInCategory } });
    const cats = (s: AppState) => s.categories.map(c => c.id);
    const projs = (s: AppState) => s.projects.map(p => `${p.id}@${p.categoryId}`);

    it('moves a category, counting the index after removal', () => {
      expect(cats(moveCategory(abc, 'A', 2))).toEqual(['B', 'C', 'A']);
      expect(cats(moveCategory(abc, 'C', 0))).toEqual(['C', 'A', 'B']);
    });

    it('reorders a project within its category, leaving other categories in place', () => {
      // A's projects are p1, p3, p5 at flat positions 0, 2, 4
      expect(projs(moveProject(state, 'p1', 'A', 2))).toEqual(['p2@B', 'p3@A', 'p4@C', 'p5@A', 'p1@A', 'p6@B']);
      expect(projs(moveProject(state, 'p5', 'A', 0))).toEqual(['p5@A', 'p1@A', 'p2@B', 'p3@A', 'p4@C', 'p6@B']);
    });

    it('moves a project to another category, before the project at that position', () => {
      expect(projs(moveProject(state, 'p3', 'B', 1))).toEqual(['p1@A', 'p2@B', 'p4@C', 'p5@A', 'p3@B', 'p6@B']);
      expect(projs(moveProject(state, 'p3', 'B', 0))).toEqual(['p1@A', 'p3@B', 'p2@B', 'p4@C', 'p5@A', 'p6@B']);
    });

    it('moves a project after the last project of the target when the index equals its length', () => {
      expect(projs(moveProject(state, 'p3', 'B', 2))).toEqual(['p1@A', 'p2@B', 'p4@C', 'p5@A', 'p6@B', 'p3@B']);
    });

    it('appends to the end of the array when the target category is empty', () => {
      expect(projs(moveProject(state, 'p3', 'E', 0))).toEqual(['p1@A', 'p2@B', 'p4@C', 'p5@A', 'p6@B', 'p3@E']);
    });

    it('returns the identical state for an unknown id or unknown target category', () => {
      expect(moveCategory(state, 'nope', 0)).toBe(state);
      expect(moveProject(state, 'nope', 'A', 0)).toBe(state);
      expect(moveProject(state, 'p1', 'nope', 0)).toBe(state);
    });

    it('clamps NaN, negative, fractional and over-length indexes into range', () => {
      const toEnd = ['p2@B', 'p3@A', 'p4@C', 'p5@A', 'p1@A', 'p6@B'];
      expect(projs(moveProject(state, 'p1', 'A', NaN))).toEqual(toEnd);
      expect(projs(moveProject(state, 'p1', 'A', 1.5))).toEqual(toEnd);
      expect(projs(moveProject(state, 'p1', 'A', 99))).toEqual(toEnd);
      expect(projs(moveProject(state, 'p5', 'A', -3))).toEqual(['p5@A', 'p1@A', 'p2@B', 'p3@A', 'p4@C', 'p6@B']);
      expect(cats(moveCategory(abc, 'A', NaN))).toEqual(['B', 'C', 'A']);
      expect(cats(moveCategory(abc, 'A', 99))).toEqual(['B', 'C', 'A']);
      expect(cats(moveCategory(abc, 'C', -1))).toEqual(['C', 'A', 'B']);
      expect(cats(moveCategory(abc, 'B', 0.5))).toEqual(['A', 'C', 'B']);
    });

    it('returns the identical state for a move to the same place', () => {
      expect(moveCategory(abc, 'B', 1)).toBe(abc);
      expect(moveCategory(abc, 'A', -1)).toBe(abc);
      expect(moveProject(state, 'p3', 'A', 1)).toBe(state);
      expect(moveProject(state, 'p6', 'B', 99)).toBe(state);
    });

    it("moves items whose ids contain a colon or are '__proto__'", () => {
      const odd: AppState = {
        categories: [{ id: 'a:b', name: 'X' }, { id: '__proto__', name: 'Y' }],
        projects: [{ id: '__proto__', categoryId: 'a:b', name: 'P' }, { id: 'a:b', categoryId: 'a:b', name: 'Q' }],
        models: [],
      };
      expect(cats(moveCategory(odd, 'a:b', 1))).toEqual(['__proto__', 'a:b']);
      expect(cats(moveCategory(odd, '__proto__', 0))).toEqual(['__proto__', 'a:b']);
      // '__proto__' category is empty, so the project lands at the end of the array
      expect(projs(moveProject(odd, '__proto__', '__proto__', 0))).toEqual(['a:b@a:b', '__proto__@__proto__']);
      expect(projs(moveProject(odd, 'a:b', 'a:b', 0))).toEqual(['a:b@a:b', '__proto__@a:b']);
    });

    it('keeps the state valid and models untouched for every valid move', () => {
      expect(isAppState(state)).toBe(true);
      const indexes = [-1, 0, 0.5, 1, 2, 3, 4, NaN, 99];
      for (const c of state.categories) {
        for (const i of indexes) {
          const next = moveCategory(state, c.id, i);
          expect(isAppState(next)).toBe(true);
          expect(next.models).toBe(state.models);
          expect(next.categories).toHaveLength(state.categories.length);
        }
        for (const p of state.projects) {
          for (const i of indexes) {
            const next = moveProject(state, p.id, c.id, i);
            expect(isAppState(next)).toBe(true);
            expect(next.models).toBe(state.models);
            expect(next.projects).toHaveLength(state.projects.length);
            expect(next.projects.find(x => x.id === p.id)?.categoryId).toBe(c.id);
          }
        }
      }
    });

    it('keeps the new order through export and import', () => {
      const moved = moveProject(moveCategory(state, 'A', 3), 'p3', 'B', 1);
      const imported = migrateWithReport(JSON.parse(JSON.stringify(moved)));
      expect(imported?.state.categories.map(c => c.id)).toEqual(['B', 'C', 'E', 'A']);
      expect(imported?.state.projects.map(p => `${p.id}@${p.categoryId}`)).toEqual(projs(moved));
    });
  });

  describe('undo (removedBy + RESTORE_ITEMS)', () => {
    const model = (id: string, projectId: string) => ({ id, projectId, name: id, count: 1, built: false, primed: false, painted: false, based: false });
    // Interleaved so that original positions matter
    const state: AppState = {
      categories: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }, { id: 'c3', name: 'C' }],
      projects: [
        { id: 'p1', categoryId: 'c2', name: 'P1' },
        { id: 'p2', categoryId: 'c1', name: 'P2' },
        { id: 'p3', categoryId: 'c2', name: 'P3' },
        { id: 'p4', categoryId: 'c3', name: 'P4' },
      ],
      models: [model('m1', 'p1'), model('m2', 'p2'), model('m3', 'p3'), model('m4', 'p1'), model('m5', 'p4')],
    };
    const undo = (kind: 'category' | 'project' | 'model', id: string, del: Action) => {
      const removed = removedBy(state, kind, id);
      return { removed, after: reducer(state, del), restored: reducer(reducer(state, del), { type: 'RESTORE_ITEMS', payload: removed }) };
    };

    it('restores a deleted category with its projects and models in original order', () => {
      const { removed, after, restored } = undo('category', 'c2', { type: 'DELETE_CATEGORY', payload: 'c2' });
      expect(removed.projects.map(r => r.item.id)).toEqual(['p1', 'p3']);
      expect(removed.models.map(r => r.item.id)).toEqual(['m1', 'm3', 'm4']);
      expect(after.categories.map(c => c.id)).toEqual(['c1', 'c3']);
      expect(restored).toEqual(state);
    });

    it('restores a deleted project with its models in original order', () => {
      const { restored } = undo('project', 'p1', { type: 'DELETE_PROJECT', payload: 'p1' });
      expect(restored).toEqual(state);
    });

    it('restores a deleted model at its position', () => {
      const { restored } = undo('model', 'm2', { type: 'DELETE_MODEL', payload: 'm2' });
      expect(restored).toEqual(state);
    });

    it('keeps edits made after the delete', () => {
      const { removed, after } = undo('model', 'm2', { type: 'DELETE_MODEL', payload: 'm2' });
      const edited = reducer(after, { type: 'TOGGLE_MODEL_STATUS', payload: { id: 'm1', field: 'painted' } });
      const restored = reducer(edited, { type: 'RESTORE_ITEMS', payload: removed });
      expect(restored.models.map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
      expect(restored.models[0].painted).toBe(true);
    });

    it('restores several deletes in any order', () => {
      const first = removedBy(state, 'model', 'm1');
      const s1 = reducer(state, { type: 'DELETE_MODEL', payload: 'm1' });
      const second = removedBy(s1, 'project', 'p1');
      const s2 = reducer(s1, { type: 'DELETE_PROJECT', payload: 'p1' });
      // Undo the older delete first: m1's project is gone, so it is not restored
      const early = reducer(s2, { type: 'RESTORE_ITEMS', payload: first });
      expect(early).toEqual(s2);
      expect(reducer(s2, { type: 'RESTORE_ITEMS', payload: second }).projects.map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    });

    it('does not restore a project whose category is gone, nor duplicate items', () => {
      const removed = removedBy(state, 'project', 'p2');
      const gone = reducer(reducer(state, { type: 'DELETE_PROJECT', payload: 'p2' }), { type: 'DELETE_CATEGORY', payload: 'c1' });
      expect(reducer(gone, { type: 'RESTORE_ITEMS', payload: removed })).toEqual(gone);
      expect(reducer(state, { type: 'RESTORE_ITEMS', payload: removed })).toEqual(state);
    });
  });
});
