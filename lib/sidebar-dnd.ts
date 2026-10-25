import {
  closestCenter,
  pointerWithin,
  type KeyboardCodes,
  type CollisionDetection,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import type { Category, Project } from '@/types';
import { getEventCoordinates } from '@dnd-kit/utilities';
import { dndId, parseDndId, type DndKind } from './dnd-ids';
import { resolveCategoryDrop, resolveProjectDrop } from './drop-target';

/**
 * The sidebar's drag logic that does not need React: where a drop lands, how
 * the keyboard steps between drop positions, which droppables a drag may hit,
 * and what a screen reader hears. dnd-kit only reports what is under the
 * dragged item; everything that decides the move lives here or in drop-target.
 */

/** A drop position: the droppable under the item, and whether it lands after it. */
export interface Drop {
  over: { kind: DndKind; id: string };
  after: boolean;
}

export type ResolvedDrop =
  | { kind: 'proj'; toCategoryId: string; toIndexInCategory: number }
  | { kind: 'cat'; toIndex: number }
  | null;

type Active = { kind: DndKind; id: string };

/** The move a drop would make, or null when it would change nothing. */
export function resolveDrop(categories: Category[], projects: Project[], active: Active, drop: Drop | null): ResolvedDrop {
  if (!drop) return null;
  if (active.kind === 'proj') {
    const move = resolveProjectDrop(projects, active.id, drop.over, drop.after);
    return move && { kind: 'proj', ...move };
  }
  if (active.kind === 'cat' && drop.over.kind === 'cat') {
    const toIndex = resolveCategoryDrop(categories, active.id, drop.over.id, drop.after);
    return toIndex === null ? null : { kind: 'cat', toIndex };
  }
  return null;
}

/**
 * Every place the keyboard can put the dragged item, top to bottom. A project
 * can go before any other project, after the last one in an open category, into
 * an empty open category (its list), or onto a closed category (its header,
 * which appends). A category can go before any other category or after the last.
 */
export function keyboardSlots(categories: Category[], projects: Project[], active: Active, isOpen: (categoryId: string) => boolean): Drop[] {
  const around = (kind: DndKind, ids: string[]): Drop[] =>
    ids.length === 0 ? [] : [...ids.map(id => ({ over: { kind, id }, after: false })), { over: { kind, id: ids[ids.length - 1] }, after: true }];

  if (active.kind === 'cat') return around('cat', categories.filter(c => c.id !== active.id).map(c => c.id));

  return categories.flatMap((category): Drop[] => {
    if (!isOpen(category.id)) return [{ over: { kind: 'hdr', id: category.id }, after: false }];
    const rest = projects.filter(p => p.categoryId === category.id && p.id !== active.id).map(p => p.id);
    return rest.length === 0 ? [{ over: { kind: 'list', id: category.id }, after: false }] : around('proj', rest);
  });
}

const sameMove = (a: ResolvedDrop, b: ResolvedDrop) => JSON.stringify(a) === JSON.stringify(b);
const dropKey = (d: Drop) => `${d.over.kind}:${d.over.id}:${d.after}`;

/**
 * The keyboard's next drop position: one slot up (-1), down (1), or the same
 * place re-found (0) after the slots changed, for example when a closed
 * category it rests on opens. With no current drop it starts from the item's
 * own position, the one slot that would change nothing.
 */
export function stepKeyboardDrop(
  categories: Category[],
  projects: Project[],
  active: Active,
  isOpen: (categoryId: string) => boolean,
  current: Drop | null,
  direction: -1 | 0 | 1
): Drop | null {
  const slots = keyboardSlots(categories, projects, active, isOpen);
  if (slots.length === 0) return null;
  const resolve = (d: Drop | null) => resolveDrop(categories, projects, active, d);
  let at = current ? slots.findIndex(s => dropKey(s) === dropKey(current)) : -1;
  // The exact slot has gone: find one that makes the same move, else the start
  if (at === -1) at = slots.findIndex(s => sameMove(resolve(s), resolve(current)));
  if (at === -1) at = Math.max(0, slots.findIndex(s => resolve(s) === null));
  return slots[Math.min(slots.length - 1, Math.max(0, at + direction))];
}

/**
 * The drop for a pointer drag: the droppable under the item, and whether the
 * pointer is in its lower half. The pointer is the press point plus how far the
 * dragged row has moved in the viewport. dnd-kit's event delta is not used: it
 * also adds the distance the list has scrolled, while the rows' rectangles are
 * already live viewport positions, so after an auto-scroll it would be off by
 * exactly the scrolled distance.
 */
export function pointerDrop(
  over: { id: UniqueIdentifier; rect: { top: number; height: number } } | null,
  activatorEvent: Event | null,
  activeRect: { initial: { top: number } | null; translated: { top: number } | null }
): Drop | null {
  const target = over ? parseDndId(over.id) : null;
  if (!over || !target) return null;
  const start = activatorEvent ? getEventCoordinates(activatorEvent) : null;
  const { initial, translated } = activeRect;
  const y = start && initial && translated ? start.y + translated.top - initial.top : over.rect.top;
  const after = (target.kind === 'proj' || target.kind === 'cat') && y > over.rect.top + over.rect.height / 2;
  return { over: target, after };
}

/**
 * Collision detection filtered by what is being dragged. A category only ever
 * hits categories. A project hits projects, open category lists and closed
 * category headers; within a list the nearest project wins, so a pointer in
 * the gap between two rows still lands between them. Keyboard drags have no
 * pointer: they hit exactly the drop the keyboard chose.
 */
export function detectCollisions(args: Parameters<CollisionDetection>[0], keyboardDrop: Drop | null): ReturnType<CollisionDetection> {
  const kindOf = (id: UniqueIdentifier) => parseDndId(id)?.kind;
  if (!args.pointerCoordinates) {
    const id = keyboardDrop && dndId(keyboardDrop.over.kind, keyboardDrop.over.id);
    const container = id ? args.droppableContainers.find(c => c.id === id) : undefined;
    return container ? [{ id: container.id, data: { droppableContainer: container, value: 0 } }] : [];
  }
  if (kindOf(args.active.id) === 'cat') {
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(c => kindOf(c.id) === 'cat') });
  }
  const candidates = args.droppableContainers.filter(c => {
    const kind = kindOf(c.id);
    return kind === 'proj' || kind === 'list' || kind === 'hdr';
  });
  const within = pointerWithin({ ...args, droppableContainers: candidates });
  for (const kind of ['proj', 'hdr'] as const) {
    const hits = within.filter(c => kindOf(c.id) === kind);
    if (hits.length) return hits;
  }
  const list = within.find(c => kindOf(c.id) === 'list');
  if (list) {
    const categoryId = parseDndId(list.id)?.id;
    const rows = candidates.filter(c => kindOf(c.id) === 'proj' && c.data.current?.categoryId === categoryId);
    return rows.length ? closestCenter({ ...args, droppableContainers: rows }) : [list];
  }
  return closestCenter({ ...args, droppableContainers: candidates });
}

