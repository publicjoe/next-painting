import { useState, type FormEvent } from 'react';
import type { Model, StatusField } from '@/types';
import { InlineEditText } from './InlineEditText';
import { TrashIcon } from './icons';

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

function StatusCheckbox({ model, field, label, onToggle }: StatusCheckboxProps) {
  return (
    <label className="flex items-center justify-center p-2 cursor-pointer group">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={model[field]}
        onChange={() => onToggle(model.id, field)}
      />
      <div className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 ${
        model[field]
          ? 'bg-blue-500 border-blue-500 text-white'
          : 'border-zinc-500 group-hover:border-blue-400 bg-zinc-800'
      }`}>
        {model[field] && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className="sr-only">{`${label} - ${model.name}`}</span>
    </label>
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
              <th className="px-4 py-3 font-medium">Model Name</th>
              <th className="px-4 py-3 font-medium text-center w-16">Count</th>
              <th className="px-4 py-3 font-medium text-center w-20">Built</th>
              <th className="px-4 py-3 font-medium text-center w-20">Primed</th>
              <th className="px-4 py-3 font-medium text-center w-20">Painted</th>
              <th className="px-4 py-3 font-medium text-center w-20">Based</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {models.map(model => (
              <tr key={model.id} className="border-b border-zinc-700/50 hover:bg-zinc-700/30 transition-colors">
                <td className="px-4 py-2 font-medium text-zinc-100">
                  <InlineEditText
                    ariaLabel={`Name of ${model.name}`}
                    className="bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-blue-500 w-full"
                    value={model.name}
                    onCommit={(name) => onUpdateModel({ ...model, name })}
                  />
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-center flex-col items-center">
                    <input 
                      type="number" 
                      min="1"
                      aria-label={`Count for ${model.name}`}
                      className="bg-zinc-900 border border-zinc-600 rounded px-2 py-1 w-16 text-center text-zinc-100 focus:border-blue-500"
                      value={model.count}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        if (!Number.isNaN(n)) onUpdateModel({ ...model, count: Math.max(1, n) });
                      }}
                    />
                  </div>
                </td>
                <td className="p-2"><StatusCheckbox model={model} onToggle={onToggleStatus} field="built" label="Built" /></td>
                <td className="p-2"><StatusCheckbox model={model} onToggle={onToggleStatus} field="primed" label="Primed" /></td>
                <td className="p-2"><StatusCheckbox model={model} onToggle={onToggleStatus} field="painted" label="Painted" /></td>
                <td className="p-2"><StatusCheckbox model={model} onToggle={onToggleStatus} field="based" label="Based" /></td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onDeleteModel(model.id)}
                    aria-label={`Delete model ${model.name}`}
                    className="text-zinc-400 hover:text-red-400 p-2 transition-colors rounded-full hover:bg-zinc-700"
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
