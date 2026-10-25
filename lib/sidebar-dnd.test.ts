// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Model } from '@/types';
import type { Active, Over } from '@dnd-kit/core';
import { createAnnouncer, detectCollisions, keyboardScrollBehavior, keyboardSlots, pointerDrop, resolveDrop, screenReaderInstructions, stepKeyboardDrop, type Drop } from './sidebar-dnd';

const categories = [
  { id: 'c1', name: 'Space Marines' },
  { id: 'c2', name: 'Orks' },
  { id: 'c3', name: 'Empty' },
];
const projects = [
  { id: 'p1', categoryId: 'c1', name: 'Intercessors' },
  { id: 'p2', categoryId: 'c1', name: 'Hellblasters' },
  { id: 'p3', categoryId: 'c2', name: 'Boyz' },
];
const allOpen = () => true;
const proj = (id: string) => ({ kind: 'proj' as const, id });
const cat = (id: string) => ({ kind: 'cat' as const, id });

describe('keyboardSlots', () => {
  it('lists every insertion point for a project, through empty and closed categories', () => {
    const isOpen = (id: string) => id !== 'c2';
    expect(keyboardSlots(categories, projects, proj('p1'), isOpen)).toEqual([
      { over: proj('p2'), after: false },
      { over: proj('p2'), after: true },
      { over: { kind: 'hdr', id: 'c2' }, after: false },
      { over: { kind: 'list', id: 'c3' }, after: false },
    ]);
  });

  it('lists every insertion point for a category', () => {
    expect(keyboardSlots(categories, projects, cat('c2'), allOpen)).toEqual([
      { over: cat('c1'), after: false },
      { over: cat('c3'), after: false },
      { over: cat('c3'), after: true },
    ]);
  });
});

describe('stepKeyboardDrop', () => {
  it('starts from the item’s own position and steps one slot at a time', () => {
    const first = stepKeyboardDrop(categories, projects, proj('p1'), allOpen, null, 1);
    expect(first).toEqual({ over: proj('p2'), after: true });
    expect(resolveDrop(categories, projects, proj('p1'), first)).toEqual({ kind: 'proj', toCategoryId: 'c1', toIndexInCategory: 1 });
    const second = stepKeyboardDrop(categories, projects, proj('p1'), allOpen, first, 1);
    expect(resolveDrop(categories, projects, proj('p1'), second)).toEqual({ kind: 'proj', toCategoryId: 'c2', toIndexInCategory: 0 });
  });

  it('reaches an empty category', () => {
    // p3 is alone in c2, so its start slot is the c2 list and one step down is the empty c3
    const down = stepKeyboardDrop(categories, projects, proj('p3'), allOpen, null, 1);
    expect(down).toEqual({ over: { kind: 'list', id: 'c3' }, after: false });
    expect(resolveDrop(categories, projects, proj('p3'), down)).toEqual({ kind: 'proj', toCategoryId: 'c3', toIndexInCategory: 0 });
  });

  it('drops onto a closed category, appending to it', () => {
    const up = stepKeyboardDrop(categories, projects, proj('p3'), allOpen, null, -1);
    expect(up).toEqual({ over: proj('p2'), after: true });
    const isOpen = (id: string) => id !== 'c3';
    const down = stepKeyboardDrop(categories, projects, proj('p3'), isOpen, null, 1);
    expect(down).toEqual({ over: { kind: 'hdr', id: 'c3' }, after: false });
    expect(resolveDrop(categories, projects, proj('p3'), down)).toEqual({ kind: 'proj', toCategoryId: 'c3', toIndexInCategory: 0 });
  });

  it('keeps its place when a closed category it rests on opens', () => {
    const before: Drop = { over: { kind: 'hdr', id: 'c2' }, after: false };
    // c2 has now opened: the equivalent slot is the end of c2
    const next = stepKeyboardDrop(categories, projects, proj('p1'), allOpen, before, 0);
    expect(next).toEqual({ over: proj('p3'), after: true });
  });

  it('stops at the ends of the list', () => {
    const top = stepKeyboardDrop(categories, projects, cat('c1'), allOpen, null, -1);
    expect(resolveDrop(categories, projects, cat('c1'), top)).toBeNull();
    let drop: Drop | null = null;
    for (let i = 0; i < 5; i++) drop = stepKeyboardDrop(categories, projects, cat('c1'), allOpen, drop, 1);
    expect(resolveDrop(categories, projects, cat('c1'), drop)).toEqual({ kind: 'cat', toIndex: 2 });
  });
});

