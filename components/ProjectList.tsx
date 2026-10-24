import { useEffect, useState, type FormEvent } from 'react';
import type { Project, Model, Category, StatusField } from '@/types';
import { ModelTable } from './ModelTable';
import { InlineEditText } from './InlineEditText';
import { TrashIcon } from './icons';
import { getProjectProgress } from '@/lib/progress';

interface ProjectListProps {
  category: Category;
  projects: Project[];
  modelsByProject: Map<string, Model[]>;
  onAddProject: (categoryId: string, name: string) => void;
  onUpdateProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onAddModel: (projectId: string, name: string) => void;
  onUpdateModel: (model: Model) => void;
  onDeleteModel: (id: string) => void;
  onToggleStatus: (id: string, field: StatusField) => void;
  /** Project the sidebar asked to reveal; cleared via onFocusHandled once scrolled to. */
  focusedProjectId?: string | null;
  onFocusHandled?: () => void;
}

export function ProjectList({
  category,
  projects,
  modelsByProject,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  onAddModel,
  onUpdateModel,
  onDeleteModel,
  onToggleStatus,
  focusedProjectId = null,
  onFocusHandled,
}: ProjectListProps) {
  const [newProjectName, setNewProjectName] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (newProjectName.trim()) {
      onAddProject(category.id, newProjectName.trim());
      setNewProjectName('');
    }
  };

  const toggleExpand = (projectId: string) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: prev[projectId] === false // unset means expanded, so the first click collapses
    }));
  };

  // Reveal the project picked in the sidebar: expand it, scroll to it, focus it
  useEffect(() => {
    if (!focusedProjectId) return;
    const card = document.getElementById(`project-${focusedProjectId}`);
    if (!card) return onFocusHandled?.(); // stale request (project gone or in another category)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing UI to an external request
    setExpandedProjects(prev => ({ ...prev, [focusedProjectId]: true }));
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    card.focus({ preventScroll: true });
    onFocusHandled?.();
  }, [focusedProjectId, projects, onFocusHandled]);

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 bg-zinc-900">
      <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100">{category.name}</h1>
          <p className="text-zinc-400 mt-2">Manage your projects and models for this category.</p>
        </div>
        
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            aria-label="New project name"
            className="bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-lg focus:border-blue-500 block p-2 placeholder:text-zinc-400"
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

      {projects.length === 0 ? (
        <div className="text-center py-20 bg-zinc-800/20 rounded-xl border border-zinc-800 border-dashed">
          <svg className="mx-auto h-12 w-12 text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="text-lg font-medium text-zinc-300">No Projects Found</h3>
          <p className="text-zinc-400 mt-1">Create your first project above to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {projects.map((project) => {
            const isExpanded = expandedProjects[project.id] !== false; // Default true
            const projectModels = modelsByProject.get(project.id) ?? [];
            const progress = getProjectProgress(projectModels);
            
            return (
              <div
                key={project.id}
                id={`project-${project.id}`}
                tabIndex={-1}
                className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl overflow-hidden shadow-lg"
              >
                {/* Project Header */}
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between hover:bg-zinc-800/80 transition-colors gap-4">
                  <div className="flex items-center space-x-4">
                    <button
                      type="button"
                      onClick={() => toggleExpand(project.id)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} project ${project.name}`}
                      className="text-zinc-400 hover:text-zinc-300 rounded"
                    >
                      <svg
                        className={`w-6 h-6 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    <InlineEditText
                      ariaLabel={`Project name: ${project.name}`}
                      className="text-xl font-semibold bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-blue-500 text-zinc-100"
                      value={project.name}
                      onCommit={(name) => onUpdateProject({ ...project, name })}
                    />
                  </div>

                  <div className="flex items-center gap-6 ml-10 md:ml-0">
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
                {isExpanded && (
                  <div className="p-5 border-t border-zinc-700/50 bg-zinc-900/50">
                    <ModelTable 
                      projectId={project.id}
                      models={projectModels}
                      onAddModel={onAddModel}
                      onUpdateModel={onUpdateModel}
                      onDeleteModel={onDeleteModel}
                      onToggleStatus={onToggleStatus}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );}
