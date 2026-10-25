import { useId, useRef, useState, type FormEvent } from 'react';
import type { Project, Model, Category, StatusField } from '@/types';
import { ModelTable, type MoveTarget } from './ModelTable';
import { InlineEditText } from './InlineEditText';
import { EmptyBoxIcon, TrashIcon } from './icons';
import { getProjectProgress } from '@/lib/progress';
import { findProjectClash, findProjectRenameClash, projectClashMessage, projectRenameRefusedMessage } from '@/lib/names';

interface ProjectListProps {
  category: Category;
  /** The one project shown in the main area; null when the category has none. */
  project: Project | null;
  /** Every project of `category`, for the name rule: no two share a name. */
  categoryProjects: Project[];
  modelsByProject: Map<string, Model[]>;
  onAddProject: (categoryId: string, name: string) => void;
  onUpdateProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onAddModel: (projectId: string, name: string) => void;
  onUpdateModel: (model: Model) => void;
  onDeleteModel: (id: string) => void;
  onToggleStatus: (id: string, field: StatusField) => void;
  moveTargets: MoveTarget[];
  onMoveModel: (id: string, toProjectId: string, toIndexInProject: number) => void;
}

export function ProjectList({
  category,
  project,
  categoryProjects,
  modelsByProject,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  onAddModel,
  onUpdateModel,
  onDeleteModel,
  onToggleStatus,
  moveTargets,
  onMoveModel,
}: ProjectListProps) {
  const [newProjectName, setNewProjectName] = useState('');
  // Shown when an add or rename is refused because the name is already used in this
  // category. Tied to the category or project it was raised for, so it does not follow
  // the user to another one.
  const [addError, setAddError] = useState<{ categoryId: string; message: string } | null>(null);
  const [renameError, setRenameError] = useState<{ projectId: string; message: string } | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const refusedRename = useRef(false);
  const addErrorId = useId();
  const renameErrorId = useId();
  // A message and typed text belong to the category or project they were made for. They
  // are dropped as soon as another is shown (adjusted while rendering, so no stale frame),
  // so returning to the first one does not bring them back.
  const [lastCategoryId, setLastCategoryId] = useState(category.id);
  if (category.id !== lastCategoryId) {
    setLastCategoryId(category.id);
    setAddError(null);
    setNewProjectName('');
  }
  const projectId = project?.id ?? null;
  const [lastProjectId, setLastProjectId] = useState(projectId);
  if (projectId !== lastProjectId) {
    setLastProjectId(projectId);
    setRenameError(null);
  }
  const shownAddError = addError?.categoryId === category.id ? addError.message : null;
  const shownRenameError = project && renameError?.projectId === project.id ? renameError.message : null;

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;
    if (findProjectClash(categoryProjects, category.id, name)) {
      // Keep what was typed so it can be fixed, and leave focus in the field
      setAddError({ categoryId: category.id, message: projectClashMessage(name, category.name) });
      addInput.current?.focus();
      return;
    }
    setAddError(null);
    onAddProject(category.id, name);
    setNewProjectName('');
  };

  const projectModels = project ? (modelsByProject.get(project.id) ?? []) : [];
  const progress = getProjectProgress(projectModels);

  return (
    <div className="flex-1 overflow-y-auto p-6 pt-3 md:p-10 md:pt-5 space-y-8 bg-zinc-900">
      <header className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-zinc-800 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-zinc-100">{category.name}</h2>
          <p className="text-zinc-400 mt-0.625">Manage your projects and units for this category.</p>
        </div>
        
        <div>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            ref={addInput}
            aria-label="New project name"
            aria-invalid={shownAddError ? true : undefined}
            aria-describedby={shownAddError ? addErrorId : undefined}
            className="w-72 min-w-0 bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg focus:border-blue-500 block p-2 placeholder:text-zinc-400"
            placeholder="New Project Name"
            value={newProjectName}
            onChange={(e) => { setNewProjectName(e.target.value); setAddError(null); }}
          />
          <button
            type="submit"
            disabled={!newProjectName.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white font-medium rounded-lg text-sm px-4 py-2 transition-colors"
          >
            Create
          </button>
        </form>
        {shownAddError && (
          <p id={addErrorId} role="alert" className="mt-2 rounded bg-red-900/60 px-3 py-2 text-xs text-red-100">{shownAddError}</p>
        )}
        </div>
      </header>

      {!project ? (
        <div className="text-center py-20 bg-zinc-800/20 rounded-xl border border-zinc-800 border-dashed">
          <EmptyBoxIcon className="mx-auto h-12 w-12 text-zinc-600 mb-4" />
          <h3 className="text-lg font-medium text-zinc-300">No Projects Found</h3>
          <p className="text-zinc-400 mt-1">Create your first project above to get started.</p>
        </div>
      ) : (
        <section
          aria-labelledby={`project-heading-${project.id}`}
          className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl overflow-hidden shadow-lg"
        >
          <h3 id={`project-heading-${project.id}`} className="sr-only">
            {project.name}
          </h3>
          {/* Project Header */}
          <div className="px-5 py-2.5 flex flex-col md:flex-row md:items-center justify-between hover:bg-zinc-800/80 transition-colors gap-4">
            <div className="min-w-0">
            <InlineEditText
              key={project.id}
              inputRef={renameInput}
              invalid={!!shownRenameError}
              describedBy={renameErrorId}
              ariaLabel={`Project name: ${project.name}`}
              className="text-base font-semibold bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-blue-500 text-zinc-100"
              value={project.name}
              onCommit={(name) => {
                if (findProjectRenameClash(categoryProjects, project, name)) {
                  // Keep the typed name in the field so it can be corrected
                  refusedRename.current = true;
                  // The blur that triggered this commit has just removed focus; put it back
                  // Only if that field is still on the page (another project may have been chosen)
                  const field = renameInput.current;
                  setTimeout(() => { if (field?.isConnected) field.focus(); }, 0);
                  setRenameError({ projectId: project.id, message: projectRenameRefusedMessage(name, category.name, project.name) });
                  return;
                }
                setRenameError(null);
                onUpdateProject({ ...project, name });
              }}
              onFinish={() => {
                if (refusedRename.current) {
                  refusedRename.current = false;
                  return;
                }
                setRenameError(null);
              }}
            />
            {shownRenameError && (
              <p id={renameErrorId} role="alert" className="mt-1 rounded bg-red-900/60 px-3 py-2 text-xs text-red-100">{shownRenameError}</p>
            )}
            </div>

            <div className="flex items-center gap-6">
              <div className="flex flex-col items-end">
                <span id={`progress-label-${project.id}`} className="text-xs text-zinc-400 mb-1">
                  {progress.completedCount} / {progress.totalCount} Units Completed
                </span>
                <div
                  role="progressbar"
                  aria-labelledby={`progress-label-${project.id}`}
                  aria-valuenow={progress.percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="w-32 md:w-48 h-2 bg-zinc-700 rounded-full overflow-hidden"
                >
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">
                {progress.percentage}%
              </span>

              <button
                type="button"
                onClick={() => onDeleteProject(project.id)}
                className="text-zinc-400 hover:text-red-400 p-2 transition-colors rounded-lg hover:bg-zinc-700/50 ml-2"
                title="Delete Project"
                aria-label={`Delete project ${project.name}`}
              >
                <TrashIcon />
              </button>
            </div>
          </div>

          {/* Project Body */}
          <div className="px-5 py-2.5 border-t border-zinc-700/50 bg-zinc-900/50">
            <ModelTable
              projectId={project.id}
              models={projectModels}
              onAddModel={onAddModel}
              onUpdateModel={onUpdateModel}
              onDeleteModel={onDeleteModel}
              onToggleStatus={onToggleStatus}
              moveTargets={moveTargets}
              onMoveModel={onMoveModel}
            />
          </div>
        </section>
      )}
    </div>
  );
}