/**
 * Keys for a keyboard drag. dnd-kit's defaults also drop on Tab, which would
 * commit a move as the user tries to leave; here Tab cancels, like Escape.
 */
export const KEYBOARD_CODES: KeyboardCodes = {
  start: ['Space', 'Enter'],
  cancel: ['Escape', 'Tab'],
  end: ['Space', 'Enter'],
};

/** How the keyboard sensor scrolls the list to the next position: instantly when reduced motion is asked for. */
export function keyboardScrollBehavior(): ScrollBehavior {
  // Called on window: a detached matchMedia throws in browsers. jsdom has none.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'smooth';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'To pick up, press Space or Enter. Use the Up and Down arrow keys to choose a new position, ' +
    'then press Space or Enter to drop it, or Escape or Tab to cancel. Resting on a closed category for ' +
    'half a second opens it. The Move button on each row makes the same moves without dragging.',
};

export interface AnnouncementContext {
  categories: Category[];
  projects: Project[];
  drop: Drop | null;
  /** The drag was cancelled because the data changed, so the drop dispatches nothing. */
  cancelled?: boolean;
}

type Args = { active: { id: UniqueIdentifier }; over?: { id: UniqueIdentifier } | null };

/**
 * dnd-kit's live-region text, built from names in the current data so a raw id
 * is never spoken. Each method takes the data at the moment of the announcement.
 * Over and move events are both reported, so each speaks only when the move a
 * drop would make has changed: keyboard steps and pointer movement sound the same.
 */
