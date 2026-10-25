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

describe('MOVE_MODEL', () => {
  const unit = (id: string, projectId: string) => ({ id, projectId, name: id, count: 1, built: false, primed: false, painted: false, based: false });
  // Units interleaved across projects, so the flat-array mapping matters. E is an empty project.
  const state: AppState = {
    categories: [{ id: 'c', name: 'C' }],
    projects: ['A', 'B', 'E'].map(id => ({ id, categoryId: 'c', name: id })),
    models: [unit('u1', 'A'), unit('u2', 'B'), unit('u3', 'A'), unit('u4', 'B'), unit('u5', 'A')],
  };
  const move = (s: AppState, id: string, toProjectId: string, toIndexInProject: number) =>
    reducer(s, { type: 'MOVE_MODEL', payload: { id, toProjectId, toIndexInProject } });
  const units = (s: AppState) => s.models.map(m => `${m.id}@${m.projectId}`);

  it('reorders a unit within its project, leaving other projects in place', () => {
    // A's units are u1, u3, u5 at flat positions 0, 2, 4
    expect(units(move(state, 'u1', 'A', 2))).toEqual(['u2@B', 'u3@A', 'u4@B', 'u5@A', 'u1@A']);
    expect(units(move(state, 'u5', 'A', 0))).toEqual(['u5@A', 'u1@A', 'u2@B', 'u3@A', 'u4@B']);
    expect(units(move(state, 'u1', 'A', 1))).toEqual(['u2@B', 'u3@A', 'u4@B', 'u1@A', 'u5@A']);
  });

  it('moves a unit to another project, before the unit at that position, and updates its projectId', () => {
    expect(units(move(state, 'u3', 'B', 0))).toEqual(['u1@A', 'u3@B', 'u2@B', 'u4@B', 'u5@A']);
    expect(units(move(state, 'u3', 'B', 1))).toEqual(['u1@A', 'u2@B', 'u3@B', 'u4@B', 'u5@A']);
  });

  it('moves a unit after the last unit of the target when the index equals its length', () => {
    expect(units(move(state, 'u3', 'B', 2))).toEqual(['u1@A', 'u2@B', 'u4@B', 'u3@B', 'u5@A']);
  });

  it('appends to the end of the array when the target project is empty', () => {
    expect(units(move(state, 'u3', 'E', 0))).toEqual(['u1@A', 'u2@B', 'u4@B', 'u5@A', 'u3@E']);
  });

  it('changes only the moved unit', () => {
    const next = move(state, 'u3', 'B', 0);
    expect(next.models.find(m => m.id === 'u3')).toEqual({ ...unit('u3', 'B') });
    expect(next.models.find(m => m.id === 'u1')).toBe(state.models[0]);
    expect(next.categories).toBe(state.categories);
    expect(next.projects).toBe(state.projects);
  });

  it('returns the identical state for an unknown unit or unknown target project', () => {
    expect(move(state, 'nope', 'A', 0)).toBe(state);
    expect(move(state, 'u1', 'nope', 0)).toBe(state);
  });

  it('returns the identical state for a move to the same place', () => {
    expect(move(state, 'u3', 'A', 1)).toBe(state);
    expect(move(state, 'u4', 'B', 99)).toBe(state);
    expect(move(state, 'u1', 'A', 0)).toBe(state);
    expect(move(state, 'u5', 'A', NaN)).toBe(state);
  });

  it('clamps NaN, negative, fractional and over-length indexes into range', () => {
    const toEnd = ['u2@B', 'u3@A', 'u4@B', 'u5@A', 'u1@A'];
    expect(units(move(state, 'u1', 'A', NaN))).toEqual(toEnd);
    expect(units(move(state, 'u1', 'A', 1.5))).toEqual(toEnd);
    expect(units(move(state, 'u1', 'A', 99))).toEqual(toEnd);
    expect(units(move(state, 'u5', 'A', -3))).toEqual(['u5@A', 'u1@A', 'u2@B', 'u3@A', 'u4@B']);
  });

  it("moves units whose ids contain a colon or are '__proto__', and into such a project", () => {
    const odd: AppState = {
      categories: [{ id: 'c', name: 'C' }],
      projects: [{ id: '__proto__', categoryId: 'c', name: 'P' }, { id: 'a:b', categoryId: 'c', name: 'Q' }],
      models: [unit('__proto__', '__proto__'), unit('a:b', '__proto__')],
    };
    expect(units(move(odd, '__proto__', '__proto__', 1))).toEqual(['a:b@__proto__', '__proto__@__proto__']);
    expect(units(move(odd, 'a:b', 'a:b', 0))).toEqual(['__proto__@__proto__', 'a:b@a:b']);
    expect(units(move(odd, '__proto__', 'a:b', 0))).toEqual(['a:b@__proto__', '__proto__@a:b']);
    expect(Object.keys({}).length).toBe(0); // the prototype was not touched
  });

  it('keeps the state valid for every valid move', () => {
    for (const m of state.models) {
      for (const project of state.projects) {
        for (let i = 0; i <= 4; i++) {
          const next = move(state, m.id, project.id, i);
          expect(isAppState(next)).toBe(true);
          expect(next.models).toHaveLength(state.models.length);
        }
      }
    }
  });
});

