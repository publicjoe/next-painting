import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import type { Category, Model, Project } from '@/types';
import { dndId, parseDndId, type DndKind } from '@/lib/dnd-ids';
import {
  createAnnouncer,
  detectCollisions,
  KEYBOARD_CODES,
  keyboardScrollBehavior,
  pointerDrop,
  resolveDrop,
  screenReaderInstructions,
  stepKeyboardDrop,
  type Drop,
  type ResolvedDrop,
} from '@/lib/sidebar-dnd';
import { useHoverOpen } from '@/hooks/useHoverOpen';
import { findMoveClash, moveClashMessage } from '@/lib/names';
import { GripIcon } from './icons';

/** The item being dragged, by kind and real (not namespaced) id. */
export type DragItem = { kind: DndKind; id: string };

/**
 * What the provider needs to know about the sidebar's collapsed categories.
 * That state stays in the Sidebar; it registers these two functions here, and
 * the provider reads them when a drag needs them (never during a render).
 */
export interface SidebarHandle {
  isOpen: (categoryId: string) => boolean;
  open: (categoryId: string) => void;
  /** Shows why a drop was refused, where the sidebar shows its other name errors. */
  refuse: (message: string) => void;
}

interface DragDropValue {
  /** What is being dragged, or null. */
  dragItem: DragItem | null;
  /** The droppable the item is over, and whether it would land after it. */
  drop: Drop | null;
  /** The move a drop would make right now, from the same resolver the drop uses. */
  move: ResolvedDrop;
  /** The sidebar tells the provider how to read and change its collapsed categories. Returns an unregister function. */
  registerSidebar: (handle: SidebarHandle) => () => void;
}

const DragDropContext = createContext<DragDropValue>({
  dragItem: null,
  drop: null,
  move: null,
  registerSidebar: () => () => {},
});

/** The drag state shared by the sidebar and the unit table. */
export const useDragDrop = () => useContext(DragDropContext);

// A press on a grip that moves less than this is a click, not a drag
const POINTER_OPTIONS = { activationConstraint: { distance: 4 } };
// Measure droppables whenever they change, so lists that open mid-drag are measured
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };

interface PaintDndProviderProps {
  categories: Category[];
  projects: Project[];
  models: Model[];
  onMoveProject: (id: string, toCategoryId: string, toIndexInCategory: number) => void;
  onMoveCategory: (id: string, toIndex: number) => void;
  onMoveModel: (id: string, toProjectId: string, toIndexInProject: number) => void;
  children: ReactNode;
}

/**
 * The one drag and drop context for the whole screen. dnd-kit contexts cannot
 * see each other's draggables, and a unit row (in the main area) has to be
 * droppable on a project row (in the sidebar), so the context sits above both.
 *
 * dnd-kit reports what is under the dragged item; the drop position (`drop`) is
 * ours, and the move is dispatched once, on drop, through the same handlers as
 * the Move menus. The refs mirror state for dnd-kit's callbacks, which are
 * created once and must read the latest values.
 */
