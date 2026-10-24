import { useRef, useState, type FormEvent } from 'react';
import type { Category, Model, Project } from '@/types';
import { getProjectProgress } from '@/lib/progress';
import { InlineEditText } from './InlineEditText';
import { TrashIcon } from './icons';

interface SidebarProps {
  categories: Category[];
  projects: Project[];
  modelsByProject: Map<string, Model[]>;
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  onSelectProject: (categoryId: string, projectId: string) => void;
  onAddCategory: (name: string) => void;
  onRenameCategory: (id: string, name: string) => void;
  onDeleteCategory: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function Sidebar({
  categories,
  projects,
  modelsByProject,
  selectedCategoryId,
  onSelectCategory,
  onSelectProject,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onExport,
  onImport,
}: SidebarProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  // Categories are expanded unless collapsed here; not persisted
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (newCatName.trim()) {
      onAddCategory(newCatName.trim());
      setNewCatName('');
      setIsAdding(false);
    }
  };

  const toggleCollapsed = (id: string) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  const selectCategory = (id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: false })); // a newly selected category opens
    onSelectCategory(id);
  };

  const cancelAdd = () => {
    setNewCatName('');
    setIsAdding(false);
  };

  return (
    <aside className="w-full md:w-96 bg-zinc-800 border-b md:border-b-0 md:border-r border-zinc-700 flex flex-col md:h-full max-h-[40vh] md:max-h-none overflow-y-auto md:overflow-visible">
      <div className="p-4 border-b border-zinc-700">
        <p className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
          Painting Log
        </p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <h2 className="text-xs uppercase tracking-wider text-zinc-400 font-semibold mb-3">
          Categories
        </h2>
        
        <nav aria-label="Categories">
          <ul className="space-y-2">
            {categories.map((cat) => {
              const isOpen = !collapsed[cat.id];
              const listId = `category-projects-${cat.id}`;
              const catProjects = projects.filter(p => p.categoryId === cat.id);
              return (
              <li key={cat.id}>
                <div
                  className={`group flex items-center justify-between rounded-lg transition-colors ${
                    selectedCategoryId === cat.id
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'hover:bg-zinc-700/50 text-zinc-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(cat.id)}
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    aria-label={`${isOpen ? 'Collapse' : 'Expand'} projects in ${cat.name}`}
                    className="p-1 ml-1 rounded hover:text-blue-300"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {editingId === cat.id ? (
                    <InlineEditText
                      autoFocus
                      ariaLabel={`Category name: ${cat.name}`}
                      className="flex-1 min-w-0 m-1 bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm rounded p-1 focus:border-blue-500"
                      value={cat.name}
                      onCommit={(name) => onRenameCategory(cat.id, name)}
                      onFinish={() => setEditingId(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => selectCategory(cat.id)}
                      aria-current={selectedCategoryId === cat.id ? 'true' : undefined}
                      className="flex-1 min-w-0 text-left p-2 rounded-lg truncate"
                    >
                      {cat.name}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingId(cat.id)}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 p-1 hover:text-blue-300 transition-opacity"
                    title="Rename Category"
                    aria-label={`Rename category ${cat.name}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.768-6.768a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteCategory(cat.id)}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 p-1 mr-1 hover:text-red-400 transition-opacity"
                    title="Delete Category"
                    aria-label={`Delete category ${cat.name}`}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <ul
                  id={listId}
                  hidden={!isOpen}
                  aria-label={`Projects in ${cat.name}`}
                  className="ml-9 mr-1 mt-1 space-y-0.5"
                >
                  {catProjects.length === 0 ? (
                    <li className="px-2 py-1 text-xs text-zinc-400">No projects</li>
                  ) : (
                    catProjects.map((project) => {
                      const { paintedCount, totalCount } = getProjectProgress(modelsByProject.get(project.id) ?? []);
                      return (
                        <li key={project.id}>
                          <button
                            type="button"
                            onClick={() => onSelectProject(cat.id, project.id)}
                            aria-label={`${project.name}, ${paintedCount} of ${totalCount} models completed`}
                            className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm text-zinc-300 hover:bg-zinc-700/50"
                          >
                            <span className="min-w-0 truncate">{project.name}</span>
                            <span className="shrink-0 text-xs text-zinc-400" aria-hidden="true">
                              {paintedCount}/{totalCount}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </li>
              );
            })}
          </ul>
        </nav>

        {!isAdding ? (
          <button
            type="button"
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
              onChange={(e) => setNewCatName(e.target.value)}
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
