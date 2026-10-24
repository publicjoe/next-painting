'use client';

// CLIENT COMPONENT BOUNDARY
// The 'use client' directive above marks the line where the app stops being
// server-rendered-only. This file and everything it imports (Sidebar,
// ProjectList, ModelTable, usePaintingLog) is bundled for the browser, so they
// may use state, effects, event handlers and browser APIs (localStorage, Blob,
// Blob). Those children do not need their own 'use client'. app/page.tsx and
// app/layout.tsx stay Server Components and simply render this component.
// (Client components are still pre-rendered to HTML on the server, then hydrated.)

import { useCallback, useMemo, useState } from 'react';
import { usePaintingLog } from '@/hooks/usePaintingLog';
import { isAppState } from '@/lib/validate';
import { migrate } from '@/lib/migrate';
import { newId } from '@/lib/id';
import { removedBy, type RemovedItems } from '@/lib/state';
import { Sidebar } from '@/components/Sidebar';
import { ProjectList } from '@/components/ProjectList';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { UndoToasts, type UndoToast } from '@/components/UndoToasts';
import type { AppState, Model, StatusField } from '@/types';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
/** Newest undo toasts kept; older ones lose their Undo. */
const MAX_TOASTS = 3;

interface PendingUndo extends UndoToast {
  removed: RemovedItems;
  /** Category to select again after undoing a category delete. */
  categoryId?: string;
}

