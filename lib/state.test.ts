import { describe, expect, it } from 'vitest';
import { initialState, reducer, removedBy } from '@/lib/state';
import type { Action } from '@/lib/state';
import { seeded } from '@/lib/test-fixtures';
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
