'use client';

// CLIENT COMPONENT BOUNDARY
// The 'use client' directive above marks the line where the app stops being
// server-rendered-only. This file and everything it imports (Sidebar,
// ProjectList, ModelTable, usePaintingLog) is bundled for the browser, so they
// may use state, effects, event handlers and browser APIs (localStorage, Blob,
// URL.createObjectURL). Those children do not need their own 'use client'. app/page.tsx and
// app/layout.tsx stay Server Components and simply render this component.
// (Client components are still pre-rendered to HTML on the server, then hydrated.)

import { useCallback, useMemo, useRef, useState } from 'react';
import { usePaintingLog } from '@/hooks/usePaintingLog';
import { migrateWithReport, STORAGE_KEY } from '@/lib/migrate';
import { keepBackup } from '@/lib/backup';
import { downloadFile } from '@/lib/download';
import { newId } from '@/lib/id';
import { removedBy, type RemovedItems } from '@/lib/state';
import { findCategoryClash, findImportNameClash, findMoveClash, findProjectClash, findRestoreClash } from '@/lib/names';
import { Sidebar } from '@/components/Sidebar';
import { PaintDndProvider } from '@/components/PaintDndProvider';
import type { MoveTarget } from '@/components/ModelTable';
import { EmptyBoxIcon } from '@/components/icons';
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
  /** Project to select again after undoing the delete of the selected project. */
  projectId?: string;
}