describe('createAnnouncer', () => {
  const active = (id: string) => ({ id, data: { current: undefined }, rect: { current: { initial: null, translated: null } } }) as unknown as Active;
  const over = (id: string) => ({ id, rect: { left: 0, top: 0, width: 0, height: 0 }, disabled: false, data: { current: undefined } }) as unknown as Over;
  const setupAnnouncements = (drop: Drop | null = null) => {
    const ctx = { categories, projects, drop };
    return { ctx, a: createAnnouncer() };
  };
  const ids = /\b(p[123]|c[123]|proj:|cat:|list:|hdr:)/;

  it('names the item and its position when a project is picked up', () => {
    const { a, ctx } = setupAnnouncements();
    const text = a.onDragStart(ctx, { active: active('proj:p2') });
    expect(text).toBe('Picked up project "Hellblasters" in category "Space Marines", position 2 of 2.');
  });

  it('names the destination by name while over a target, once per change', () => {
    const { a, ctx } = setupAnnouncements();
    a.onDragStart(ctx, { active: active('proj:p1') });
    ctx.drop = { over: { kind: 'list', id: 'c3' }, after: false };
    const text = a.onDragOver(ctx, { active: active('proj:p1'), over: over('list:c3') });
    expect(text).toBe('Project "Intercessors" will move to category "Empty", position 1 of 1.');
    expect(a.onDragMove(ctx, { active: active('proj:p1'), over: over('list:c3') })).toBeUndefined();
    expect(text).not.toMatch(ids);
  });

  it('says when the item is back at its original place', () => {
    const { a, ctx } = setupAnnouncements();
    a.onDragStart(ctx, { active: active('proj:p1') });
    ctx.drop = { over: { kind: 'list', id: 'c3' }, after: false };
    a.onDragOver(ctx, { active: active('proj:p1'), over: over('list:c3') });
    ctx.drop = { over: proj('p2'), after: false };
    expect(a.onDragOver(ctx, { active: active('proj:p1'), over: over('proj:p2') })).toBe('Project "Intercessors" is back at its original position.');
  });

  it('announces a drop and a cancel by name', () => {
    const { a, ctx } = setupAnnouncements({ over: { kind: 'hdr', id: 'c2' }, after: false });
    expect(a.onDragEnd(ctx, { active: active('proj:p1'), over: over('hdr:c2') })).toBe(
      'Moved project "Intercessors" to category "Orks", position 2 of 2.',
    );
    ctx.drop = null;
    expect(a.onDragEnd(ctx, { active: active('proj:p1'), over: null })).toBe('Project "Intercessors" was dropped in its original position.');
    expect(a.onDragCancel(ctx, { active: active('proj:p1'), over: null })).toBe(
      'Moving project "Intercessors" was cancelled. It stays in category "Space Marines", position 1 of 2.',
    );
  });

  it('says a project cannot be dropped into a category that already holds its name, and that it was not moved', () => {
    const clashing = [...projects, { id: 'p4', categoryId: 'c2', name: ' intercessors' }];
    const ctx = { categories, projects: clashing, drop: null as Drop | null };
    const a = createAnnouncer();
    a.onDragStart(ctx, { active: active('proj:p1') });
    ctx.drop = { over: proj('p3'), after: false };
    const text = a.onDragOver(ctx, { active: active('proj:p1'), over: over('proj:p3') });
    expect(text).toBe('Project "Intercessors" cannot be dropped here: category "Orks" already has a project named " intercessors".');
    // The same refused category again is not repeated
    ctx.drop = { over: proj('p3'), after: true };
    expect(a.onDragOver(ctx, { active: active('proj:p1'), over: over('proj:p3') })).toBeUndefined();
    expect(a.onDragEnd(ctx, { active: active('proj:p1'), over: over('proj:p3') })).toBe(
      'Project "Intercessors" was not moved: category "Orks" already has a project named " intercessors".',
    );
    // A slot in a category without the name still announces a move
    ctx.drop = { over: { kind: 'list', id: 'c3' }, after: false };
    expect(a.onDragOver(ctx, { active: active('proj:p1'), over: over('list:c3') })).toBe(
      'Project "Intercessors" will move to category "Empty", position 1 of 1.',
    );
  });

  it('does not treat a reorder in the own category as a clash, even with a namesake there', () => {
    const dirty = [...projects, { id: 'p4', categoryId: 'c1', name: 'intercessors' }];
    const ctx = { categories, projects: dirty, drop: { over: proj('p2'), after: true } as Drop };
    expect(createAnnouncer().onDragEnd(ctx, { active: active('proj:p1'), over: over('proj:p2') })).toMatch(/^Moved project/);
  });

  it('says a drop was cancelled, not moved, when the data change cancelled the drag', () => {
    const { a, ctx } = setupAnnouncements({ over: { kind: 'hdr', id: 'c2' }, after: false });
    const text = a.onDragEnd({ ...ctx, cancelled: true }, { active: active('proj:p1'), over: over('hdr:c2') });
    expect(text).toBe('Moving project "Intercessors" was cancelled. It stays in category "Space Marines", position 1 of 2.');
  });

  it('announces category drags by name', () => {
    const { a, ctx } = setupAnnouncements();
    expect(a.onDragStart(ctx, { active: active('cat:c1') })).toBe('Picked up category "Space Marines", position 1 of 3.');
    ctx.drop = { over: cat('c3'), after: true };
    expect(a.onDragOver(ctx, { active: active('cat:c1'), over: over('cat:c3') })).toBe('Category "Space Marines" will move to position 3 of 3.');
    expect(a.onDragEnd(ctx, { active: active('cat:c1'), over: over('cat:c3') })).toBe('Moved category "Space Marines", position 3 of 3.');
    expect(a.onDragCancel(ctx, { active: active('cat:c1'), over: null })).toBe('Moving category "Space Marines" was cancelled. It stays at position 1 of 3.');
  });

  it('never speaks a raw id, even for an item that has gone', () => {
    const { a, ctx } = setupAnnouncements();
    const texts = [
      a.onDragStart(ctx, { active: active('proj:gone') }),
      a.onDragCancel(ctx, { active: active('proj:gone'), over: null }),
      a.onDragEnd(ctx, { active: active('cat:gone'), over: null }),
      a.onDragStart(ctx, { active: active('nonsense') }),
    ];
    for (const t of texts) {
      expect(t).toBeTruthy();
      expect(t).not.toMatch(/gone|nonsense|proj:|cat:/);
    }
  });
});

