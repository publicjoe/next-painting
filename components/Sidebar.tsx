import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Category, Model, Project } from '@/types';
import { getProjectProgress } from '@/lib/progress';
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
} from '@/lib/sidebar-dnd';
import { useHoverOpen } from '@/hooks/useHoverOpen';
import { DragHandle } from './DragHandle';
import { InlineEditText } from './InlineEditText';
import { MoveMenu, type MoveOption } from './MoveMenu';
import { GripIcon, TrashIcon } from './icons';

interface SidebarProps {
  categories: Category[];
  projects: Project[];
  modelsByProject: Map<string, Model[]>;
  selectedCategoryId: string | null;
  selectedProjectId: string | null;
  onSelectCategory: (id: string) => void;
  onSelectProject: (categoryId: string, projectId: string) => void;
  onAddCategory: (name: string) => void;
  onRenameCategory: (id: string, name: string) => void;
  onDeleteCategory: (id: string) => void;
  onMoveProject: (id: string, toCategoryId: string, toIndexInCategory: number) => void;
  onMoveCategory: (id: string, toIndex: number) => void;
  /** A category to open (for example after a project moves into it); onExpanded is called once it has. */
  expandCategoryId: string | null;
  onExpanded: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

/** Where focus should land once the render that removed the focused control has committed. */
type FocusTarget =
  | { kind: 'category'; id: string }
  | { kind: 'newCategory'; knownIds: Set<string> }
  | { kind: 'addButton' }
  | { kind: 'move'; key: string };

/**
 * Whether a category is collapsed. An own-property check, because category ids
 * come from imported data and an id such as "constructor" would otherwise read
 * an inherited function, which is truthy.
 */
const isClosed = (collapsed: Record<string, boolean>, id: string) => Object.hasOwn(collapsed, id) && collapsed[id];

/** The item being dragged, by kind and real (not namespaced) id. */
type DragItem = { kind: DndKind; id: string };

// A press on a grip that moves less than this is a click, not a drag
const POINTER_OPTIONS = { activationConstraint: { distance: 4 } };
// Measure droppables whenever they change, so lists that open mid-drag are measured
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };

/** useSortable as a render prop, so rows can stay inline in the Sidebar's markup. */
function SortableItem({ id, data, children }: {
  id: string;
  data?: Record<string, unknown>;
  children: (sortable: ReturnType<typeof useSortable>) => ReactNode;
}) {
  const sortable = useSortable({ id, data });
  return <>{children(sortable)}</>;
}

/** useDroppable as a render prop, for a category's list and its header. */
function DroppableArea({ id, disabled, children }: {
  id: string;
  disabled: boolean;
  children: (droppable: ReturnType<typeof useDroppable>) => ReactNode;
}) {
  const droppable = useDroppable({ id, disabled });
  return <>{children(droppable)}</>;
}

