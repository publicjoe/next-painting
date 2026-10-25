import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useDndMonitor, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Model, StatusField } from '@/types';
import { DragHandle } from './DragHandle';
import { InlineEditText } from './InlineEditText';
import { MoveMenu, type MoveOption } from './MoveMenu';
import { useDragDrop } from './PaintDndProvider';
import { TrashIcon } from './icons';
import { dndId, parseDndId } from '@/lib/dnd-ids';
import { isComplete } from '@/lib/progress';
import { MAX_MODEL_COUNT } from '@/lib/validate';

/** A project a unit can be moved to, for the Move menu. */
export interface MoveTarget {
  id: string;
  /** The project's own name, spoken in the move announcement. */
  name: string;
  /** Distinguishes projects that share a name, for example "Boyz (Orks)". */
  label: string;
  /** Units it holds now, so the unit goes to the end. */
  count: number;
}

interface ModelTableProps {
  projectId: string;
  models: Model[];
  onAddModel: (projectId: string, name: string) => void;
  onUpdateModel: (model: Model) => void;
  onDeleteModel: (id: string) => void;
  onToggleStatus: (id: string, field: StatusField) => void;
  /** Every project, this one included, as a Move menu destination. */
  moveTargets: MoveTarget[];
  /** Positions count after the unit has been removed from its project. */
  onMoveModel: (id: string, toProjectId: string, toIndexInProject: number) => void;
}

interface StatusCheckboxProps {
  model: Model;
  field: StatusField;
  label: string;
  onToggle: (id: string, field: StatusField) => void;
}

// Status cells are tinted green when ticked and red when not. A unit with every
// stage ticked is complete, and its whole row is tinted green.
const GREEN = 'bg-green-600/40';
const statusCellClass = (ticked: boolean) =>
  `px-2 py-0.5 transition-colors ${ticked ? GREEN : 'bg-red-800/40'}`;
const rowCellClass = (base: string, m: Model) =>
  `${base} transition-colors ${isComplete(m) ? GREEN : ''}`;