describe('detectCollisions', () => {
  // Rectangles stand in for layout, which jsdom does not have
  const rect = (top: number, height = 20) => ({ top, left: 0, width: 200, height, bottom: top + height, right: 200 });
  const container = (id: string, top: number, height = 20, data: Record<string, unknown> = {}) => ({
    id, key: id, disabled: false, data: { current: data }, node: { current: null }, rect: { current: rect(top, height) },
  });
  const layout = [
    container('cat:c1', 0, 30),
    container('list:c1', 30, 60),
    container('proj:p1', 30, 20, { categoryId: 'c1' }),
    container('proj:p2', 60, 20, { categoryId: 'c1' }),
    container('cat:c2', 100, 30),
    container('hdr:c2', 100, 30),
    container('cat:c3', 140, 30),
    container('list:c3', 170, 40),
  ];
  const run = (activeId: string, pointerY: number | null, keyboardDrop: Drop | null = null) =>
    detectCollisions({
      active: { id: activeId, data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
      collisionRect: rect((pointerY ?? 10) - 10), // the dragged row, centred on the pointer
      droppableRects: new Map(layout.map(c => [c.id, c.rect.current])),
      droppableContainers: layout,
      pointerCoordinates: pointerY === null ? null : { x: 100, y: pointerY },
    } as unknown as Parameters<typeof detectCollisions>[0], keyboardDrop).map(c => c.id);

  it('lets a category hit only categories', () => {
    expect(run('cat:c3', 45)[0]).toBe('cat:c1');
    expect(run('cat:c3', 45).every(id => String(id).startsWith('cat:'))).toBe(true);
  });

  it('prefers a project row over the list it sits in', () => {
    expect(run('proj:p9', 65)).toEqual(['proj:p2']);
  });

  it('picks the nearest row when the pointer is in the gap between rows', () => {
    // Sorted nearest first; dnd-kit takes the first
    expect(run('proj:p9', 53)).toEqual(['proj:p1', 'proj:p2']);
    expect(run('proj:p9', 57)).toEqual(['proj:p2', 'proj:p1']);
  });

  it('hits a closed category header, and an empty list', () => {
    expect(run('proj:p9', 110)).toEqual(['hdr:c2']);
    expect(run('proj:p9', 190)).toEqual(['list:c3']);
  });

  it('hits exactly the keyboard drop when there is no pointer', () => {
    expect(run('proj:p9', null, { over: { kind: 'list', id: 'c3' }, after: false })).toEqual(['list:c3']);
    expect(run('proj:p9', null, { over: { kind: 'proj', id: 'gone' }, after: false })).toEqual([]);
    expect(run('proj:p9', null, null)).toEqual([]);
  });
});

describe('pointerDrop', () => {
  const over = (id: string, top: number) => ({ id, rect: { top, height: 20 } });
  const pointerDown = { clientX: 10, clientY: 110 } as unknown as Event; // all getEventCoordinates reads
  // The dragged row started at top 100 and has moved down 200 px in the viewport
  const moved = { initial: { top: 100 }, translated: { top: 300 } };

  it('decides before or after from the pointer in the viewport, where the rows are', () => {
    // Pointer at 310: top half of a row at 305..325, bottom half of a row at 285..305
    expect(pointerDrop(over('proj:p1', 305), pointerDown, moved)).toEqual({ over: { kind: 'proj', id: 'p1' }, after: false });
    expect(pointerDrop(over('proj:p1', 285), pointerDown, moved)).toEqual({ over: { kind: 'proj', id: 'p1' }, after: true });
  });

  it('never sets after for a list or header, and is null for unknown or missing targets', () => {
    expect(pointerDrop(over('list:c1', 0), pointerDown, moved)).toEqual({ over: { kind: 'list', id: 'c1' }, after: false });
    expect(pointerDrop(over('hdr:c1', 0), pointerDown, moved)).toEqual({ over: { kind: 'hdr', id: 'c1' }, after: false });
    expect(pointerDrop(over('bogus', 0), pointerDown, moved)).toBeNull();
    expect(pointerDrop(null, pointerDown, moved)).toBeNull();
  });
});

describe('keyboardScrollBehavior', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const reduce = (matches: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches && query === '(prefers-reduced-motion: reduce)' }));

  it('scrolls instantly when reduced motion is requested', () => {
    reduce(true);
    expect(keyboardScrollBehavior()).toBe('auto');
  });

  it('scrolls smoothly otherwise, and where matchMedia is missing', () => {
    reduce(false);
    expect(keyboardScrollBehavior()).toBe('smooth');
    vi.stubGlobal('matchMedia', undefined);
    expect(keyboardScrollBehavior()).toBe('smooth');
  });
});