/** The insertion line shown while dragging. Decorative: the live region speaks the position. */
function DropLine({ edge }: { edge: 'top' | 'bottom' }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 h-0.5 rounded bg-blue-400 ${edge === 'top' ? '-top-0.5' : '-bottom-0.5'}`}
    />
  );
}

export function Sidebar({
  categories,
  projects,
  modelsByProject,
  selectedCategoryId,
  selectedProjectId,
  onSelectCategory,
  onSelectProject,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onMoveProject,
  onMoveCategory,
  expandCategoryId,
  onExpanded,
  onExport,
  onImport,
}: SidebarProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  // Shown when an add or rename is refused because the name is already used
  const [nameError, setNameError] = useState<string | null>(null);
  // Categories are expanded unless collapsed here; not persisted
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const categoryButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusTarget = useRef<FocusTarget | null>(null);
  const refusedRename = useRef(false);
  const renameInput = useRef<HTMLInputElement>(null);
  // Result of the last move, spoken by the live region
  const [announcement, setAnnouncement] = useState('');

  // Adding or renaming unmounts the control that held focus, which drops it to
  // <body>. Hand it to the logical successor, but only when focus really was
  // lost: a user who tabbed or clicked elsewhere keeps their place.
  // Caveat: the activeElement === body guard has only been tested in Chromium. Safari
  // does not give focus to a clicked button, so its activeElement can differ after a
  // mouse-driven rename and this restore may not run there.
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    let el: HTMLButtonElement | null | undefined;
    if (target.kind === 'addButton') el = addButton.current;
    else if (target.kind === 'category') el = categoryButtons.current.get(target.id);
    else if (target.kind === 'move') {
      el = document.querySelector<HTMLButtonElement>(`[data-focus-key="${CSS.escape(target.key)}"]`);
    }
    else {
      const added = categories.find(c => !target.knownIds.has(c.id));
      el = added && categoryButtons.current.get(added.id);
    }
    if (el && (!document.activeElement || document.activeElement === document.body)) el.focus();
  });

  // The parent asks for a category to be opened (collapse state is private here).
  // Opening it while rendering, when the request changes, avoids an extra render
  // pass; the effect then tells the parent the request has been handled.
  const [lastExpandRequest, setLastExpandRequest] = useState<string | null>(null);
  if (expandCategoryId !== lastExpandRequest) {
    setLastExpandRequest(expandCategoryId);
    if (expandCategoryId !== null) setCollapsed(prev => ({ ...prev, [expandCategoryId]: false }));
  }
  useEffect(() => {
    if (expandCategoryId !== null) onExpanded();
  }, [expandCategoryId, onExpanded]);

  // Category names must be unique (ignoring case, surrounding spaces and Unicode
  // composition, so "Cafe" with a combining accent matches the composed form), because
  // the buttons are labelled by name and two identical ones are ambiguous.
  const canonical = (name: string) => name.trim().normalize('NFC').toLowerCase();
  const isNameTaken = (name: string, exceptId?: string) => {
    const wanted = canonical(name);
    return categories.some(c => c.id !== exceptId && canonical(c.name) === wanted);
  };

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (isNameTaken(newCatName)) {
      setNameError(`A category named "${newCatName.trim()}" already exists.`);
      return;
    }
    if (newCatName.trim()) {
      setNameError(null);
      focusTarget.current = { kind: 'newCategory', knownIds: new Set(categories.map(c => c.id)) };
      onAddCategory(newCatName.trim());
      setNewCatName('');
      setIsAdding(false);
    }
  };

  const toggleCollapsed = (id: string) => setCollapsed(prev => ({ ...prev, [id]: !isClosed(prev, id) }));

  const selectCategory = (id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: false })); // a newly selected category opens
    setNameError(null);
    onSelectCategory(id);
  };

  // The Move menu calls the same handlers as dragging. Indexes are positions after
  // the item has been removed, so moving one place is index plus or minus one.
  // If a project changes category its Move button remounts, so ask for focus back.
  const moveProject = (project: Project, toCategoryId: string, toIndex: number) => {
    const target = categories.find(c => c.id === toCategoryId);
    if (!target) return;
    const inTarget = projects.filter(p => p.categoryId === toCategoryId && p.id !== project.id).length;
    focusTarget.current = { kind: 'move', key: `project:${project.id}` };
    // The target's list may be collapsed (hidden), which would leave nothing to focus
    if (toCategoryId !== project.categoryId) setCollapsed(prev => ({ ...prev, [toCategoryId]: false }));
    onMoveProject(project.id, toCategoryId, toIndex);
    setAnnouncement(`Moved project "${project.name}" to category "${target.name}", position ${toIndex + 1} of ${inTarget + 1}.`);
  };

  const moveCategory = (category: Category, toIndex: number) => {
    focusTarget.current = { kind: 'move', key: `category:${category.id}` };
    onMoveCategory(category.id, toIndex);
    setAnnouncement(`Moved category "${category.name}", position ${toIndex + 1} of ${categories.length}.`);
  };

  const projectMoveOptions = (project: Project, index: number, siblings: number): MoveOption[] => [
    { id: 'up', label: 'Move up', disabled: index === 0, onSelect: () => moveProject(project, project.categoryId, index - 1) },
    { id: 'down', label: 'Move down', disabled: index === siblings - 1, onSelect: () => moveProject(project, project.categoryId, index + 1) },
    ...categories
      .filter(c => c.id !== project.categoryId)
      .map(c => ({
        // Keyed by category id: imported data can hold two categories with one name
        id: `to:${c.id}`,
        label: `Move to ${c.name}`,
        onSelect: () => moveProject(project, c.id, projects.filter(p => p.categoryId === c.id).length),
      })),
  ];

  const categoryMoveOptions = (category: Category, index: number): MoveOption[] => [
    { id: 'up', label: 'Move up', disabled: index === 0, onSelect: () => moveCategory(category, index - 1) },
    { id: 'down', label: 'Move down', disabled: index === categories.length - 1, onSelect: () => moveCategory(category, index + 1) },
  ];

  // Drag and drop. dnd-kit reports what is under the dragged item; the drop
  // position (`drop`) is ours, and the move is dispatched once, on drop, through
  // the same handlers as the Move menu. The refs mirror state for dnd-kit's
  // callbacks, which are created once and must read the latest values.
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [drop, setDropState] = useState<Drop | null>(null);
  const dragItemRef = useRef<DragItem | null>(null);
  const dropRef = useRef<Drop | null>(null);
  const isKeyboardDrag = useRef(false);
  const isCancelled = useRef(false);
  const latest = useRef({ categories, projects, collapsed });
  // A layout effect, so the keyboard stepper never reads collapse state a frame
  // late (for example straight after a hover-open)
  useLayoutEffect(() => { latest.current = { categories, projects, collapsed }; });

  const setDrop = (next: Drop | null) => {
    dropRef.current = next;
    setDropState(next);
  };

  const isOpenNow = (openedId?: string) => (id: string) => id === openedId || !isClosed(latest.current.collapsed, id);

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
    const { categories: cats, projects: projs } = latest.current;
    const next = stepKeyboardDrop(cats, projs, item, isOpenNow(), dropRef.current, direction);
    if (!next) return undefined;
    dropRef.current = next;
    setDropState(next);
    const rect = context.droppableRects.get(dndId(next.over.kind, next.over.id));
    if (!rect) return { x: currentCoordinates.x, y: currentCoordinates.y + direction };
    const lineY = next.over.kind === 'list' || next.over.kind === 'hdr' ? rect.top + rect.height / 2 : next.after ? rect.bottom : rect.top;
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
    // The sidebar only renders in the browser (PaintLogApp waits for localStorage).
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
    if (!item || (item.kind !== 'proj' && item.kind !== 'cat')) return;
    dragItemRef.current = item;
    setDragItem(item);
    isCancelled.current = false;
    isKeyboardDrag.current = activatorEvent instanceof KeyboardEvent;
    // A keyboard drag starts at the item's own place; a pointer drag at whatever is under it
    setDrop(isKeyboardDrag.current ? stepKeyboardDrop(categories, projects, item, isOpenNow(), null, 0) : null);
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
    const move = resolveDrop(categories, projects, item, dropRef.current);
    if (move?.kind === 'proj') {
      // Open a closed target so the moved row is visible and focus can return to it
      setCollapsed(prev => (isClosed(prev, move.toCategoryId) ? { ...prev, [move.toCategoryId]: false } : prev));
      onMoveProject(item.id, move.toCategoryId, move.toIndexInCategory);
    } else if (move?.kind === 'cat') {
      onMoveCategory(item.id, move.toIndex);
    }
  };

  // Another tab can replace the data mid-drag (REPLACE_STATE). If the dragged item
  // or its target has gone, cancel. dnd-kit has no cancel call, but both of its
  // sensors cancel on an Escape keydown on the document; isCancelled guards the
  // drop in case that keydown never reaches a sensor.
  useEffect(() => {
    if (!dragItem) return;
    const exists = (o: DragItem) =>
      o.kind === 'proj' ? projects.some(p => p.id === o.id) : categories.some(c => c.id === o.id);
    const target = dropRef.current?.over;
    if (exists(dragItem) && (!target || exists(target))) return;
    isCancelled.current = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
  }, [dragItem, categories, projects]);

  // A project resting on a closed category opens it. The category stays open
  // after the drop or a cancel. A keyboard drag keeps its place: the end of that category.
  useHoverOpen({
    overId: dragItem?.kind === 'proj' && drop?.over.kind === 'hdr' ? drop.over.id : null,
    isOpenable: id => isClosed(collapsed, id) && categories.some(c => c.id === id),
    onOpen: id => {
      setCollapsed(prev => ({ ...prev, [id]: false }));
      const item = dragItemRef.current;
      if (isKeyboardDrag.current && item) {
        const { categories: cats, projects: projs } = latest.current;
        setDrop(stepKeyboardDrop(cats, projs, item, isOpenNow(id), dropRef.current, 0));
      }
    },
  });

  // Where the indicator goes, from the same resolver the drop dispatches with
  const move = dragItem ? resolveDrop(categories, projects, dragItem, drop) : null;
  const indicator: { before?: string; after?: string; list?: string; header?: string } = {};
  if (dragItem && move?.kind === 'proj') {
    const rest = projects.filter(p => p.categoryId === move.toCategoryId && p.id !== dragItem.id);
    if (isClosed(collapsed, move.toCategoryId)) indicator.header = move.toCategoryId;
    else if (rest.length === 0) indicator.list = move.toCategoryId;
    else if (move.toIndexInCategory < rest.length) indicator.before = dndId('proj', rest[move.toIndexInCategory].id);
    else indicator.after = dndId('proj', rest[rest.length - 1].id);
  } else if (dragItem && move?.kind === 'cat') {
    const rest = categories.filter(c => c.id !== dragItem.id);
    if (move.toIndex < rest.length) indicator.before = dndId('cat', rest[move.toIndex].id);
    else indicator.after = dndId('cat', rest[rest.length - 1].id);
  }
  const isCategoryDrag = dragItem?.kind === 'cat';
  const isProjectDrag = dragItem?.kind === 'proj';
  const dragName = dragItem?.kind === 'proj'
    ? projects.find(p => p.id === dragItem.id)?.name
    : categories.find(c => c.id === dragItem?.id)?.name;

  const cancelAdd = () => {
    focusTarget.current = { kind: 'addButton' };
    setNameError(null);
    setNewCatName('');
    setIsAdding(false);
  };

  return (
    <aside className="w-full md:w-96 bg-zinc-800 border-b md:border-b-0 md:border-r border-zinc-700 flex flex-col md:h-full max-h-[40vh] md:max-h-none overflow-y-auto md:overflow-visible">
      <div className="p-4 border-b border-zinc-700">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
          Painting Log
        </h1>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <h2 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold mb-3">
          Categories
        </h2>
        
        <nav aria-label="Categories">
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
          <SortableContext items={categories.map(c => dndId('cat', c.id))} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {categories.map((cat, catIndex) => {
              const isOpen = !isClosed(collapsed, cat.id);
              const listId = `category-projects-${cat.id}`;
              const catProjects = projects.filter(p => p.categoryId === cat.id);
              // Items of a closed list are unmounted, not hidden, so they register no
              // droppables (a hidden element measures as a zero rectangle at the origin).
              // While a category is dragged every list closes, so categories are all it can hit.
              const showProjects = isOpen && !isCategoryDrag;
              return (
              <SortableItem key={cat.id} id={dndId('cat', cat.id)}>
                {({ setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging }) => (
              <li ref={setNodeRef} className={`relative ${isDragging ? 'opacity-50' : ''}`}>
                {indicator.before === dndId('cat', cat.id) && <DropLine edge="top" />}
                {indicator.after === dndId('cat', cat.id) && <DropLine edge="bottom" />}
                {/* A closed category's header is a drop target: dropping there appends */}
                <DroppableArea id={dndId('hdr', cat.id)} disabled={isOpen}>
                  {header => (
                <div
                  ref={header.setNodeRef}
                  className={`group flex items-center justify-between rounded-lg transition-colors ${
                    selectedCategoryId === cat.id
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'hover:bg-zinc-700/50 text-zinc-300'
                  } ${indicator.header === cat.id ? 'ring-2 ring-inset ring-blue-400' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(cat.id)}
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    aria-label={`${isOpen ? 'Collapse' : 'Expand'} projects in ${cat.name}`}
                    className="p-2 ml-1 rounded hover:text-blue-300"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <DragHandle
                    label={`Drag ${cat.name}`}
                    attributes={attributes}
                    listeners={listeners}
                    setActivatorNodeRef={setActivatorNodeRef}
                  />
                  {editingId === cat.id ? (
                    <InlineEditText
                      autoFocus
                      inputRef={renameInput}
                      ariaLabel={`Category name: ${cat.name}`}
                      className="flex-1 min-w-0 m-1 bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded p-1 focus:border-blue-500"
                      value={cat.name}
                      onCommit={(name) => {
                        if (isNameTaken(name, cat.id)) {
                          // Stay in edit mode so the typed name can be corrected
                          refusedRename.current = true;
                          // The blur that triggered this commit has just removed focus; put it back
                          setTimeout(() => renameInput.current?.focus(), 0);
                          setNameError(`A category named "${name.trim()}" already exists, so "${cat.name}" was not renamed. Edit the name or press Escape.`);
                          return;
                        }
                        setNameError(null);
                        onRenameCategory(cat.id, name);
                      }}
                      onFinish={() => {
                        if (refusedRename.current) {
                          refusedRename.current = false;
                          return;
                        }
                        setNameError(null);
                        focusTarget.current = { kind: 'category', id: cat.id };
                        setEditingId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) categoryButtons.current.set(cat.id, el);
                        else categoryButtons.current.delete(cat.id);
                      }}
                      onClick={() => selectCategory(cat.id)}
                      aria-current={selectedCategoryId === cat.id ? 'true' : undefined}
                      className="flex-1 min-w-0 text-left p-2 rounded-lg truncate"
                    >
                      {cat.name}
                    </button>
                  )}
                  <MoveMenu
                    label={`Move category ${cat.name}`}
                    focusKey={`category:${cat.id}`}
                    options={categoryMoveOptions(cat, catIndex)}
                  />
                  <button
                    type="button"
                    onClick={() => { setNameError(null); setEditingId(cat.id); }}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 p-2 hover:text-blue-300 transition-opacity"
                    title="Rename Category"
                    aria-label={`Rename category ${cat.name}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.768-6.768a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNameError(null); onDeleteCategory(cat.id); }}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 p-2 mr-1 hover:text-red-400 transition-opacity"
                    title="Delete Category"
                    aria-label={`Delete category ${cat.name}`}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                  )}
                </DroppableArea>
                <DroppableArea id={dndId('list', cat.id)} disabled={!showProjects}>
                  {list => (
                <ul
                  ref={list.setNodeRef}
                  id={listId}
                  hidden={!showProjects}
                  aria-label={`Projects in ${cat.name}`}
                  className="ml-9 mr-1 mt-1 space-y-0.5"
                >
                  {!showProjects ? null : catProjects.length === 0 ? (
                    // A tall drop zone, since a one-line row is a small target
                    <li
                      className={`flex min-h-10 items-center rounded border border-dashed px-2 text-xs text-zinc-400 ${
                        indicator.list === cat.id
                          ? 'border-blue-400 bg-blue-400/10'
                          : isProjectDrag ? 'border-zinc-500' : 'border-transparent'
                      }`}
                    >
                      No projects
                    </li>
                  ) : (
                    <SortableContext items={catProjects.map(p => dndId('proj', p.id))} strategy={verticalListSortingStrategy}>
                    {catProjects.map((project, projectIndex) => {
                      const { completedCount, totalCount } = getProjectProgress(modelsByProject.get(project.id) ?? []);
                      const isSelected = selectedProjectId === project.id;
                      const id = dndId('proj', project.id);
                      return (
                        <SortableItem key={project.id} id={id} data={{ categoryId: cat.id }}>
                          {row => (
                        <li ref={row.setNodeRef} className={`relative flex items-center gap-1 ${row.isDragging ? 'opacity-50' : ''}`}>
                          {indicator.before === id && <DropLine edge="top" />}
                          {indicator.after === id && <DropLine edge="bottom" />}
                          <DragHandle
                            label={`Drag ${project.name}`}
                            attributes={row.attributes}
                            listeners={row.listeners}
                            setActivatorNodeRef={row.setActivatorNodeRef}
                          />
                          <button
                            type="button"
                            onClick={() => onSelectProject(cat.id, project.id)}
                            aria-current={isSelected ? 'true' : undefined}
                            className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm ${
                              isSelected
                                ? 'bg-zinc-600 text-zinc-50 font-medium ring-1 ring-inset ring-zinc-400'
                                : 'text-zinc-300 hover:bg-zinc-700/50'
                            }`}
                          >
                            <span className="min-w-0 truncate">{project.name}</span>
                            <span className="sr-only">{`, ${completedCount} of ${totalCount} units completed`}</span>
                            <span className={`shrink-0 text-xs ${isSelected ? 'text-zinc-100' : 'text-zinc-400'}`} aria-hidden="true">
                              {completedCount}/{totalCount}
                            </span>
                          </button>
                          <MoveMenu
                            label={`Move project ${project.name}`}
                            focusKey={`project:${project.id}`}
                            options={projectMoveOptions(project, projectIndex, catProjects.length)}
                          />
                        </li>
                          )}
                        </SortableItem>
                      );
                    })}
                    </SortableContext>
                  )}
                </ul>
                  )}
                </DroppableArea>
              </li>
                )}
              </SortableItem>
              );
            })}
          </ul>
          </SortableContext>
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
        </nav>

        {/* Spoken, not shown: the result of a move */}
        <div role="status" className="sr-only">{announcement}</div>

        {nameError && (
          <p role="alert" className="mt-2 rounded bg-red-900/60 px-3 py-2 text-xs text-red-100">{nameError}</p>
        )}

        {!isAdding ? (
          <button
            type="button"
            ref={addButton}
            onClick={() => setIsAdding(true)}
            className="flex items-center space-x-2 text-zinc-400 hover:text-zinc-200 w-full p-2 rounded-lg transition-colors mt-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span>Add Category</span>
          </button>
        ) : (
          <form onSubmit={handleAdd} className="mt-2 space-y-2">
            <input
              type="text"
              autoFocus
              className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded-lg focus:border-blue-500 block p-2 placeholder:text-zinc-400"
              aria-label="New category name"
              placeholder="Category name"
              value={newCatName}
              onChange={(e) => { setNewCatName(e.target.value); setNameError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelAdd();
              }}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!newCatName.trim()}
                className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white text-sm py-1.5 transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={cancelAdd}
                className="flex-1 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 text-sm py-1.5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="p-4 border-t border-zinc-700 flex gap-2 text-sm">
        <button
          type="button"
          onClick={onExport}
          className="flex-1 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 py-1.5 transition-colors"
        >
          Export
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex-1 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 py-1.5 transition-colors"
        >
          Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Import data file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
            e.target.value = '';
          }}
        />
      </div>
    </aside>
  );
}
