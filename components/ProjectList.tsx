import { useState, type FormEvent } from 'react';
import type { Project, Model, Category, StatusField } from '@/types';
import { ModelTable } from './ModelTable';
import { InlineEditText } from './InlineEditText';
import { TrashIcon } from './icons';
import { getProjectProgress } from '@/lib/progress';

interface ProjectListProps {
  category: Category;
  /** The one project shown in the main area; null when the category has none. */
  project: Project | null;
  modelsByProject: Map<string, Model[]>;
  onAddProject: (categoryId: string, name: string) => void;
  onUpdateProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onAddModel: (projectId: string, name: string) => void;
  onUpdateModel: (model: Model) => void;
  onDeleteModel: (id: string) => void;
  onToggleStatus: (id: string, field: StatusField) => void;
}

export function ProjectList({
  category,
  project,
  modelsByProject,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  onAddModel,
  onUpdateModel,
  onDeleteModel,
  onToggleStatus,
}: ProjectListProps) {
  const [newProjectName, setNewProjectName] = useState('');

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (newProjectName.trim()) {
      onAddProject(category.id, newProjectName.trim());
      setNewProjectName('');
    }
  };

  const projectModels = project ? (modelsByProject.get(project.id) ?? []) : [];
  const progress = getProjectProgress(projectModels);

  return (
    <div className="flex-1 overflow-y-auto p-6 pt-3 md:p-10 md:pt-5 space-y-8 bg-zinc-900">
      <header className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-zinc-800 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">{category.name}</h1>
          <p className="text-zinc-400 mt-0.625">Manage your projects and models for this category.</p>
        </div>
        
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            aria-label="New project name"
            className="w-72 min-w-0 bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg focus:border-blue-500 block p-2 placeholder:text-zinc-400"
            placeholder="New Project Name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
          />
          <button
            type="submit"
            disabled={!newProjectName.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-400 text-white font-medium rounded-lg text-sm px-4 py-2 transition-colors"
          >
            Create
          </button>
        </form>
      </header>

      {!project ? (
        <div className="text-center py-20 bg-zinc-800/20 rounded-xl border border-zinc-800 border-dashed">
          <svg className="mx-auto h-12 w-12 text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h2 className="text-lg font-medium text-zinc-300">No Projects Found</h2>
          <p className="text-zinc-400 mt-1">Create your first project above to get started.</p>
        </div>
      ) : (
        <section
          aria-labelledby={`project-heading-${project.id}`}
          className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl overflow-hidden shadow-lg"
        >
          <h2 id={`project-heading-${project.id}`} className="sr-only">
            {project.name}
          </h2>
          {/* Project Header */}
          <div className="px-5 py-2.5 flex flex-col md:flex-row md:items-center justify-between hover:bg-zinc-800/80 transition-colors gap-4">
            <InlineEditText
              ariaLabel={`Project name: ${project.name}`}
              className="text-base font-semibold bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-blue-500 text-zinc-100"
              value={project.name}
              onCommit={(name) => onUpdateProject({ ...project, name })}
            />

            <div className="flex items-center gap-6">
              <div className="flex flex-col items-end">
                <span id={`progress-label-${project.id}`} className="text-xs text-zinc-400 mb-1">
                  {progress.paintedCount} / {progress.totalCount} Models Completed
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
            />
          </div>
        </section>
      )}
    </div>
  );
}