export function PaintDndProvider({
  categories,
  projects,
  models,
  onMoveProject,
  onMoveCategory,
  onMoveModel,
  children,
}: PaintDndProviderProps) {
  const sidebar = useRef<SidebarHandle | null>(null);
  const registerSidebar = useCallback((handle: SidebarHandle) => {
    sidebar.current = handle;
    return () => { if (sidebar.current === handle) sidebar.current = null; };
  }, []);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [drop, setDropState] = useState<Drop | null>(null);
  const dragItemRef = useRef<DragItem | null>(null);
  const dropRef = useRef<Drop | null>(null);
  const isKeyboardDrag = useRef(false);
  const isCancelled = useRef(false);
  const latest = useRef({ categories, projects, models });
  // A layout effect, so the keyboard stepper never reads data a frame late
  useLayoutEffect(() => { latest.current = { categories, projects, models }; });

  const setDrop = (next: Drop | null) => {
    dropRef.current = next;
    setDropState(next);
  };

  // With no sidebar mounted nothing is collapsed
  const isOpenNow = (openedId?: string) => (id: string) =>
    id === openedId || (sidebar.current?.isOpen(id) ?? true);

  // Arrow keys step through the drop positions in order (lib/sidebar-dnd.ts), which
  // reaches empty and closed categories that dnd-kit's geometric stepping skips.
  // The returned coordinates only move the overlay next to the chosen position;
  // collision detection reads the chosen drop directly for keyboard drags.
  const coordinateGetter = useCallback<KeyboardCoordinateGetter>((event, { context, currentCoordinates }) => {
    const direction = event.code === 'ArrowDown' ? 1 : event.code === 'ArrowUp' ? -1 : 0;
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') event.preventDefault();
    const item = dragItemRef.current;
    if (direction === 0 || !item) return undefined;
    event.preventDefault();
    const { categories: cats, projects: projs, models: units } = latest.current;
    const next = stepKeyboardDrop(cats, projs, item, isOpenNow(), dropRef.current, direction, units);
    if (!next) return undefined;
    dropRef.current = next;
    setDropState(next);
    const rect = context.droppableRects.get(dndId(next.over.kind, next.over.id));
    if (!rect) return { x: currentCoordinates.x, y: currentCoordinates.y + direction };
    // Slots that append (a list, a header, a project row for a unit) have no line to aim at
    const appends = next.over.kind === 'list' || next.over.kind === 'hdr' || next.over.kind === 'ulist' || (item.kind === 'unit' && next.over.kind === 'proj');
    const lineY = appends ? rect.top + rect.height / 2 : next.after ? rect.bottom : rect.top;
    return { x: currentCoordinates.x, y: lineY - (context.collisionRect?.height ?? 0) / 2 };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_OPTIONS),
    useSensor(KeyboardSensor, useMemo(() => ({
      coordinateGetter,
      keyboardCodes: KEYBOARD_CODES,
      // A getter, read by the sensor on each key, so a change to the motion setting applies at once
      get scrollBehavior() { return keyboardScrollBehavior(); },
    }), [coordinateGetter])),
  );
  const collisionDetection = useCallback<CollisionDetection>(args => detectCollisions(args, dropRef.current), []);
  // The announcer keeps one piece of state (the last position spoken) across a drag
  const [announcer] = useState(createAnnouncer);
  const accessibility = useMemo(() => {
    const now = () => ({ ...latest.current, drop: dropRef.current, cancelled: isCancelled.current });
    const announcements: Announcements = {
      onDragStart: args => announcer.onDragStart(now(), args),
      onDragOver: args => announcer.onDragOver(now(), args),
      onDragMove: args => announcer.onDragMove(now(), args),
      onDragEnd: args => announcer.onDragEnd(now(), args),
      onDragCancel: args => announcer.onDragCancel(now(), args),
    };
    return {
      announcements,
      screenReaderInstructions,
      // Outside the sidebar, so its status region is not confused with the Move menu's.
      // Nothing here renders until PaintLogApp has loaded, which is in the browser.
      container: typeof document === 'undefined' ? undefined : document.body,
    };
  }, [announcer]);

  const finishDrag = () => {
    dragItemRef.current = null;
    setDragItem(null);
    // dropRef is kept: dnd-kit's drop announcement reads it after this runs
    setDropState(null);
    isKeyboardDrag.current = false;
    // isCancelled is kept for the drop announcement too; the next drag start clears it
  };

  const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const item = parseDndId(active.id);
    if (!item || (item.kind !== 'proj' && item.kind !== 'cat' && item.kind !== 'unit')) return;
    dragItemRef.current = item;
    setDragItem(item);
    isCancelled.current = false;
    isKeyboardDrag.current = activatorEvent instanceof KeyboardEvent;
    // A keyboard drag starts at the item's own place; a pointer drag at whatever is under it
    setDrop(isKeyboardDrag.current ? stepKeyboardDrop(categories, projects, item, isOpenNow(), null, 0, models) : null);
  };

  // Pointer drags: the drop is the droppable under the pointer, and the pointer's
  // half of it decides before or after. Keyboard drags set the drop themselves.
  const handleDragMove = ({ over, activatorEvent, active }: DragMoveEvent) => {
    if (isKeyboardDrag.current || !dragItemRef.current) return;
    const next = pointerDrop(over, activatorEvent, active.rect.current);
    const current = dropRef.current;
    if (!next) {
      if (current) setDrop(null);
      return;
    }
    if (!current || current.over.kind !== next.over.kind || current.over.id !== next.over.id || current.after !== next.after) {
      setDrop(next);
    }
  };

  const handleDragEnd = () => {
    const item = dragItemRef.current;
    const wasCancelled = isCancelled.current;
    finishDrag();
    if (!item || wasCancelled) return;
    const move = resolveDrop(categories, projects, item, dropRef.current, models);
    if (move?.kind === 'proj') {
      // A project may not join a category that already holds one of the same name. The
      // announcer has already said so (lib/sidebar-dnd.ts); this adds the visible message.
      const clash = findMoveClash(projects, item.id, move.toCategoryId);
      if (clash) {
        const project = projects.find(p => p.id === item.id);
        const target = categories.find(c => c.id === move.toCategoryId);
        if (project && target) sidebar.current?.refuse(moveClashMessage(project, target.name, clash));
        return;
      }
      // Open a closed target so the moved row is visible and focus can return to it
      sidebar.current?.open(move.toCategoryId);
      onMoveProject(item.id, move.toCategoryId, move.toIndexInCategory);
    } else if (move?.kind === 'cat') {
      onMoveCategory(item.id, move.toIndex);
    } else if (move?.kind === 'unit') {
      onMoveModel(item.id, move.toProjectId, move.toIndexInProject);
    }
  };

  // Another tab can replace the data mid-drag (REPLACE_STATE). If the dragged item
  // or its target has gone, cancel. dnd-kit has no cancel call, but both of its
  // sensors cancel on an Escape keydown on the document; isCancelled guards the
  // drop in case that keydown never reaches a sensor.
  useEffect(() => {
    if (!dragItem) return;
    const exists = (o: { kind: DndKind; id: string }) => {
      if (o.kind === 'unit') return models.some(m => m.id === o.id);
      if (o.kind === 'proj' || o.kind === 'ulist') return projects.some(p => p.id === o.id);
      return categories.some(c => c.id === o.id); // cat, hdr and list ids are category ids
    };
    const target = dropRef.current?.over;
    if (exists(dragItem) && (!target || exists(target))) return;
    isCancelled.current = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
  }, [dragItem, categories, projects, models]);

  // A project or unit resting on a closed category opens it, so its projects become
  // targets. The category stays open after the drop or a cancel. A keyboard drag
  // keeps its place: the end of that category for a project, the first project of it for a unit.
  useHoverOpen({
    overId: (dragItem?.kind === 'proj' || dragItem?.kind === 'unit') && drop?.over.kind === 'hdr' ? drop.over.id : null,
    isOpenable: id => sidebar.current?.isOpen(id) === false && categories.some(c => c.id === id),
    onOpen: id => {
      sidebar.current?.open(id);
      const item = dragItemRef.current;
      if (isKeyboardDrag.current && item) {
        const { categories: cats, projects: projs, models: units } = latest.current;
        setDrop(stepKeyboardDrop(cats, projs, item, isOpenNow(id), dropRef.current, 0, units));
      }
    },
  });

  const move = dragItem ? resolveDrop(categories, projects, dragItem, drop, models) : null;
  const dragName =
    dragItem?.kind === 'proj' ? projects.find(p => p.id === dragItem.id)?.name
    : dragItem?.kind === 'unit' ? models.find(m => m.id === dragItem.id)?.name
    : categories.find(c => c.id === dragItem?.id)?.name;

  const value = useMemo(() => ({ dragItem, drop, move, registerSidebar }), [dragItem, drop, move, registerSidebar]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={MEASURING}
      accessibility={accessibility}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={finishDrag}
    >
      <DragDropContext.Provider value={value}>
        {children}
      </DragDropContext.Provider>
      {/* Follows the pointer above the scroll containers, which would clip the row itself */}
      <DragOverlay dropAnimation={null}>
        {dragItem ? (
          <div
            data-drag-overlay=""
            aria-hidden="true"
            className="flex items-center gap-1 rounded-lg bg-zinc-700 px-2 py-1 text-sm text-zinc-100 shadow-lg ring-1 ring-blue-400"
          >
            <GripIcon />
            <span className="truncate">{dragName ?? ''}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
