import { useEffect, useState, type FormEvent } from 'react';
import type { Model, StatusField } from '@/types';
import { InlineEditText } from './InlineEditText';
import { TrashIcon } from './icons';
import { isComplete } from '@/lib/progress';
import { MAX_MODEL_COUNT } from '@/lib/validate';

interface ModelTableProps {
  projectId: string;
  models: Model[];
  onAddModel: (projectId: string, name: string) => void;
  onUpdateModel: (model: Model) => void;
  onDeleteModel: (id: string) => void;
  onToggleStatus: (id: string, field: StatusField) => void;
}

interface StatusCheckboxProps {
  model: Model;
  field: StatusField;
  label: string;
  onToggle: (id: string, field: StatusField) => void;
}

// Status cells are tinted green when ticked and red when not. A model with every
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

export function ModelTable({
  projectId,
  models,
  onAddModel,
  onUpdateModel,
  onDeleteModel,
  onToggleStatus,
}: ModelTableProps) {
  const [newModelName, setNewModelName] = useState('');

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (newModelName.trim()) {
      onAddModel(projectId, newModelName.trim());
      setNewModelName('');
    }
  };

  return (
    <div className="bg-zinc-800/50 rounded-lg px-4 py-2 border border-zinc-700/50">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-zinc-400">
          <thead className="text-xs uppercase bg-zinc-800/80 text-zinc-300">
            <tr>
              <th className="w-full px-4 py-1.5 font-medium">Model Name</th>
              <th className="px-4 py-1.5 font-medium text-center w-16">Count</th>
              <th className="px-4 py-1.5 font-medium text-center w-20">Built</th>
              <th className="px-4 py-1.5 font-medium text-center w-20">Primed</th>
              <th className="px-4 py-1.5 font-medium text-center w-20">Painted</th>
              <th className="px-4 py-1.5 font-medium text-center w-20">Based</th>
              <th className="px-4 py-1.5 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {models.map(model => (
              <tr key={model.id} className="bg-zinc-700 border-b border-zinc-500 hover:bg-zinc-600 transition-colors">
                <td className={rowCellClass('px-4 py-0.5 font-medium text-zinc-100', model)}>
                  <InlineEditText
                    ariaLabel={`Name of ${model.name}`}
                    className="bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-blue-500 w-full"
                    value={model.name}
                    onCommit={(name) => onUpdateModel({ ...model, name })}
                  />
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
                  <button
                    type="button"
                    onClick={() => onDeleteModel(model.id)}
                    aria-label={`Delete model ${model.name}`}
                    className="text-zinc-400 hover:text-red-400 p-1 transition-colors rounded-full hover:bg-zinc-700"
                    title="Delete Model"
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
            {models.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400 italic">
                  No models in this project yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Add New Model Form */}
      <form onSubmit={handleAdd} className="mt-4 flex gap-3 px-4">
        <input
          type="text"
          className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded-lg focus:border-blue-500 block p-2.5 placeholder:text-zinc-400"
          aria-label="New model name"
          placeholder="New model name..."
          value={newModelName}
          onChange={(e) => setNewModelName(e.target.value)}
        />
        <button
          type="submit"
          disabled={!newModelName.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white font-medium rounded-lg text-sm px-5 py-2.5 transition-colors shadow-lg shadow-blue-500/20"
        >
          Add Model
        </button>
      </form>
    </div>
  );
}
