import { describe, expect, it } from 'vitest';
import {
  canonicalName,
  findCategoryClash,
  findCategoryRenameClash,
  findProjectRenameClash,
  findImportNameClash,
  findMoveClash,
  findProjectClash,
  findRestoreClash,
  moveClashMessage,
  projectClashMessage,
  projectRenameRefusedMessage,
  categoryRenameRefusedMessage,
  sameName,
} from '@/lib/names';
import type { Category, Project } from '@/types';

const cats: Category[] = [{ id: 'c1', name: 'WH40k' }, { id: 'c2', name: 'D&D' }];
const projs: Project[] = [
  { id: 'p1', categoryId: 'c1', name: 'Marines' },
  { id: 'p2', categoryId: 'c2', name: 'Party' },
  { id: 'p3', categoryId: 'c2', name: 'Marines' },
];

describe('canonicalName and sameName', () => {
  it('ignores case, surrounding spaces and Unicode composition', () => {
    expect(canonicalName('  WH40K ')).toBe('wh40k');
    expect(sameName('Café', 'café')).toBe(true);
    expect(sameName(' Party ', 'party')).toBe(true);
  });

  it('keeps inner spaces and different letters apart', () => {
    expect(sameName('Space Marines', 'SpaceMarines')).toBe(false);
    expect(sameName('Orks', 'Ork')).toBe(false);
  });
});

describe('findCategoryClash', () => {
  it('finds a category by any variant of its name', () => {
    expect(findCategoryClash(cats, ' wh40K ')?.id).toBe('c1');
    expect(findCategoryClash(cats, 'Orks')).toBeUndefined();
  });

  it('ignores the category being renamed, so a case-only change is allowed', () => {
    expect(findCategoryClash(cats, 'wh40k', 'c1')).toBeUndefined();
    expect(findCategoryClash(cats, 'd&d', 'c1')?.id).toBe('c2');
  });

  it("is harmless for '__proto__' names and ids", () => {
    const odd = [{ id: '__proto__', name: '__proto__' }];
    expect(findCategoryClash(odd, '__PROTO__')?.id).toBe('__proto__');
    expect(findCategoryClash(odd, 'constructor')).toBeUndefined();
    expect(findCategoryClash(odd, '__proto__', '__proto__')).toBeUndefined();
  });
});

describe('findProjectClash', () => {
  it('only looks inside the given category', () => {
    expect(findProjectClash(projs, 'c1', 'MARINES')?.id).toBe('p1');
    expect(findProjectClash(projs, 'c1', 'Party')).toBeUndefined(); // lives in c2
    expect(findProjectClash(projs, 'c2', 'marines')?.id).toBe('p3');
  });

  it('ignores the project being renamed', () => {
    expect(findProjectClash(projs, 'c1', 'marines', 'p1')).toBeUndefined();
    expect(findProjectClash(projs, 'c2', 'Party', 'p3')?.id).toBe('p2');
  });

  it("is harmless for '__proto__' category ids and names", () => {
    const odd = [{ id: 'p', categoryId: '__proto__', name: '__proto__' }];
    expect(findProjectClash(odd, '__proto__', '__proto__')?.id).toBe('p');
    expect(findProjectClash(odd, 'constructor', '__proto__')).toBeUndefined();
  });
});

describe('findMoveClash', () => {
  it('finds the project a move would collide with', () => {
    // p1 "Marines" into c2, which already has "Marines"
    expect(findMoveClash(projs, 'p1', 'c2')?.id).toBe('p3');
  });

  it('is no clash when the target has no project of that name', () => {
    expect(findMoveClash(projs, 'p2', 'c1')).toBeUndefined();
  });

  it('is never a clash within the own category (a reorder), even in data that already holds duplicates', () => {
    const dirty: Project[] = [
      { id: 'a', categoryId: 'c1', name: 'Same' },
      { id: 'b', categoryId: 'c1', name: 'same' },
    ];
    expect(findMoveClash(dirty, 'a', 'c1')).toBeUndefined();
  });

  it('ignores an unknown project', () => {
    expect(findMoveClash(projs, 'nope', 'c2')).toBeUndefined();
  });
});

describe('messages', () => {
  it('name the clash and where it is', () => {
    expect(projectClashMessage(' Party ', 'D&D')).toBe('A project named "Party" already exists in category "D&D".');
    expect(moveClashMessage(projs[0], 'D&D', projs[2])).toBe(
      '"Marines" was not moved to category "D&D": it already has a project named "Marines".',
    );
    expect(categoryRenameRefusedMessage('D&D', 'Orks')).toBe(
      'A category named "D&D" already exists, so "Orks" was not renamed. Edit the name or press Escape.',
    );
    expect(projectRenameRefusedMessage('Party', 'D&D', 'Boyz')).toBe(
      'A project named "Party" already exists in category "D&D", so "Boyz" was not renamed. Edit the name or press Escape.',
    );
  });
});