// The box border is what marks the control against the red or green cell tint, so
// it is light enough for 3:1 on both (about 7:1 on red and 4.5:1 on green).
function StatusCheckbox({ model, field, label, onToggle }: StatusCheckboxProps) {
  return (
    <label className="flex items-center justify-center p-1 cursor-pointer group">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={model[field]}
        onChange={() => onToggle(model.id, field)}
      />
      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 ${
        model[field]
          ? 'bg-blue-500 border-zinc-100 text-white'
          : 'border-zinc-300 group-hover:border-white bg-zinc-900'
      }`}>
        {model[field] && (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className="sr-only">{`${label} - ${model.name}`}</span>
    </label>
  );
}

/** Pause after the last change before a draft is saved, so spinner and arrow-key edits are not lost. */
export const COUNT_COMMIT_MS = 600;

// Keeps what the user types as a draft, so the field can be cleared and retyped,
// and commits a whole number between 1 and MAX_MODEL_COUNT on blur, Enter or after
// a short pause (spinner and arrow keys change the value without a blur). Anything
// else (empty, "1e3", "-2") reverts to the stored count.
function CountInput({ model, onCommit }: { model: Model; onCommit: (count: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  // The last count this field saved, to tell its own save from an outside change
  const [saved, setSaved] = useState(model.count);
  const [seenCount, setSeenCount] = useState(model.count);
  // The count when the current edit began, so Escape can undo a pause-commit
  const [origin, setOrigin] = useState<number | null>(null);

  // An outside change (another tab, an import) replaces a stale draft
  if (seenCount !== model.count) {
    setSeenCount(model.count);
    if (model.count !== saved) setDraft(null);
    setSaved(model.count);
  }

  const parse = (text: string) => {
    const t = text.trim();
    return /^\d+$/.test(t) ? Math.min(MAX_MODEL_COUNT, Math.max(1, Number.parseInt(t, 10))) : null;
  };

  const save = (n: number) => {
    setSaved(n);
    if (n !== model.count) onCommit(n);
  };

  const commit = () => {
    if (draft === null) return;
    const n = parse(draft);
    if (n !== null) save(n);
    setDraft(null);
    setOrigin(null);
  };

  // Save a settled draft without ending the edit, so typing carries on undisturbed
  useEffect(() => {
    if (draft === null) return;
    const n = parse(draft);
    if (n === null) return;
    const timer = setTimeout(() => {
      save(n);
      // A capped or raised value (500 saved as the maximum) replaces what is shown
      if (String(n) !== draft.trim()) setDraft(String(n));
    }, COUNT_COMMIT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <input
      type="number"
      min="1"
      max={MAX_MODEL_COUNT}
      aria-label={`Count for ${model.name}`}
      className="bg-zinc-900 border border-zinc-600 rounded px-2 py-0.5 w-16 text-center text-zinc-100 focus:border-blue-500"
      value={draft ?? String(model.count)}
      onChange={(e) => {
        if (draft === null) setOrigin(model.count);
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          // Undo an edit that a pause already saved, then leave the field as it was
          if (origin !== null && origin !== model.count) save(origin);
          setDraft(null);
          setOrigin(null);
        }
      }}
    />
  );
}

// The insertion line is an inset shadow on the row's cells: a table row can hold only
// cells, so a positioned line element inside it would be invalid markup.
const LINE_ABOVE = '[&>td]:shadow-[inset_0_2px_0_0_#60a5fa]';
const LINE_BELOW = '[&>td]:shadow-[inset_0_-2px_0_0_#60a5fa]';

/** useSortable as a render prop, so the row can stay inline in the table's markup. */
function SortableItem({ id, data, children }: {
  id: string;
  data?: Record<string, unknown>;
  children: (sortable: ReturnType<typeof useSortable>) => ReactNode;
}) {
  const sortable = useSortable({ id, data });
  return <>{children(sortable)}</>;
}

export function ModelTable({
  projectId,
  models,
  onAddModel,
  onUpdateModel,
  onDeleteModel,
  onToggleStatus,
  moveTargets,
  onMoveModel,
}: ModelTableProps) {
  const [newModelName, setNewModelName] = useState('');
  // Result of the last Move menu move, spoken by the live region (a drop is spoken by dnd-kit)
  const [announcement, setAnnouncement] = useState('');
  const newUnitInput = useRef<HTMLInputElement>(null);
  // Set when a move may take the focused control away; see the effect below
  const focusAfterMove = useRef<{ id: string; index: number } | null>(null);

  // A unit dragged onto a project leaves this table, and a reorder can remount its row.
  // Either drops focus to <body>, so hand it to the unit that now holds the same place
  // (or the unit itself if it is still here). Only when focus really was lost, and only
  // once: a user who has since moved on keeps their place.
  useEffect(() => {
    const target = focusAfterMove.current;
    if (!target) return;
    focusAfterMove.current = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    const survivor = models.some(m => m.id === target.id)
      ? target.id
      : models[Math.min(target.index, models.length - 1)]?.id;
    const el = survivor === undefined
      ? newUnitInput.current
      : document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(`unit:${survivor}`)}"]`);
    el?.focus();
  });
  useDndMonitor({
    onDragEnd({ active }) {
      const item = parseDndId(active.id);
      const index = item?.kind === 'unit' ? models.findIndex(m => m.id === item.id) : -1;
      if (item && index !== -1) focusAfterMove.current = { id: item.id, index };
    },
  });

  // The unit table is itself a drop target: with no rows to aim at (an empty project)
  // it takes the unit, and among rows it makes a pointer in a gap land on the nearest.
  const { setNodeRef: setTableRef } = useDroppable({ id: dndId('ulist', projectId) });

  // Where the insertion line goes, from the same resolver the drop dispatches with.
  // A drop onto a sidebar project is outlined in the sidebar instead.
  const { dragItem, drop, move } = useDragDrop();
  const line: { before?: string; after?: string; empty?: boolean } = {};
  if (dragItem?.kind === 'unit' && move?.kind === 'unit' && move.toProjectId === projectId && drop && drop.over.kind !== 'proj') {
    const rest = models.filter(m => m.id !== dragItem.id);
    if (rest.length === 0) line.empty = true;
    else if (move.toIndexInProject < rest.length) line.before = rest[move.toIndexInProject].id;
    else line.after = rest[rest.length - 1].id;
  }

  // The Move menu calls the same handler as dragging. Indexes are positions after the
  // unit has been removed, so moving one place is index plus or minus one, and a move
  // to another project goes to its end.
  const moveUnit = (model: Model, toProjectId: string, toIndex: number) => {
    const target = moveTargets.find(t => t.id === toProjectId);
    if (!target) return;
    const total = toProjectId === projectId ? models.length : target.count + 1;
    focusAfterMove.current = { id: model.id, index: models.findIndex(m => m.id === model.id) };
    onMoveModel(model.id, toProjectId, toIndex);
    setAnnouncement(`Moved unit "${model.name}" to project "${target.name}", position ${toIndex + 1} of ${total}.`);
  };

  const unitMoveOptions = (model: Model, index: number): MoveOption[] => [
    { id: 'up', label: 'Move up', disabled: index === 0, onSelect: () => moveUnit(model, projectId, index - 1) },
    { id: 'down', label: 'Move down', disabled: index === models.length - 1, onSelect: () => moveUnit(model, projectId, index + 1) },
    ...moveTargets
      .filter(t => t.id !== projectId)
      .map(t => ({
        // Keyed by project id: two projects can share a name, even in one category
        id: `to:${t.id}`,
        label: `Move to ${t.label}`,
        onSelect: () => moveUnit(model, t.id, t.count),
      })),
  ];

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (newModelName.trim()) {
      onAddModel(projectId, newModelName.trim());
      setNewModelName('');
    }
  };

  return (
    <div className="bg-zinc-800/50 rounded-lg px-4 py-2 border border-zinc-700/50">
      <div ref={setTableRef} className="overflow-x-auto">
        <table className="w-full text-left text-sm text-zinc-400">
          <thead className="text-xs uppercase bg-zinc-800/80 text-zinc-300">
            <tr>
              <th className="w-full px-4 py-1.5 font-medium">Unit Name</th>
              <th className="px-4 py-1.5 font-medium text-center w-16">Count</th>
              <th className="px-4 py-1.5 font-medium text-center w-20">Built</th>
              <th className="px-4 py-1.5 font-medium text-center w-20">Primed</th>
              <th className="px-4 py-1.5 font-medium text-center w-20">Painted</th>
              <th className="px-4 py-1.5 font-medium text-center w-20">Based</th>
              <th className="px-4 py-1.5 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <SortableContext items={models.map(m => dndId('unit', m.id))} strategy={verticalListSortingStrategy}>
            {models.map((model, index) => (
              <SortableItem key={model.id} id={dndId('unit', model.id)} data={{ projectId }}>
                {sortable => (
                  <tr
                    ref={sortable.setNodeRef}
                    className={`bg-zinc-700 border-b border-zinc-500 hover:bg-zinc-600 transition-colors ${
                      sortable.isDragging ? 'opacity-50' : ''
                    } ${line.before === model.id ? LINE_ABOVE : line.after === model.id ? LINE_BELOW : ''}`}
                  >
                <td className={rowCellClass('px-4 py-0.5 font-medium text-zinc-100', model)}>
                  <div className="flex items-center gap-1">
                    <DragHandle
                      label={`Drag unit ${model.name}`}
                      attributes={sortable.attributes}
                      listeners={sortable.listeners}
                      setActivatorNodeRef={sortable.setActivatorNodeRef}
                    />
                    <InlineEditText
                      ariaLabel={`Name of ${model.name}`}
                      className="bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-blue-500 w-full"
                      value={model.name}
                      onCommit={(name) => onUpdateModel({ ...model, name })}
                    />
                  </div>
                </td>
                <td className={rowCellClass('px-4 py-0.5', model)}>
                  <div className="flex justify-center flex-col items-center">
                    <CountInput model={model} onCommit={(count) => onUpdateModel({ ...model, count })} />
                  </div>
                </td>
                <td className={statusCellClass(model.built)}><StatusCheckbox model={model} onToggle={onToggleStatus} field="built" label="Built" /></td>
                <td className={statusCellClass(model.primed)}><StatusCheckbox model={model} onToggle={onToggleStatus} field="primed" label="Primed" /></td>
                <td className={statusCellClass(model.painted)}><StatusCheckbox model={model} onToggle={onToggleStatus} field="painted" label="Painted" /></td>
                <td className={statusCellClass(model.based)}><StatusCheckbox model={model} onToggle={onToggleStatus} field="based" label="Based" /></td>
                <td className={rowCellClass('px-4 py-0.5 text-right', model)}>
                  <div className="flex items-center justify-end gap-1">
                    <MoveMenu
                      fixed
                      label={`Move unit ${model.name}`}
                      focusKey={`unit:${model.id}`}
                      options={unitMoveOptions(model, index)}
                    />
                    <button
                      type="button"
                      onClick={() => onDeleteModel(model.id)}
                      aria-label={`Delete unit ${model.name}`}
                      className="text-zinc-400 hover:text-red-400 p-1 transition-colors rounded-full hover:bg-zinc-700"
                      title="Delete Unit"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </td>
                  </tr>
                )}
              </SortableItem>
            ))}
            </SortableContext>
            {models.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className={`px-4 py-8 text-center text-zinc-400 italic ${line.empty ? 'ring-2 ring-inset ring-blue-400 bg-blue-400/10' : ''}`}
                >
                  No units in this project yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Spoken, not shown: the result of a Move menu move */}
      <div role="status" className="sr-only">{announcement}</div>

      {/* Add New Unit Form */}
      <form onSubmit={handleAdd} className="mt-4 flex gap-3 px-4">
        <input
          type="text"
          ref={newUnitInput}
          className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded-lg focus:border-blue-500 block p-2.5 placeholder:text-zinc-400"
          aria-label="New unit name"
          placeholder="New unit name..."
          value={newModelName}
          onChange={(e) => setNewModelName(e.target.value)}
        />
        <button
          type="submit"
          disabled={!newModelName.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white font-medium rounded-lg text-sm px-5 py-2.5 transition-colors shadow-lg shadow-blue-500/20"
        >
          Add Unit
        </button>
      </form>
    </div>
  );
}