export default function PaintLogApp() {
  const { state, dispatch, isLoaded, loadError, saveError, startFresh } = usePaintingLog();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // A validated import waiting for the user to confirm the replace
  const [pendingImport, setPendingImport] = useState<AppState | null>(null);
  const [undos, setUndos] = useState<PendingUndo[]>([]);

  // Fall back to the first category when nothing (or a deleted category) is selected
  const selectedCategory =
    state.categories.find(c => c.id === selectedCategoryId) ?? state.categories[0];

  const modelsByProject = useMemo(() => {
    // Map, not a plain object: a projectId of '__proto__' must not touch the prototype
    const grouped = new Map<string, Model[]>();
    for (const m of state.models) {
      const list = grouped.get(m.projectId);
      if (list) list.push(m);
      else grouped.set(m.projectId, [m]);
    }
    return grouped;
  }, [state.models]);

  const handleAddCategory = (name: string) => {
    const id = newId();
    dispatch({ type: 'ADD_CATEGORY', payload: { id, name } });
    setSelectedCategoryId(id);
  };

  const dismissToast = useCallback((id: string) => setUndos(u => u.filter(t => t.id !== id)), []);

  const handleUndo = (id: string) => {
    const undo = undos.find(t => t.id === id);
    if (!undo) return;
    dispatch({ type: 'RESTORE_ITEMS', payload: undo.removed });
    if (undo.categoryId) setSelectedCategoryId(undo.categoryId);
    dismissToast(id);
  };

  // Deletes apply at once; the toast keeps what was removed so Undo can put it back
  const deleteWithUndo = (
    kind: 'category' | 'project' | 'model',
    id: string,
    message: string,
    action: Parameters<typeof dispatch>[0],
  ) => {
    const removed = removedBy(state, kind, id);
    dispatch(action);
    const toast: PendingUndo = { id: newId(), message, removed, categoryId: kind === 'category' ? id : undefined };
    setUndos(u => [...u, toast].slice(-MAX_TOASTS));
  };

  const handleDeleteCategory = (id: string) => {
    const cat = state.categories.find(c => c.id === id);
    if (!cat) return;
    deleteWithUndo('category', id, `Deleted category "${cat.name}" and its projects and models.`, { type: 'DELETE_CATEGORY', payload: id });
    if (selectedCategoryId === id) setSelectedCategoryId(null);
  };

  const handleDeleteProject = (id: string) => {
    const project = state.projects.find(p => p.id === id);
    if (!project) return;
    deleteWithUndo('project', id, `Deleted project "${project.name}" and its models.`, { type: 'DELETE_PROJECT', payload: id });
  };

  const handleDeleteModel = (id: string) => {
    const model = state.models.find(m => m.id === id);
    if (!model) return;
    deleteWithUndo('model', id, `Deleted model "${model.name}".`, { type: 'DELETE_MODEL', payload: id });
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    startFresh(); // clears any load error so the imported data is saved
    dispatch({ type: 'REPLACE_STATE', payload: pendingImport });
    setSelectedCategoryId(null);
    setUndos([]); // their removed items belong to the data just replaced
    setPendingImport(null);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paintlog-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    setImportError(null);
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('File too large');
      // migrate() also accepts a versioned envelope; exports are plain AppState
      const parsed: unknown = migrate(JSON.parse(await file.text()));
      if (!isAppState(parsed)) throw new Error('Unexpected file format');
      setPendingImport(parsed); // validated; now ask (see confirmImport)
    } catch {
      setImportError('Could not import: the file is not a valid PaintLog export.');
    }
  };

  const handleAddProject = (categoryId: string, name: string) => {
    dispatch({
      type: 'ADD_PROJECT',
      payload: { id: newId(), categoryId, name }
    });
  };

  const handleAddModel = (projectId: string, name: string) => {
    dispatch({
      type: 'ADD_MODEL',
      payload: {
        id: newId(),
        projectId,
        name,
        count: 1,
        built: false,
        primed: false,
        painted: false,
        based: false,
      }
    });
  };

  // Server HTML and the first browser render both land here: a neutral shell
  // with no saved data. See usePaintingLog for why storage is read after mount.
  if (!isLoaded) {
    return (
      <div
        role="status"
        className="flex h-dvh items-center justify-center bg-zinc-900 text-zinc-400"
      >
        Loading PaintLog...
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-zinc-900 text-zinc-100 overflow-hidden font-sans selection:bg-blue-500/30">
      <Sidebar 
        categories={state.categories}
        selectedCategoryId={selectedCategory?.id ?? null}
        onSelectCategory={setSelectedCategoryId}
        onAddCategory={handleAddCategory}
        onRenameCategory={(id, name) => dispatch({ type: 'UPDATE_CATEGORY', payload: { id, name } })}
        onDeleteCategory={handleDeleteCategory}
        onExport={handleExport}
        onImport={handleImport}
      />
      
      <main className="flex-1 flex flex-col min-w-0 h-full">
        {loadError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 bg-amber-900/60 px-4 py-2 text-sm text-amber-100">
            <span className="flex-1">{loadError} Saving is paused until you start fresh or import a file.</span>
            <button type="button" onClick={startFresh} className="rounded bg-amber-700 px-3 py-1 font-medium hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">
              Start fresh
            </button>
          </div>
        )}
        {importError && (
          <div role="alert" className="flex items-center gap-3 bg-red-900/60 px-4 py-2 text-sm text-red-100">
            <span className="flex-1">{importError}</span>
            <button type="button" onClick={() => setImportError(null)} className="rounded bg-red-800 px-3 py-1 font-medium hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300">
              Dismiss
            </button>
          </div>
        )}
        {saveError && (
          <div role="alert" className="bg-red-900/60 px-4 py-2 text-sm text-red-100">
            Changes could not be saved (browser storage may be full or blocked). Export your data to avoid losing it.
          </div>
        )}
        {selectedCategory ? (
          <ProjectList 
            category={selectedCategory}
            projects={state.projects.filter(p => p.categoryId === selectedCategory.id)}
            modelsByProject={modelsByProject}
            onAddProject={handleAddProject}
            onUpdateProject={(p) => dispatch({ type: 'UPDATE_PROJECT', payload: p })}
            onDeleteProject={handleDeleteProject}
            
            onAddModel={handleAddModel}
            onUpdateModel={(m) => dispatch({ type: 'UPDATE_MODEL', payload: m })}
            onDeleteModel={handleDeleteModel}
            onToggleStatus={(id: string, field: StatusField) => dispatch({ type: 'TOGGLE_MODEL_STATUS', payload: { id, field } })}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 bg-zinc-900">
            <div className="text-center max-w-md">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-800 mb-6">
                <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-zinc-100 mb-2">Welcome to PaintLog</h2>
              <p className="text-zinc-400 mb-8">
                The ultimate companion for tracking your tabletop miniatures painting progress. 
                Keep track of what&apos;s built, primed, painted, and ready for the table.
              </p>
              
              <div className="bg-zinc-800/50 p-6 rounded-xl border border-zinc-700/50 text-left">
                <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">Getting Started</h3>
                <ul className="space-y-3 text-sm text-zinc-400">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">1</span>
                    <span>Create a <strong>Category</strong> in the sidebar (e.g. Warhammer 40k, D&D).</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">2</span>
                    <span>Add <strong>Projects</strong> within your category (e.g. Space Marines Army).</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">3</span>
                    <span>Add your <strong>Models</strong> to the project and track their status!</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      <UndoToasts toasts={undos} onUndo={handleUndo} onDismiss={dismissToast} />
      {pendingImport && (
        <ConfirmDialog
          title="Replace all data?"
          description="Importing replaces all current categories, projects and models. This cannot be undone."
          confirmLabel="Replace data"
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}