describe('findImportNameClash', () => {
  const ok = { categories: cats, projects: projs };

  it('accepts the same project name in different categories', () => {
    expect(findImportNameClash(ok)).toBeNull();
    expect(findImportNameClash({ categories: [], projects: [] })).toBeNull();
  });

  it('rejects two categories with one name, naming it', () => {
    const message = findImportNameClash({ categories: [...cats, { id: 'c3', name: 'D&D' }], projects: [] });
    expect(message).toBe('Could not import: two categories are named "D&D".');
  });

  it('shows both spellings when the names differ only by case, spaces or composition', () => {
    const message = findImportNameClash({ categories: [{ id: 'a', name: 'Café' }, { id: 'b', name: 'CAFÉ ' }], projects: [] });
    expect(message).toContain('have the same name');
    expect(message).toContain('CAFÉ');
  });

  it('rejects two projects in one category, naming the category', () => {
    const message = findImportNameClash({
      categories: cats,
      projects: [...projs, { id: 'p4', categoryId: 'c2', name: ' party' }],
    });
    expect(message).toBe('Could not import: the projects "Party" and " party" in category "D&D" have the same name.');
  });

  it('is linear enough for a large file', () => {
    const projects = Array.from({ length: 50000 }, (_, i) => ({ id: `p${i}`, categoryId: 'c1', name: `Project ${i}` }));
    const start = Date.now();
    expect(findImportNameClash({ categories: cats, projects })).toBeNull();
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("handles '__proto__' names and category ids", () => {
    const state = {
      categories: [{ id: '__proto__', name: '__proto__' }],
      projects: [
        { id: 'a', categoryId: '__proto__', name: '__proto__' },
        { id: 'b', categoryId: '__proto__', name: 'constructor' },
      ],
    };
    expect(findImportNameClash(state)).toBeNull();
    state.projects.push({ id: 'c', categoryId: '__proto__', name: '__PROTO__' });
    expect(findImportNameClash(state)).toContain('in category "__proto__"');
  });
});

describe('findRestoreClash', () => {
  it('is null when nothing has taken the names', () => {
    const removed = { categories: [{ item: { id: 'c9', name: 'Orks' } }], projects: [{ item: { id: 'p9', categoryId: 'c1', name: 'Boyz' } }] };
    expect(findRestoreClash({ categories: cats, projects: projs }, removed)).toBeNull();
  });

  it('names a category whose name has been taken since', () => {
    const removed = { categories: [{ item: { id: 'c9', name: 'd&d' } }], projects: [] };
    expect(findRestoreClash({ categories: cats, projects: projs }, removed)).toBe('A category named "d&d" already exists.');
  });

  it('names a project whose name has been taken in its category', () => {
    const removed = { categories: [], projects: [{ item: { id: 'p9', categoryId: 'c1', name: 'MARINES' } }] };
    expect(findRestoreClash({ categories: cats, projects: projs }, removed)).toBe(
      'A project named "MARINES" already exists in category "WH40k".',
    );
  });

  it('names the category of a project restored with its deleted category', () => {
    const state = { categories: [cats[0]], projects: [] as Project[] };
    const removed = { categories: [{ item: cats[1] }], projects: [{ item: projs[1] }] };
    // c2 is gone and nothing in c2 exists now, so no clash
    expect(findRestoreClash(state, removed)).toBeNull();
  });

  it('skips items already present, as the restore itself does', () => {
    const removed = { categories: [{ item: cats[0] }], projects: [{ item: projs[0] }] };
    expect(findRestoreClash({ categories: cats, projects: projs }, removed)).toBeNull();
  });
});

describe('rename helpers', () => {
  const dirtyCats: Category[] = [{ id: 'a', name: 'Rex' }, { id: 'b', name: 'rex' }];
  const dirtyProjs: Project[] = [{ id: 'a', categoryId: 'c1', name: 'Rex' }, { id: 'b', categoryId: 'c1', name: 'rex' }];

  it('always allow a rename that compares equal to the own name, even beside a namesake', () => {
    expect(findCategoryRenameClash(dirtyCats, dirtyCats[1], 'REX')).toBeUndefined();
    expect(findProjectRenameClash(dirtyProjs, dirtyProjs[1], ' REX ')).toBeUndefined();
  });

  it('still refuse a rename to another item\'s name, and a move of the same name into a clash', () => {
    const other: Category = { id: 'c', name: 'Other' };
    expect(findCategoryRenameClash([...dirtyCats, other], other, 'rex')).toBeDefined();
    const solo: Project = { id: 'c', categoryId: 'c1', name: 'Solo' };
    expect(findProjectRenameClash([...dirtyProjs, solo], solo, 'REX')).toBeDefined();
    // Same compared name but a different category is checked there
    expect(findProjectRenameClash(dirtyProjs, dirtyProjs[1], 'rex', 'c1')).toBeUndefined();
    expect(findProjectRenameClash([...dirtyProjs, { id: 'z', categoryId: 'c2', name: 'Rex' }], dirtyProjs[1], 'rex', 'c2')).toBeDefined();
  });
});