describe('naming rules backstop', () => {
  const same = (before: AppState, action: Action) => expect(reducer(before, action)).toBe(before);
  const names = (s: AppState) => ({ c: s.categories.map(c => c.name), p: s.projects.map(p => p.name) });

  it('refuses a duplicate category on add and rename, with the same state object', () => {
    same(seeded, { type: 'ADD_CATEGORY', payload: { id: 'c9', name: 'd&d' } });
    same(seeded, { type: 'ADD_CATEGORY', payload: { id: 'c9', name: '  WH40K ' } });
    same(seeded, { type: 'UPDATE_CATEGORY', payload: { id: 'c1', name: 'D&D' } });
  });

  it('allows a category rename that only changes the case or spacing of itself', () => {
    const next = reducer(seeded, { type: 'UPDATE_CATEGORY', payload: { id: 'c1', name: ' wh40K ' } });
    expect(next.categories[0].name).toBe(' wh40K ');
  });

  it('refuses a duplicate project in its category, but allows the same name elsewhere', () => {
    same(seeded, { type: 'ADD_PROJECT', payload: { id: 'p9', categoryId: 'c1', name: 'MARINES' } });
    const elsewhere = reducer(seeded, { type: 'ADD_PROJECT', payload: { id: 'p9', categoryId: 'c2', name: 'Marines' } });
    expect(elsewhere.projects.map(p => p.id)).toEqual(['p1', 'p2', 'p9']);
  });

  it('refuses a project rename onto a sibling, and allows a case-only rename of itself', () => {
    const two = reducer(seeded, { type: 'ADD_PROJECT', payload: { id: 'p3', categoryId: 'c1', name: 'Orks' } });
    same(two, { type: 'UPDATE_PROJECT', payload: { id: 'p3', categoryId: 'c1', name: ' marines' } });
    const renamed = reducer(two, { type: 'UPDATE_PROJECT', payload: { id: 'p1', categoryId: 'c1', name: 'MARINES' } });
    expect(renamed.projects[0].name).toBe('MARINES');
  });

  it('refuses an UPDATE_PROJECT that changes category into a clash', () => {
    const state: AppState = { ...seeded, projects: [...seeded.projects, { id: 'p3', categoryId: 'c2', name: 'Marines' }] };
    same(state, { type: 'UPDATE_PROJECT', payload: { id: 'p1', categoryId: 'c2', name: 'Marines' } });
  });

  it('refuses a move into a category that holds the name, and allows other moves and reorders', () => {
    const state: AppState = { ...seeded, projects: [...seeded.projects, { id: 'p3', categoryId: 'c2', name: ' marines ' }] };
    same(state, { type: 'MOVE_PROJECT', payload: { id: 'p1', toCategoryId: 'c2', toIndexInCategory: 0 } });
    // p2 "Party" has no namesake in c1
    expect(reducer(state, { type: 'MOVE_PROJECT', payload: { id: 'p2', toCategoryId: 'c1', toIndexInCategory: 0 } }).projects.find(p => p.id === 'p2')?.categoryId).toBe('c1');
    // reordering within c2 is not a clash
    expect(names(reducer(state, { type: 'MOVE_PROJECT', payload: { id: 'p3', toCategoryId: 'c2', toIndexInCategory: 0 } })).p).toEqual(['Marines', ' marines ', 'Party']);
  });

  describe('data that already holds duplicates', () => {
    const dirty: AppState = {
      categories: [{ id: 'c1', name: 'Same' }, { id: 'c2', name: 'same' }, { id: 'c3', name: 'Other' }],
      projects: [
        { id: 'p1', categoryId: 'c1', name: 'Twin' },
        { id: 'p2', categoryId: 'c1', name: 'twin' },
        { id: 'p3', categoryId: 'c3', name: 'Solo' },
      ],
      models: [],
    };

    it('still loads', () => {
      expect(migrateWithReport(dirty)?.state).toEqual(dirty);
      expect(isAppState(dirty)).toBe(true);
    });

    it('renames other items, and re-saves a duplicate unchanged or with only its case changed', () => {
      expect(reducer(dirty, { type: 'UPDATE_CATEGORY', payload: { id: 'c3', name: 'Renamed' } }).categories[2].name).toBe('Renamed');
      expect(reducer(dirty, { type: 'UPDATE_PROJECT', payload: { id: 'p3', categoryId: 'c3', name: 'Solo 2' } }).projects[2].name).toBe('Solo 2');
      expect(reducer(dirty, { type: 'UPDATE_CATEGORY', payload: { id: 'c2', name: 'SAME' } }).categories[1].name).toBe('SAME');
      expect(reducer(dirty, { type: 'UPDATE_PROJECT', payload: { id: 'p2', categoryId: 'c1', name: 'TWIN' } }).projects[1].name).toBe('TWIN');
    });

    it('lets one of the duplicates be fixed by renaming it to something free, but not to the other', () => {
      expect(reducer(dirty, { type: 'UPDATE_CATEGORY', payload: { id: 'c2', name: 'Fixed' } }).categories[1].name).toBe('Fixed');
      same(dirty, { type: 'UPDATE_CATEGORY', payload: { id: 'c3', name: 'SAME' } });
    });

    it('still reorders and deletes', () => {
      expect(reducer(dirty, { type: 'MOVE_CATEGORY', payload: { id: 'c2', toIndex: 0 } }).categories[0].id).toBe('c2');
      expect(reducer(dirty, { type: 'MOVE_PROJECT', payload: { id: 'p2', toCategoryId: 'c1', toIndexInCategory: 0 } }).projects[0].id).toBe('p2');
      expect(reducer(dirty, { type: 'DELETE_PROJECT', payload: 'p1' }).projects).toHaveLength(2);
    });
  });

  it("is harmless for '__proto__' ids and names", () => {
    let s = reducer(initialState, { type: 'ADD_CATEGORY', payload: { id: '__proto__', name: '__proto__' } });
    s = reducer(s, { type: 'ADD_PROJECT', payload: { id: '__proto__', categoryId: '__proto__', name: '__proto__' } });
    expect(s.categories).toHaveLength(1);
    expect(s.projects).toHaveLength(1);
    same(s, { type: 'ADD_CATEGORY', payload: { id: 'x', name: '__PROTO__' } });
    same(s, { type: 'ADD_PROJECT', payload: { id: 'y', categoryId: '__proto__', name: '__proto__' } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  describe('RESTORE_ITEMS', () => {
    it('restores a deleted project when its name is still free', () => {
      const removed = removedBy(seeded, 'project', 'p1');
      const after = reducer(seeded, { type: 'DELETE_PROJECT', payload: 'p1' });
      expect(reducer(after, { type: 'RESTORE_ITEMS', payload: removed }).projects.map(p => p.id)).toEqual(['p1', 'p2']);
    });

    it('does not restore a project, or its units, when its name has been taken since', () => {
      const removed = removedBy(seeded, 'project', 'p1');
      let s = reducer(seeded, { type: 'DELETE_PROJECT', payload: 'p1' });
      s = reducer(s, { type: 'ADD_PROJECT', payload: { id: 'p9', categoryId: 'c1', name: 'marines' } });
      const restored = reducer(s, { type: 'RESTORE_ITEMS', payload: removed });
      expect(restored.projects.map(p => p.id)).toEqual(['p2', 'p9']);
      expect(restored.models.map(m => m.id)).toEqual(['m2']);
    });

    it('does not restore a category, or its projects and units, when its name has been taken since', () => {
      const removed = removedBy(seeded, 'category', 'c1');
      let s = reducer(seeded, { type: 'DELETE_CATEGORY', payload: 'c1' });
      s = reducer(s, { type: 'ADD_CATEGORY', payload: { id: 'c9', name: 'wh40k' } });
      const restored = reducer(s, { type: 'RESTORE_ITEMS', payload: removed });
      expect(restored.categories.map(c => c.id)).toEqual(['c2', 'c9']);
      expect(restored.projects.map(p => p.id)).toEqual(['p2']);
      expect(restored.models.map(m => m.id)).toEqual(['m2']);
    });

    it('still restores a project whose name matches one in another category', () => {
      const removed = removedBy(seeded, 'project', 'p1');
      let s = reducer(seeded, { type: 'DELETE_PROJECT', payload: 'p1' });
      s = reducer(s, { type: 'ADD_PROJECT', payload: { id: 'p9', categoryId: 'c2', name: 'Marines' } });
      expect(reducer(s, { type: 'RESTORE_ITEMS', payload: removed }).projects.map(p => p.id)).toEqual(['p1', 'p2', 'p9']);
    });
  });
});