export function createAnnouncer() {
  let lastKey = 'origin';

  const lookup = (ctx: AnnouncementContext, rawId: UniqueIdentifier) => {
    const { categories, projects } = ctx;
    const parsed = parseDndId(rawId);
    if (parsed?.kind === 'proj') {
      const project = projects.find(p => p.id === parsed.id);
      if (!project) return null;
      const siblings = projects.filter(p => p.categoryId === project.categoryId);
      const category = categories.find(c => c.id === project.categoryId);
      return {
        kind: 'proj' as const,
        id: parsed.id,
        label: `project "${project.name}"`,
        start: ` in category "${category?.name ?? 'unknown'}", position ${siblings.indexOf(project) + 1} of ${siblings.length}`,
        stays: `in category "${category?.name ?? 'unknown'}", position ${siblings.indexOf(project) + 1} of ${siblings.length}`,
      };
    }
    if (parsed?.kind === 'cat') {
      const index = categories.findIndex(c => c.id === parsed.id);
      if (index === -1) return null;
      return {
        kind: 'cat' as const,
        id: parsed.id,
        label: `category "${categories[index].name}"`,
        start: `, position ${index + 1} of ${categories.length}`,
        stays: `at position ${index + 1} of ${categories.length}`,
      };
    }
    return null;
  };

  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  /** Where the current drop would put the item, in words, with a key for spotting changes. */
  const destination = (ctx: AnnouncementContext, item: NonNullable<ReturnType<typeof lookup>>) => {
    const { categories, projects, drop } = ctx;
    const move = resolveDrop(categories, projects, item, drop);
    if (!drop) return { key: 'none', move: null, text: null };
    if (!move) return { key: 'origin', move: null, text: null };
    if (move.kind === 'cat') {
      return { key: `cat:${move.toIndex}`, move, text: `position ${move.toIndex + 1} of ${categories.length}` };
    }
    const target = categories.find(c => c.id === move.toCategoryId);
    const count = projects.filter(p => p.categoryId === move.toCategoryId && p.id !== item.id).length + 1;
    return {
      key: `proj:${move.toCategoryId}:${move.toIndexInCategory}`,
      move,
      text: `category "${target?.name ?? 'unknown'}", position ${move.toIndexInCategory + 1} of ${count}`,
    };
  };

  const over = (ctx: AnnouncementContext, { active }: Args) => {
    const item = lookup(ctx, active.id);
    if (!item) return undefined;
    const dest = destination(ctx, item);
    if (dest.key === lastKey) return undefined;
    lastKey = dest.key;
    if (dest.key === 'none') return `${capital(item.label)} is not over a drop position.`;
    if (dest.key === 'origin') return `${capital(item.label)} is back at its original position.`;
    return `${capital(item.label)} will move to ${dest.text}.`;
  };

  const cancelled = (ctx: AnnouncementContext, { active }: Args) => {
    const item = lookup(ctx, active.id);
    return item ? `Moving ${item.label} was cancelled. It stays ${item.stays}.` : 'Moving the item was cancelled.';
  };

  return {
    onDragStart(ctx: AnnouncementContext, { active }: Args) {
      lastKey = 'origin';
      const item = lookup(ctx, active.id);
      return item ? `Picked up ${item.label}${item.start}.` : 'Picked up an item.';
    },
    onDragOver: over,
    onDragMove: over,
    onDragEnd(ctx: AnnouncementContext, args: Args) {
      if (ctx.cancelled) return cancelled(ctx, args);
      const item = lookup(ctx, args.active.id);
      if (!item) return 'The item was dropped.';
      const dest = destination(ctx, item);
      if (!dest.move) return `${capital(item.label)} was dropped in its original position.`;
      return item.kind === 'cat' ? `Moved ${item.label}, ${dest.text}.` : `Moved ${item.label} to ${dest.text}.`;
    },
    onDragCancel: cancelled,
  };
}