export default function PaintLogApp() {
  const { state, dispatch, isLoaded, loadError, backupKey, backupFailed, saveError, externalReplaced, dismissExternalNotice, adjustedNotice, dismissAdjustedNotice, startFresh } = usePaintingLog();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Why an undo was refused (its name has been taken since the delete); the toast stays
  const [undoError, setUndoError] = useState<string | null>(null);
  // A validated import waiting for the user to confirm the replace
  const [pendingImport, setPendingImport] = useState<{ state: AppState; adjusted: boolean } | null>(null);
  const [confirmingFresh, setConfirmingFresh] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  // Whether the latest click was a keyboard activation (a click with detail 0).
  // Only then does a delete pull focus to Undo; mouse users keep their pointer.
  const keyboardClickRef = useRef(false);
  const [undos, setUndos] = useState<PendingUndo[]>([]);
  // Category the sidebar should open after a move; the sidebar clears it with onExpanded
  const [expandCategoryId, setExpandCategoryId] = useState<string | null>(null);

  // Fall back to the first category when nothing (or a deleted category) is selected
  const selectedCategory =
    state.categories.find(c => c.id === selectedCategoryId) ?? state.categories[0];

  // The chosen project if it still exists in the selected category, else that category's first
  const categoryProjects = useMemo(
    () => state.projects.filter(p => p.categoryId === selectedCategory?.id),
    [state.projects, selectedCategory?.id],
  );
  const selectedProject =
    categoryProjects.find(p => p.id === selectedProjectId) ?? categoryProjects[0] ?? null;

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

  // Every project as a Move menu destination for a unit, in sidebar order. "Boyz (Orks)"
  // tells apart projects that share a name.
  const moveTargets = useMemo<MoveTarget[]>(() => {
    return state.categories.flatMap(c =>
      state.projects
        .filter(p => p.categoryId === c.id)
        .map(p => ({
          id: p.id,
          name: p.name,
          label: `${p.name} (${c.name})`,
          count: modelsByProject.get(p.id)?.length ?? 0,
        })),
    );
  }, [state.categories, state.projects, modelsByProject]);

  const handleSelectProject = (categoryId: string, projectId: string) => {
    setSelectedCategoryId(categoryId);
    setSelectedProjectId(projectId);
  };

  // A category shows its first project, so drop any earlier project choice
  const handleSelectCategory = (id: string) => {
    setSelectedCategoryId(id);
    setSelectedProjectId(null);
  };

  // A move must not change what is shown. The shown project can be the implicit
  // first of its category, which would jump away once it leaves, so pin it first.
  // Do not reuse handleSelectCategory: it clears the selected project.
  const handleMoveProject = (id: string, toCategoryId: string, toIndexInCategory: number) => {
    // The sidebar and the drag provider report a refusal themselves; this keeps the
    // selection from following a project that the reducer would refuse to move
    if (findMoveClash(state.projects, id, toCategoryId)) return;
    setSelectedProjectId(selectedProject?.id ?? null);
    if (selectedProject?.id === id) {
      setSelectedCategoryId(toCategoryId); // the heading follows the project
      setExpandCategoryId(toCategoryId);
    }
    dispatch({ type: 'MOVE_PROJECT', payload: { id, toCategoryId, toIndexInCategory } });
  };

  // The shown category can be the implicit first one, which a reorder would change
  const handleMoveCategory = (id: string, toIndex: number) => {
    setSelectedCategoryId(selectedCategory?.id ?? null);
    setSelectedProjectId(selectedProject?.id ?? null);
    dispatch({ type: 'MOVE_CATEGORY', payload: { id, toIndex } });
  };

  // Moving a unit changes neither the project order nor the category order, so the
  // implicit first project (or category) that is shown stays put and nothing needs
  // pinning, unlike handleMoveProject. The unit leaves the table; the project stays.
  const handleMoveModel = (id: string, toProjectId: string, toIndexInProject: number) => {
    dispatch({ type: 'MOVE_MODEL', payload: { id, toProjectId, toIndexInProject } });
  };

  const handleAddCategory = (name: string) => {
    if (findCategoryClash(state.categories, name)) return; // the sidebar has already said why
    const id = newId();
    dispatch({ type: 'ADD_CATEGORY', payload: { id, name } });
    setSelectedCategoryId(id);
  };

  const dismissToast = useCallback((id: string) => setUndos(u => u.filter(t => t.id !== id)), []);

  // A toast closed by the user held focus; hand it to the main area, not <body>
  const closeToast = (id: string) => {
    dismissToast(id);
    mainRef.current?.focus();
  };

  const handleUndo = (id: string) => {
    const undo = undos.find(t => t.id === id);
    if (!undo) return;
    // Names can be taken while the toast is up. Refuse the whole undo and say why, rather
    // than restore part of a delete or skip an item silently. The toast stays, so the
    // undo can be tried again once the clashing item is renamed or deleted.
    const clash = findRestoreClash(state, undo.removed);
    if (clash) {
      setUndoError(`Could not undo: ${clash.charAt(0).toLowerCase()}${clash.slice(1)} Rename or delete it, then try Undo again.`);
      return;
    }
    setUndoError(null);
    dispatch({ type: 'RESTORE_ITEMS', payload: undo.removed });
    if (undo.categoryId) setSelectedCategoryId(undo.categoryId);
    if (undo.projectId) setSelectedProjectId(undo.projectId);
    closeToast(id);
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
    const toast: PendingUndo = {
      id: newId(),
      message,
      focus: keyboardClickRef.current,
      removed,
      categoryId: kind === 'category' ? id : undefined,
      projectId: kind === 'project' && id === selectedProject?.id ? id : undefined,
    };
    setUndos(u => [...u, toast].slice(-MAX_TOASTS));
  };

  const handleDeleteCategory = (id: string) => {
    const cat = state.categories.find(c => c.id === id);
    if (!cat) return;
    deleteWithUndo('category', id, `Deleted category "${cat.name}" and its projects and units.`, { type: 'DELETE_CATEGORY', payload: id });
    if (selectedCategoryId === id) setSelectedCategoryId(null);
    if (selectedCategory?.id === id) setSelectedProjectId(null); // a project of another category stays chosen
  };

  const handleDeleteProject = (id: string) => {
    const project = state.projects.find(p => p.id === id);
    if (!project) return;
    deleteWithUndo('project', id, `Deleted project "${project.name}" and its units.`, { type: 'DELETE_PROJECT', payload: id });
  };

  const handleDeleteModel = (id: string) => {
    const model = state.models.find(m => m.id === id);
    if (!model) return;
    deleteWithUndo('model', id, `Deleted unit "${model.name}".`, { type: 'DELETE_MODEL', payload: id });
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    // Importing cannot be undone, so keep a copy of what is stored now (if anything).
    // If a copy is needed and cannot be written, stop rather than destroy the only one.
    let current: string | null = null;
    try { current = localStorage.getItem(STORAGE_KEY); } catch { /* unreadable: nothing visible to lose */ }
    if (current && !keepBackup(current)) {
      setPendingImport(null);
      setImportError('Could not import: a backup copy of your current data could not be saved (browser storage may be full). Export your data first, then try again.');
      return;
    }
    startFresh(); // clears any load error so the imported data is saved
    dispatch({ type: 'REPLACE_STATE', payload: pendingImport.state });
    setSelectedCategoryId(null);
    setSelectedProjectId(null);
    setUndos([]); // their removed items belong to the data just replaced
    setUndoError(null);
    setPendingImport(null);
  };

  const handleExport = () => {
    downloadFile(JSON.stringify(state, null, 2), `paintlog-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleImport = async (file: File) => {
    setImportError(null);
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('File too large');
      // migrateWithReport() also accepts a versioned envelope (exports are plain
      // AppState) and returns validated data, or null for an unusable file
      const parsed = migrateWithReport(JSON.parse(await file.text()));
      if (!parsed) throw new Error('Unexpected file format');
      // Checked here and not in migrate or validate, which also load stored data that may
      // hold duplicates. Run on the migrated names, which may have been shortened to fit.
      const clash = findImportNameClash(parsed.state);
      if (clash) {
        setImportError(`${clash} Rename one of them in the file and import again.`);
        return;
      }
      setPendingImport(parsed); // validated; now ask (see confirmImport)
    } catch {
      setImportError('Could not import: the file is not a valid PaintLog export.');
    }
  };

  const handleAddProject = (categoryId: string, name: string) => {
    if (findProjectClash(state.projects, categoryId, name)) return; // the form has already said why
    const id = newId();
    dispatch({ type: 'ADD_PROJECT', payload: { id, categoryId, name } });
    setSelectedProjectId(id);
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
    <div
      onClickCapture={(e) => { keyboardClickRef.current = e.detail === 0; }}
      className="flex flex-col md:flex-row h-dvh bg-zinc-900 text-zinc-100 overflow-hidden font-sans selection:bg-blue-500/30"
    >
      <PaintDndProvider
        categories={state.categories}
        projects={state.projects}
        models={state.models}
        onMoveProject={handleMoveProject}
        onMoveCategory={handleMoveCategory}
        onMoveModel={handleMoveModel}
      >
      <Sidebar 
        categories={state.categories}
        selectedCategoryId={selectedCategory?.id ?? null}
        selectedProjectId={selectedProject?.id ?? null}
        projects={state.projects}
        modelsByProject={modelsByProject}
        onSelectCategory={handleSelectCategory}
        onSelectProject={handleSelectProject}
        onAddCategory={handleAddCategory}
        onRenameCategory={(id, name) => dispatch({ type: 'UPDATE_CATEGORY', payload: { id, name } })}
        onDeleteCategory={handleDeleteCategory}
        onMoveProject={handleMoveProject}
        onMoveCategory={handleMoveCategory}
        expandCategoryId={expandCategoryId}
        onExpanded={() => setExpandCategoryId(null)}
        onExport={handleExport}
        onImport={handleImport}
      />
      
      <main ref={mainRef} tabIndex={-1} className="focus-visible:outline-offset-[-2px] flex-1 flex flex-col min-w-0 h-full">
        {loadError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 bg-amber-900/60 px-4 py-2 text-sm text-amber-100">
            <span className="flex-1">{loadError} Saving is paused until you start fresh or import a file.</span>
            <button type="button" onClick={() => setConfirmingFresh(true)} className="rounded bg-amber-700 px-3 py-1 font-medium hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">
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
        {undoError && (
          <div role="alert" className="flex items-center gap-3 bg-red-900/60 px-4 py-2 text-sm text-red-100">
            <span className="flex-1">{undoError}</span>
            <button type="button" onClick={() => setUndoError(null)} className="rounded bg-red-800 px-3 py-1 font-medium hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300">
              Dismiss
            </button>
          </div>
        )}
        {adjustedNotice && (
          <div role="status" className="flex items-center gap-3 bg-amber-900/60 px-4 py-2 text-sm text-amber-100">
            <span className="flex-1">{adjustedNotice}</span>
            <button type="button" onClick={dismissAdjustedNotice} className="rounded bg-amber-700 px-3 py-1 font-medium hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">
              Dismiss
            </button>
          </div>
        )}
        {externalReplaced && (
          <div role="status" className="flex items-center gap-3 bg-amber-900/60 px-4 py-2 text-sm text-amber-100">
            <span className="flex-1">Another tab saved changes, so your unsaved edits in this tab were replaced.</span>
            <button type="button" onClick={dismissExternalNotice} className="rounded bg-amber-700 px-3 py-1 font-medium hover:bg-amber-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">
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
            project={selectedProject}
            categoryProjects={categoryProjects}
            modelsByProject={modelsByProject}
            onAddProject={handleAddProject}
            onUpdateProject={(p) => dispatch({ type: 'UPDATE_PROJECT', payload: p })}
            onDeleteProject={handleDeleteProject}
            
            onAddModel={handleAddModel}
            onUpdateModel={(m) => dispatch({ type: 'UPDATE_MODEL', payload: m })}
            onDeleteModel={handleDeleteModel}
            onToggleStatus={(id: string, field: StatusField) => dispatch({ type: 'TOGGLE_MODEL_STATUS', payload: { id, field } })}
            moveTargets={moveTargets}
            onMoveModel={handleMoveModel}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 bg-zinc-900">
            <div className="text-center max-w-md">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-800 mb-6">
                <EmptyBoxIcon className="w-8 h-8 text-blue-500" strokeWidth={2} />
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
                    <span>Add your <strong>Units</strong> to the project and track their status!</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
      </PaintDndProvider>

      <UndoToasts toasts={undos} onUndo={handleUndo} onDismiss={dismissToast} onClose={closeToast} />
      {confirmingFresh && (
        <ConfirmDialog
          title="Start fresh?"
          description={
            backupKey
              ? `Your unreadable data will be replaced with an empty log. A raw copy stays in browser storage as "${backupKey}".`
              : backupFailed
                ? 'Your unreadable data will be replaced with an empty log. No backup copy exists, so it cannot be recovered afterwards.'
                : 'Saving will resume and may replace whatever is in browser storage, which could not be read. No backup copy was made.'
          }
          confirmLabel="Start fresh"
          onConfirm={() => {
            setConfirmingFresh(false);
            startFresh();
            mainRef.current?.focus(); // the banner holding the trigger is gone
          }}
          onCancel={() => setConfirmingFresh(false)}
        />
      )}
      {pendingImport && (
        <ConfirmDialog
          title="Replace all data?"
          description={
            'Importing replaces all current categories, projects and units. A copy of your current data is kept in browser storage first, when it allows.' +
            (pendingImport.adjusted ? ' Some counts or names in the file are over the limits and will be shortened.' : '')
          }
          confirmLabel="Replace data"
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}
