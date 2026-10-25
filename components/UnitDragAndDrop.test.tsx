// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { axe } from '@/lib/test-axe';
import { HOVER_OPEN_MS } from '@/hooks/useHoverOpen';
import type { AppState } from '@/types';
import { ModelTable, type MoveTarget } from './ModelTable';
import { PaintDndProvider } from './PaintDndProvider';
import { Sidebar } from './Sidebar';

afterEach(cleanup);

// The sidebar and the unit table under their one shared drag and drop context, as in
// PaintLogApp, but with the data and the move handlers passed in so a test can see
// exactly what a drop dispatches. Pointer drags need real layout and are covered in
// e2e/unit-drag.spec.ts; everything here is the keyboard path, which jsdom can drive.

const unit = (id: string, projectId: string, name: string) =>
  ({ id, projectId, name, count: 1, built: false, primed: false, painted: false, based: false });

const data: AppState = {
  categories: [{ id: 'c1', name: 'WH40k' }, { id: 'c2', name: 'D&D' }],
  projects: [
    { id: 'p1', categoryId: 'c1', name: 'Marines' },
    { id: 'p2', categoryId: 'c1', name: 'Scouts' },
    { id: 'p3', categoryId: 'c2', name: 'Party' },
    { id: 'p4', categoryId: 'c2', name: 'Villains' },
  ],
  models: [
    unit('m1', 'p1', 'Captain'),
    unit('m2', 'p1', 'Sergeant'),
    unit('m3', 'p1', 'Apothecary'),
    unit('m4', 'p3', 'Rogue'),
  ],
};

function makeProps(state: AppState = data) {
  const onMoveModel = vi.fn();
  const onMoveProject = vi.fn();
  const onMoveCategory = vi.fn();
  const moveTargets: MoveTarget[] = state.projects.map(p => ({
    id: p.id,
    name: p.name,
    label: `${p.name} (${state.categories.find(c => c.id === p.categoryId)?.name})`,
    count: state.models.filter(m => m.projectId === p.id).length,
  }));
  return { state, onMoveModel, onMoveProject, onMoveCategory, moveTargets };
}

function Screen({ state, onMoveModel, onMoveProject, onMoveCategory, moveTargets }: ReturnType<typeof makeProps>) {
  return (
    <PaintDndProvider
      categories={state.categories}
      projects={state.projects}
      models={state.models}
      onMoveProject={onMoveProject}
      onMoveCategory={onMoveCategory}
      onMoveModel={onMoveModel}
    >
      <Sidebar
        categories={state.categories}
        projects={state.projects}
        modelsByProject={new Map()}
        selectedCategoryId="c1"
        selectedProjectId="p1"
        onSelectCategory={() => {}}
        onSelectProject={() => {}}
        onAddCategory={() => {}}
        onRenameCategory={() => {}}
        onDeleteCategory={() => {}}
        onMoveProject={onMoveProject}
        onMoveCategory={onMoveCategory}
        expandCategoryId={null}
        onExpanded={() => {}}
        onExport={() => {}}
        onImport={() => {}}
      />
      <main>
        <ModelTable
          projectId="p1"
          models={state.models.filter(m => m.projectId === 'p1')}
          onAddModel={() => {}}
          onUpdateModel={() => {}}
          onDeleteModel={() => {}}
          onToggleStatus={() => {}}
          moveTargets={moveTargets}
          onMoveModel={onMoveModel}
        />
      </main>
    </PaintDndProvider>
  );
}

const setup = (state: AppState = data) => {
  const props = makeProps(state);
  const utils = render(<Screen {...props} />);
  return { props, ...utils, rerenderWith: (next: AppState, over: Partial<ReturnType<typeof makeProps>> = {}) =>
    utils.rerender(<Screen {...makeProps(next)} {...over} onMoveModel={props.onMoveModel} onMoveProject={props.onMoveProject} onMoveCategory={props.onMoveCategory} />) };
};

// The keyboard sensor starts listening for keys on the next tick
const tick = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));
const key = (code: string, target: Element | Document = document) => fireEvent.keyDown(target, { code, key: code === 'Space' ? ' ' : code });
const pickUp = async (label: string) => {
  const handle = screen.getByRole('button', { name: label });
  handle.focus();
  key('Space', handle);
  await tick();
  return handle;
};
const down = (times: number) => { for (let i = 0; i < times; i++) key('ArrowDown'); };