describe('screenReaderInstructions', () => {
  it('says that Escape and Tab cancel', () => {
    expect(screenReaderInstructions.draggable).toMatch(/Escape or Tab to cancel/);
  });
});

describe('unit drags', () => {
  const unitModel = (id: string, projectId: string): Model => ({ id, projectId, name: `Unit ${id}`, count: 1, built: false, primed: false, painted: false, based: false });
  // p1 (Intercessors): m1 m2 m3   p2 (Hellblasters): none   p3 (Boyz): m4
  const models = [unitModel('m1', 'p1'), unitModel('m2', 'p1'), unitModel('m3', 'p1'), unitModel('m4', 'p3')];
  const unit = (id: string) => ({ kind: 'unit' as const, id });
  const onUnit = (id: string, after: boolean): Drop => ({ over: unit(id), after });
  const onProj = (id: string): Drop => ({ over: proj(id), after: false });

  describe('resolveDrop', () => {
    it('resolves a unit drop to MOVE_MODEL arguments', () => {
      expect(resolveDrop(categories, projects, unit('m1'), onUnit('m3', true), models)).toEqual({ kind: 'unit', toProjectId: 'p1', toIndexInProject: 2 });
      expect(resolveDrop(categories, projects, unit('m1'), onProj('p3'), models)).toEqual({ kind: 'unit', toProjectId: 'p3', toIndexInProject: 1 });
      expect(resolveDrop(categories, projects, unit('m1'), onProj('p2'), models)).toEqual({ kind: 'unit', toProjectId: 'p2', toIndexInProject: 0 });
    });

    it('makes no move for categories, headers, lists or the unit’s own place', () => {
      expect(resolveDrop(categories, projects, unit('m1'), { over: cat('c2'), after: false }, models)).toBeNull();
      expect(resolveDrop(categories, projects, unit('m1'), { over: { kind: 'hdr', id: 'c2' }, after: false }, models)).toBeNull();
      expect(resolveDrop(categories, projects, unit('m1'), { over: { kind: 'list', id: 'c2' }, after: false }, models)).toBeNull();
      expect(resolveDrop(categories, projects, unit('m1'), onUnit('m2', false), models)).toBeNull();
      expect(resolveDrop(categories, projects, unit('m1'), null, models)).toBeNull();
    });

    it('does not let a unit drop resolve a project or category drag', () => {
      expect(resolveDrop(categories, projects, proj('p1'), onUnit('m3', true), models)).toBeNull();
      expect(resolveDrop(categories, projects, cat('c1'), onUnit('m3', true), models)).toBeNull();
    });
  });

  describe('keyboardSlots', () => {
    it('lists the other units of its project, then every project in the sidebar in order', () => {
      expect(keyboardSlots(categories, projects, unit('m2'), allOpen, models)).toEqual([
        { over: unit('m1'), after: false },
        { over: unit('m3'), after: false },
        { over: unit('m3'), after: true },
        onProj('p1'), onProj('p2'), onProj('p3'),
      ]);
    });

    it('uses the unit’s own table when it is the only unit', () => {
      expect(keyboardSlots(categories, projects, unit('m4'), allOpen, models)).toEqual([
        { over: { kind: 'ulist', id: 'p3' }, after: false },
        onProj('p1'), onProj('p2'), onProj('p3'),
      ]);
    });

    it('stops at the header of a closed category with projects, and skips one without', () => {
      const isOpen = (id: string) => id !== 'c1';
      expect(keyboardSlots(categories, projects, unit('m4'), isOpen, models)).toEqual([
        { over: { kind: 'ulist', id: 'p3' }, after: false },
        { over: { kind: 'hdr', id: 'c1' }, after: false },
        onProj('p3'),
      ]);
    });
  });

  describe('stepKeyboardDrop', () => {
    it('starts on the unit’s own place and steps through the table, then the sidebar', () => {
      const dropAt = (d: Drop | null) => resolveDrop(categories, projects, unit('m2'), d, models);
      const start = stepKeyboardDrop(categories, projects, unit('m2'), allOpen, null, 0, models);
      expect(dropAt(start)).toBeNull();
      let drop: Drop | null = start;
      const seen: unknown[] = [];
      for (let i = 0; i < 6; i++) {
        drop = stepKeyboardDrop(categories, projects, unit('m2'), allOpen, drop, 1, models);
        seen.push(dropAt(drop));
      }
      expect(seen).toEqual([
        { kind: 'unit', toProjectId: 'p1', toIndexInProject: 2 }, // after m3
        { kind: 'unit', toProjectId: 'p1', toIndexInProject: 2 }, // the end of its own project, from the sidebar
        { kind: 'unit', toProjectId: 'p2', toIndexInProject: 0 },
        { kind: 'unit', toProjectId: 'p3', toIndexInProject: 1 },
        { kind: 'unit', toProjectId: 'p3', toIndexInProject: 1 }, // stops at the last slot
        { kind: 'unit', toProjectId: 'p3', toIndexInProject: 1 },
      ]);
      // And back up to where it started
      let up: Drop | null = drop;
      for (let i = 0; i < 6; i++) up = stepKeyboardDrop(categories, projects, unit('m2'), allOpen, up, -1, models);
      expect(dropAt(up)).toEqual({ kind: 'unit', toProjectId: 'p1', toIndexInProject: 0 });
    });

    it('rests on a closed header with no move, and lands on its first project once it opens', () => {
      const closed = (id: string) => id !== 'c2';
      const onHeader = stepKeyboardDrop(categories, projects, unit('m1'), closed, { over: proj('p2'), after: false }, 1, models);
      expect(onHeader).toEqual({ over: { kind: 'hdr', id: 'c2' }, after: false });
      expect(resolveDrop(categories, projects, unit('m1'), onHeader, models)).toBeNull();
      // c2 has opened: its header slot is gone, and the step re-finds its first project (Boyz)
      const opened = stepKeyboardDrop(categories, projects, unit('m1'), allOpen, onHeader, 0, models);
      expect(opened).toEqual(onProj('p3'));
    });
  });

  describe('pointerDrop', () => {
    it('sets after from the pointer for a unit row', () => {
      const pointerDown = { clientX: 10, clientY: 110 } as unknown as Event;
      const moved = { initial: { top: 100 }, translated: { top: 300 } }; // pointer at 310
      expect(pointerDrop({ id: 'unit:m1', rect: { top: 305, height: 20 } }, pointerDown, moved)).toEqual({ over: unit('m1'), after: false });
      expect(pointerDrop({ id: 'unit:m1', rect: { top: 285, height: 20 } }, pointerDown, moved)).toEqual({ over: unit('m1'), after: true });
      expect(pointerDrop({ id: 'ulist:p2', rect: { top: 285, height: 20 } }, pointerDown, moved)).toEqual({ over: { kind: 'ulist', id: 'p2' }, after: false });
    });
  });

  describe('detectCollisions', () => {
    const rect = (top: number, height = 20) => ({ top, left: 0, width: 200, height, bottom: top + height, right: 200 });
    const container = (id: string, top: number, height = 20, data: Record<string, unknown> = {}) => ({
      id, key: id, disabled: false, data: { current: data }, node: { current: null }, rect: { current: rect(top, height) },
    });
    // The unit table (ulist:p1 with three rows) and an empty project's table sit in the main area;
    // the sidebar is the proj, hdr, list and cat entries
    const layout = [
      container('ulist:p1', 300, 100),
      container('unit:m1', 320, 20, { projectId: 'p1' }),
      container('unit:m2', 340, 20, { projectId: 'p1' }),
      container('unit:m3', 360, 20, { projectId: 'p1' }),
      container('ulist:p2', 500, 40),
      container('cat:c1', 0, 30),
      container('list:c1', 30, 60),
      container('proj:p1', 30, 20, { categoryId: 'c1' }),
      container('proj:p2', 60, 20, { categoryId: 'c1' }),
      container('hdr:c2', 100, 30),
      container('cat:c2', 100, 30),
    ];
    const run = (activeId: string, pointerY: number | null, keyboardDrop: Drop | null = null, x = 100) =>
      detectCollisions({
        active: { id: activeId, data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
        collisionRect: rect((pointerY ?? 10) - 10),
        droppableRects: new Map(layout.map(c => [c.id, c.rect.current])),
        droppableContainers: layout,
        pointerCoordinates: pointerY === null ? null : { x, y: pointerY },
      } as unknown as Parameters<typeof detectCollisions>[0], keyboardDrop).map(c => c.id);

    it('lets a unit hit a unit row, a sidebar project row, or a closed header', () => {
      expect(run('unit:m1', 345)).toEqual(['unit:m2']);
      expect(run('unit:m1', 65)).toEqual(['proj:p2']);
      expect(run('unit:m1', 110)).toEqual(['hdr:c2']);
    });

    it('lands a pointer in the table between or beside rows on the nearest row of that table', () => {
      expect(run('unit:m1', 390)[0]).toBe('unit:m3');
      expect(run('unit:m1', 305)[0]).toBe('unit:m1');
    });

    it('takes the unit table of an empty project', () => {
      expect(run('unit:m1', 520)).toEqual(['ulist:p2']);
    });

    it('hits nothing when released over no unit target, so it cannot land somewhere by accident', () => {
      expect(run('unit:m1', 250)).toEqual([]);
      // A category list or category row is not a unit target
      expect(run('unit:m1', 85)).toEqual([]);
    });

    it('never lets a project or category drag hit a unit row or a unit table', () => {
      for (const y of [310, 345, 390, 520]) {
        expect(run('proj:p9', y).filter(id => /^(unit|ulist):/.test(String(id)))).toEqual([]);
        expect(run('cat:c9', y).filter(id => /^(unit|ulist):/.test(String(id)))).toEqual([]);
      }
    });

    it('hits exactly the keyboard drop for a unit, and nothing for a missing one', () => {
      expect(run('unit:m1', null, onUnit('m3', true))).toEqual(['unit:m3']);
      expect(run('unit:m1', null, { over: { kind: 'ulist', id: 'p2' }, after: false })).toEqual(['ulist:p2']);
      expect(run('unit:m1', null, onProj('p2'))).toEqual(['proj:p2']);
      expect(run('unit:m1', null, onUnit('gone', false))).toEqual([]);
    });
  });

  describe('announcements', () => {
    const active = (id: string) => ({ id, data: { current: undefined }, rect: { current: { initial: null, translated: null } } }) as unknown as Active;
    const over = (id: string) => ({ id, rect: { left: 0, top: 0, width: 0, height: 0 }, disabled: false, data: { current: undefined } }) as unknown as Over;
    const setupAnnouncements = (drop: Drop | null = null) => ({ ctx: { categories, projects, models, drop }, a: createAnnouncer() });
    const ids = /unit:|proj:|ulist:|\bp[123]\b/;

    it('names the unit and its place when it is picked up', () => {
      const { a, ctx } = setupAnnouncements();
      expect(a.onDragStart(ctx, { active: active('unit:m2') })).toBe('Picked up unit "Unit m2" in project "Intercessors", position 2 of 3.');
    });

    it('names the destination project and position while over a target, once per change', () => {
      const { a, ctx } = setupAnnouncements();
      a.onDragStart(ctx, { active: active('unit:m1') });
      ctx.drop = onProj('p3');
      const text = a.onDragOver(ctx, { active: active('unit:m1'), over: over('proj:p3') });
      expect(text).toBe('Unit "Unit m1" will move to project "Boyz", position 2 of 2.');
      expect(a.onDragMove(ctx, { active: active('unit:m1'), over: over('proj:p3') })).toBeUndefined();
      expect(text).not.toMatch(ids);
    });

    it('says when a unit is over nothing, or back at its original place', () => {
      const { a, ctx } = setupAnnouncements();
      a.onDragStart(ctx, { active: active('unit:m1') });
      ctx.drop = onProj('p2');
      a.onDragOver(ctx, { active: active('unit:m1'), over: over('proj:p2') });
      ctx.drop = onUnit('m2', false);
      expect(a.onDragOver(ctx, { active: active('unit:m1'), over: over('unit:m2') })).toBe('Unit "Unit m1" is back at its original position.');
      ctx.drop = null;
      expect(a.onDragOver(ctx, { active: active('unit:m1'), over: null })).toBe('Unit "Unit m1" is not over a drop position.');
    });

    it('announces a drop and a cancel by name', () => {
      const { a, ctx } = setupAnnouncements(onUnit('m3', true));
      expect(a.onDragEnd(ctx, { active: active('unit:m1'), over: over('unit:m3') })).toBe('Moved unit "Unit m1" to project "Intercessors", position 3 of 3.');
      ctx.drop = onProj('p2');
      expect(a.onDragEnd(ctx, { active: active('unit:m1'), over: over('proj:p2') })).toBe('Moved unit "Unit m1" to project "Hellblasters", position 1 of 1.');
      expect(a.onDragEnd({ ...ctx, cancelled: true }, { active: active('unit:m1'), over: over('proj:p2') })).toBe(
        'Moving unit "Unit m1" was cancelled. It stays in project "Intercessors", position 1 of 3.',
      );
      expect(a.onDragCancel(ctx, { active: active('unit:m1'), over: null })).toBe(
        'Moving unit "Unit m1" was cancelled. It stays in project "Intercessors", position 1 of 3.',
      );
    });

    it('never speaks a raw id, even for a unit that has gone', () => {
      const { a, ctx } = setupAnnouncements();
      for (const t of [a.onDragStart(ctx, { active: active('unit:gone') }), a.onDragCancel(ctx, { active: active('unit:gone'), over: null }), a.onDragEnd(ctx, { active: active('unit:gone'), over: null })]) {
        expect(t).toBeTruthy();
        expect(t).not.toMatch(/gone|unit:/);
      }
    });

    it('still works for project drags when the context has no units', () => {
      const a = createAnnouncer();
      expect(a.onDragStart({ categories, projects, drop: null }, { active: active('proj:p1') })).toBe('Picked up project "Intercessors" in category "Space Marines", position 1 of 2.');
    });
  });
});
