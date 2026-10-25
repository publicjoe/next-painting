import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Category, Model, Project } from '@/types';
import { getProjectProgress } from '@/lib/progress';
import { dndId } from '@/lib/dnd-ids';
import {
  categoryClashMessage,
  categoryRenameRefusedMessage,
  findCategoryClash,
  findCategoryRenameClash,
  findMoveClash,
  moveClashMessage,
} from '@/lib/names';
import { useDragDrop } from './PaintDndProvider';
import { DragHandle } from './DragHandle';
import { InlineEditText } from './InlineEditText';
import { MoveMenu, type MoveOption } from './MoveMenu';
import { TrashIcon } from './icons';

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

  // Category names must be unique, compared as in lib/names.ts (the reducer refuses
  // a clash too). The buttons are labelled by name, so two identical ones are ambiguous.
  const isNameTaken = (name: string) => !!findCategoryClash(categories, name);

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (isNameTaken(newCatName)) {
      setNameError(categoryClashMessage(newCatName));
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
    // A project may not join a category that already holds one of the same name. Nothing
    // moves; the reason goes to the alert, which the menu's focus return leaves alone.
    const clash = findMoveClash(projects, project.id, toCategoryId);
    if (clash) {
      setNameError(moveClashMessage(project, target.name, clash));
      return;
    }
    setNameError(null);
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

  // Drag and drop lives in PaintDndProvider, which wraps this sidebar and the unit
  // table so a unit can be dropped on a project. The collapse state stays here, so
  // the sidebar registers what the provider needs: whether a category is open (for
  // the keyboard stepper and the hover-open) and a way to open one.
  const { dragItem, drop, move, registerSidebar } = useDragDrop();
  useLayoutEffect(() => registerSidebar({
    isOpen: id => !isClosed(collapsed, id),
    open: id => setCollapsed(prev => (isClosed(prev, id) ? { ...prev, [id]: false } : prev)),
    refuse: message => setNameError(message),
  }), [collapsed, registerSidebar]);

  // A refusal left by an earlier drop goes when the next drag starts. Adjusted while
  // rendering, as for the expand request, so a refusal set at the end of a drag stays.
  const [wasDragging, setWasDragging] = useState(false);
  if ((dragItem !== null) !== wasDragging) {
    setWasDragging(dragItem !== null);
    if (dragItem !== null && nameError) setNameError(null);
  }

  // Where the indicator goes, from the same resolver the drop dispatches with
  const indicator: { before?: string; after?: string; list?: string; header?: string; project?: string } = {};
  // A refused project move (it would clash on name) shows no line: nothing would land there
  const refusedMove = dragItem?.kind === 'proj' && move?.kind === 'proj' && !!findMoveClash(projects, dragItem.id, move.toCategoryId);
  if (dragItem?.kind === 'proj' && move?.kind === 'proj' && !refusedMove) {
    const rest = projects.filter(p => p.categoryId === move.toCategoryId && p.id !== dragItem.id);
    if (isClosed(collapsed, move.toCategoryId)) indicator.header = move.toCategoryId;
    else if (rest.length === 0) indicator.list = move.toCategoryId;
    else if (move.toIndexInCategory < rest.length) indicator.before = dndId('proj', rest[move.toIndexInCategory].id);
    else indicator.after = dndId('proj', rest[rest.length - 1].id);
  } else if (dragItem?.kind === 'cat' && move?.kind === 'cat') {
    const rest = categories.filter(c => c.id !== dragItem.id);
    if (move.toIndex < rest.length) indicator.before = dndId('cat', rest[move.toIndex].id);
    else indicator.after = dndId('cat', rest[rest.length - 1].id);
  } else if (dragItem?.kind === 'unit' && move?.kind === 'unit' && drop?.over.kind === 'proj') {
    // A unit dropped on a project goes to its end, so the whole row is outlined, not a line
    indicator.project = drop.over.id;
  }
  const isCategoryDrag = dragItem?.kind === 'cat';
  const isProjectDrag = dragItem?.kind === 'proj';

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
                        if (findCategoryRenameClash(categories, cat, name)) {
                          // Stay in edit mode so the typed name can be corrected
                          refusedRename.current = true;
                          // The blur that triggered this commit has just removed focus; put it back
                          setTimeout(() => renameInput.current?.focus(), 0);
                          setNameError(categoryRenameRefusedMessage(name, cat.name));
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
                        <li
                          ref={row.setNodeRef}
                          className={`relative flex items-center gap-1 ${row.isDragging ? 'opacity-50' : ''} ${
                            indicator.project === project.id ? 'rounded ring-2 ring-inset ring-blue-400' : ''
                          }`}
                        >
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