describe('unit drag and drop, keyboard', () => {
  it('gives each unit a focusable grip of at least 24 by 24 px, named by the unit', () => {
    setup();
    for (const name of ['Captain', 'Sergeant', 'Apothecary']) {
      const grip = screen.getByRole('button', { name: `Drag unit ${name}` });
      expect(grip.tabIndex).toBe(0);
      expect(grip.className).toMatch(/\bmin-h-6\b/);
      expect(grip.className).toMatch(/\bmin-w-6\b/);
      expect(grip.className).toMatch(/\btouch-none\b/);
      grip.focus();
      expect(document.activeElement).toBe(grip);
    }
    // Only the selected project's units are in the table
    expect(screen.queryByRole('button', { name: 'Drag unit Rogue' })).toBeNull();
  });

  it('keeps the table valid: a header for every column and the grip inside the name cell', () => {
    setup();
    const grip = screen.getByRole('button', { name: 'Drag unit Captain' });
    expect(grip.closest('td')).toBe(screen.getByLabelText('Name of Captain').closest('td'));
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
    expect(screen.getAllByRole('row')).toHaveLength(4); // header and three units
  });

  it('reorders within the project, dispatching once on drop', async () => {
    const { props } = setup();
    await pickUp('Drag unit Captain');
    down(1); // before Apothecary: Sergeant, Captain, Apothecary
    expect(props.onMoveModel).not.toHaveBeenCalled();
    key('Space');
    expect(props.onMoveModel).toHaveBeenCalledTimes(1);
    expect(props.onMoveModel).toHaveBeenCalledWith('m1', 'p1', 1);
  });

  it('moves a unit up the table too', async () => {
    const { props } = setup();
    await pickUp('Drag unit Apothecary');
    key('ArrowUp');
    key('Space');
    expect(props.onMoveModel).toHaveBeenCalledWith('m3', 'p1', 1);
  });

  it('steps through the table slots and then the sidebar projects, appending to the project chosen', async () => {
    const { props } = setup();
    await pickUp('Drag unit Captain');
    // before Sergeant (start), before Apothecary, after Apothecary, then Marines, Scouts, Party
    down(5);
    key('Space');
    expect(props.onMoveModel).toHaveBeenCalledTimes(1);
    expect(props.onMoveModel).toHaveBeenCalledWith('m1', 'p3', 1);
    expect(props.onMoveProject).not.toHaveBeenCalled();
    expect(props.onMoveCategory).not.toHaveBeenCalled();
  });

  it('moves a unit into a project with no units', async () => {
    const { props } = setup();
    await pickUp('Drag unit Captain');
    down(7); // ... Party, Villains
    key('Space');
    expect(props.onMoveModel).toHaveBeenCalledWith('m1', 'p4', 0);
  });

  it('shows the dragged unit’s name in the overlay, and removes it on drop', async () => {
    setup();
    await pickUp('Drag unit Captain');
    const overlay = document.querySelector('[data-drag-overlay]');
    expect(overlay?.textContent).toBe('Captain');
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');
    key('Space');
    await tick();
    expect(document.querySelector('[data-drag-overlay]')).toBeNull();
  });

  it('dispatches nothing when dropped where it started, or when Escape or Tab cancels', async () => {
    const { props } = setup();
    await pickUp('Drag unit Captain');
    key('Space');
    await pickUp('Drag unit Captain');
    down(5);
    key('Escape');
    await pickUp('Drag unit Captain');
    down(5);
    key('Tab');
    expect(props.onMoveModel).not.toHaveBeenCalled();
  });

  it('speaks pick-up, each new position and the drop by name, never by id', async () => {
    setup();
    await pickUp('Drag unit Captain');
    expect(screen.getByText('Picked up unit "Captain" in project "Marines", position 1 of 3.')).toBeTruthy();
    down(5);
    expect(screen.getByText('Unit "Captain" will move to project "Party", position 2 of 2.')).toBeTruthy();
    key('Space');
    expect(screen.getByText('Moved unit "Captain" to project "Party", position 2 of 2.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/unit:|proj:|\bm1\b/);
  });

  it('outlines the project a unit would be dropped on, not a line in the table', async () => {
    setup();
    await pickUp('Drag unit Captain');
    down(5); // Party
    const party = screen.getByRole('button', { name: /^Party, / }).closest('li')!;
    expect(party.className).toMatch(/ring-blue-400/);
    expect(screen.getByRole('button', { name: /^Marines, / }).closest('li')!.className).not.toMatch(/ring-blue-400/);
    expect(document.querySelector('tbody tr[class*="inset_0_2px"], tbody tr[class*="inset_0_-2px"]')).toBeNull();
  });

  it('shows the insertion line in the table while over a unit slot', async () => {
    setup();
    await pickUp('Drag unit Captain');
    down(2); // after Apothecary
    const rows = within(document.querySelector('tbody')!).getAllByRole('row');
    expect(rows[rows.length - 1].className).toMatch(/inset_0_-2px/);
    expect(screen.getByRole('button', { name: /^Party, / }).closest('li')!.className).not.toMatch(/ring-blue-400/);
  });

  it('holds no move on the header of a closed category, which is only a stop until it opens', async () => {
    vi.useFakeTimers();
    try {
      const { props } = setup();
      fireEvent.click(screen.getByRole('button', { name: 'Collapse projects in D&D' }));
      const grip = screen.getByRole('button', { name: 'Drag unit Captain' });
      grip.focus();
      key('Space', grip);
      act(() => { vi.advanceTimersByTime(0); });
      down(5); // before Apothecary, after Apothecary, Marines, Scouts, then the D&D header
      expect(screen.getByText('Unit "Captain" is back at its original position.')).toBeTruthy();
      key('Space');
      expect(props.onMoveModel).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('resting on a closed category', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });
    const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
    const expanded = (name: string) =>
      screen.getByRole('button', { name: new RegExp(`projects in ${name}$`) }).getAttribute('aria-expanded');
    const restOnClosedHeader = () => {
      const props = setup().props;
      fireEvent.click(screen.getByRole('button', { name: 'Collapse projects in D&D' }));
      const grip = screen.getByRole('button', { name: 'Drag unit Captain' });
      grip.focus();
      key('Space', grip);
      advance(0);
      down(5); // the D&D header
      return props;
    };

    it('opens it after HOVER_OPEN_MS and moves onto its first project, so the next drop appends there', () => {
      const props = restOnClosedHeader();
      expect(expanded('D&D')).toBe('false');
      advance(HOVER_OPEN_MS);
      expect(expanded('D&D')).toBe('true');
      expect(screen.getByRole('button', { name: /^Party, / })).toBeTruthy();
      key('Space');
      expect(props.onMoveModel).toHaveBeenCalledWith('m1', 'p3', 1);
    });

    it('leaves it shut when the drag moves on before the delay', () => {
      restOnClosedHeader();
      advance(HOVER_OPEN_MS - 100);
      key('ArrowUp');
      advance(HOVER_OPEN_MS);
      expect(expanded('D&D')).toBe('false');
    });

    it('keeps it open after the drag is cancelled', () => {
      restOnClosedHeader();
      advance(HOVER_OPEN_MS);
      key('Escape');
      expect(expanded('D&D')).toBe('true');
    });
  });

  describe('when the data changes mid-drag (another tab)', () => {
    it('cancels when the dragged unit disappears', async () => {
      const { props, rerenderWith } = setup();
      await pickUp('Drag unit Captain');
      down(1);
      expect(document.querySelector('[data-drag-overlay]')).not.toBeNull();
      rerenderWith({ ...data, models: data.models.filter(m => m.id !== 'm1') });
      await tick();
      expect(document.querySelector('[data-drag-overlay]')).toBeNull();
      // Bring it back, so a drop would resolve to a real move if the drag were still live
      rerenderWith(data);
      await tick();
      key('Space');
      expect(props.onMoveModel).not.toHaveBeenCalled();
    });

    it('cancels when the project it rests on disappears', async () => {
      const { props, rerenderWith } = setup();
      await pickUp('Drag unit Captain');
      down(5); // Party
      rerenderWith({ ...data, projects: data.projects.filter(p => p.id !== 'p3'), models: data.models.filter(m => m.projectId !== 'p3') });
      await tick();
      expect(document.querySelector('[data-drag-overlay]')).toBeNull();
      rerenderWith(data);
      await tick();
      key('Space');
      expect(props.onMoveModel).not.toHaveBeenCalled();
    });

    it('cancels when the unit it rests on disappears', async () => {
      const { props, rerenderWith } = setup();
      await pickUp('Drag unit Captain');
      down(2); // after Apothecary
      rerenderWith({ ...data, models: data.models.filter(m => m.id !== 'm3') });
      await tick();
      expect(document.querySelector('[data-drag-overlay]')).toBeNull();
      rerenderWith(data);
      await tick();
      key('Space');
      expect(props.onMoveModel).not.toHaveBeenCalled();
    });
  });

  it('still drags projects and categories as before in the same context', async () => {
    const { props } = setup();
    await pickUp('Drag Marines');
    key('ArrowDown');
    key('ArrowDown');
    key('Space');
    expect(props.onMoveProject).toHaveBeenCalledTimes(1);
    expect(props.onMoveModel).not.toHaveBeenCalled();
    await pickUp('Drag D&D');
    key('ArrowUp');
    key('Space');
    expect(props.onMoveCategory).toHaveBeenCalledWith('c2', 0);
  });

  it('treats units whose ids are __proto__ or contain colons as ordinary ids', async () => {
    const odd: AppState = {
      ...data,
      models: [unit('__proto__', 'p1', 'Proto'), unit('a:b', 'p1', 'Colon')],
    };
    const { props } = setup(odd);
    await pickUp('Drag unit Proto');
    key('ArrowDown'); // after Colon
    key('Space');
    expect(props.onMoveModel).toHaveBeenCalledWith('__proto__', 'p1', 1);
    await pickUp('Drag unit Colon');
    key('ArrowUp'); // before Proto
    key('Space');
    expect(props.onMoveModel).toHaveBeenLastCalledWith('a:b', 'p1', 0);
  });

  it('has no axe violations with the grips and a Move menu open', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Move unit Captain' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations while a unit is picked up', async () => {
    setup();
    await pickUp('Drag unit Captain');
    down(5);
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
