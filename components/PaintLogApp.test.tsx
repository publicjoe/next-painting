// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import PaintLogApp from './PaintLogApp';
import { STORAGE_KEY } from '@/lib/migrate';
import { seeded } from '@/lib/test-fixtures';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state: seeded }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The seeded data is applied in an effect, so wait for the shell to give way.
async function renderApp() {
  render(<PaintLogApp />);
  await screen.findByRole('navigation', { name: 'Categories' });
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('PaintLogApp', () => {
  it('has no axe violations', async () => {
    await renderApp();
    const results = await axe(document.body, {
      // jsdom has no layout engine or computed colours, so axe cannot measure
      // contrast here. Contrast is covered by the design review, not this test.
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations in the empty state', async () => {
    localStorage.clear();
    render(<PaintLogApp />);
    await screen.findByText('Welcome to PaintLog');
    const results = await axe(document.body, {
      rules: { 'color-contrast': { enabled: false } }, // see note above
    });
    expect(results.violations).toEqual([]);
  });

  it('adds a category and selects it', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));
    type('New category name', 'Necrons');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Necrons' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Necrons' })).toBeTruthy();
  });

  it('adds a project', async () => {
    await renderApp();
    type('New project name', 'Tactical Squad');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByLabelText('Project name: Tactical Squad')).toBeTruthy();
  });

  it('adds a model', async () => {
    await renderApp();
    type('New model name', 'Librarian');
    fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
    expect(screen.getByRole('button', { name: 'Delete model Librarian' })).toBeTruthy();
  });

  it('toggles a status and updates progress', async () => {
    await renderApp();
    const painted = screen.getByRole('checkbox', { name: /painted - captain/i }) as HTMLInputElement;
    const based = screen.getByRole('checkbox', { name: /based - captain/i }) as HTMLInputElement;
    expect(painted.checked).toBe(false);
    expect(screen.getByText('0 / 1 Models Completed')).toBeTruthy();
    // Progress counts a model only once it is based, not when it is painted
    fireEvent.click(painted);
    expect(painted.checked).toBe(true);
    expect(screen.getByText('0 / 1 Models Completed')).toBeTruthy();
    fireEvent.click(based);
    expect(based.checked).toBe(true);
    expect(screen.getByText('1 / 1 Models Completed')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });

  describe('InlineEditText', () => {
    it('commits a rename on blur', async () => {
      await renderApp();
      const input = screen.getByLabelText('Project name: Marines') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '  Ultramarines  ' } });
      fireEvent.blur(input);
      expect((screen.getByLabelText('Project name: Ultramarines') as HTMLInputElement).value).toBe('Ultramarines');
    });

    it('reverts on Escape', async () => {
      await renderApp();
      const input = screen.getByLabelText('Project name: Marines') as HTMLInputElement;
      act(() => input.focus()); // Escape calls blur(), which only fires on a focused element
      fireEvent.change(input, { target: { value: 'Nope' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect((screen.getByLabelText('Project name: Marines') as HTMLInputElement).value).toBe('Marines');
      expect(screen.queryByLabelText('Project name: Nope')).toBeNull();
    });

    it('renames a category from the sidebar', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Rename category WH40k' }));
      const input = screen.getByLabelText('Category name: WH40k');
      fireEvent.change(input, { target: { value: 'Warhammer' } });
      fireEvent.blur(input);
      const nav = screen.getByRole('navigation', { name: 'Categories' });
      expect(within(nav).getByRole('button', { name: 'Warhammer' })).toBeTruthy();
    });
  });

  describe('import', () => {
    const importFile = (contents: string) => {
      const file = new File([contents], 'bad.json', { type: 'application/json' });
      fireEvent.change(screen.getByLabelText('Import data file'), { target: { files: [file] } });
    };

    const imported = { categories: [{ id: 'x1', name: 'Imported' }], projects: [], models: [] };

    it('shows an inline alert, not a native dialog, for bad JSON', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      await renderApp();
      importFile('{not json');
      const alert = await screen.findByText(/not a valid PaintLog export/);
      expect(alert.closest('[role="alert"]')).toBeTruthy();
      expect(alertSpy).not.toHaveBeenCalled();
      // existing data is untouched
      expect(screen.getByRole('button', { name: 'WH40k' })).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByText(/not a valid PaintLog export/)).toBeNull();
    });

    it('asks before replacing, and cancelling keeps the data', async () => {
      await renderApp();
      importFile(JSON.stringify(imported));
      const dialog = await screen.findByRole('dialog', { name: 'Replace all data?' });
      expect(dialog).toBeTruthy();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByRole('button', { name: 'WH40k' })).toBeTruthy();
    });

    it('replaces all data once confirmed', async () => {
      await renderApp();
      importFile(JSON.stringify(imported));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Replace data' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByRole('heading', { level: 1, name: 'Imported' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'WH40k' })).toBeNull();
    });

    it('does not ask when the file is invalid', async () => {
      await renderApp();
      importFile('{not json');
      await screen.findByText(/not a valid PaintLog export/);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('has no axe violations with the dialog open', async () => {
      await renderApp();
      importFile(JSON.stringify(imported));
      await screen.findByRole('dialog');
      const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } }); // see note above
      expect(results.violations).toEqual([]);
    });

    it('rejects well-formed JSON of the wrong shape', async () => {
      await renderApp();
      importFile(JSON.stringify({ categories: 'nope' }));
      expect(await screen.findByText(/not a valid PaintLog export/)).toBeTruthy();
    });
  });

  describe('delete with undo', () => {
    const undoButton = () => screen.getByRole('button', { name: 'Undo' });

    it('deletes a model at once (no native dialogs) and undoes it', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => false);
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Delete model Captain' }));
      expect(screen.queryByRole('button', { name: 'Delete model Captain' })).toBeNull();
      expect(screen.getByRole('status').textContent).toContain('Deleted model "Captain".');
      fireEvent.click(undoButton());
      expect(screen.getByRole('button', { name: 'Delete model Captain' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('moves focus to Undo after a delete, and to the main area when it is closed', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Delete model Captain' }));
      expect(document.activeElement).toBe(undoButton());
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('main'));
    });

    it('leaves focus alone when the delete was a mouse click', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Delete model Captain' }), { detail: 1 });
      expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
      expect(document.activeElement).not.toBe(undoButton());
    });

    it('returns focus to the main area after Undo', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Delete model Captain' }));
      fireEvent.click(undoButton());
      expect(document.activeElement).toBe(screen.getByRole('main'));
    });

    it('deletes a project and its models, then restores both', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Delete project Marines' }));
      expect(screen.queryByLabelText('Project name: Marines')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Delete model Captain' })).toBeNull();
      fireEvent.click(undoButton());
      expect(screen.getByLabelText('Project name: Marines')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Delete model Captain' })).toBeTruthy();
    });

    it('deletes a category and restores it with its projects and models, selected again', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Delete category WH40k' }));
      const nav = screen.getByRole('navigation', { name: 'Categories' });
      expect(within(nav).queryByRole('button', { name: 'WH40k' })).toBeNull();
      expect(screen.getByRole('heading', { level: 1, name: 'D&D' })).toBeTruthy(); // fell back to the next
      fireEvent.click(undoButton());
      expect(within(nav).getAllByRole('button', { name: /^(WH40k|D&D)$/ }).map(b => b.textContent)).toEqual(['WH40k', 'D&D']);
      expect(screen.getByRole('heading', { level: 1, name: 'WH40k' })).toBeTruthy();
      expect(screen.getByLabelText('Project name: Marines')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Delete model Captain' })).toBeTruthy();
    });

    it('keeps a small stack: only the newest three toasts remain', async () => {
      await renderApp();
      for (const n of ['A', 'B', 'C', 'D']) {
        type('New model name', n);
        fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
        fireEvent.click(screen.getByRole('button', { name: `Delete model ${n}` }));
      }
      expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(3);
      expect(screen.getByRole('status').textContent).not.toContain('"A"');
    });

    it('has no axe violations with a toast showing', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Delete model Captain' }));
      const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } }); // see note above
      expect(results.violations).toEqual([]);
    });
  });
  describe('sidebar project tree', () => {
    const nav = () => screen.getByRole('navigation', { name: 'Categories' });

    it('lists each category\'s projects underneath it with a completed count', async () => {
      await renderApp();
      const marines = within(within(nav()).getByRole('list', { name: 'Projects in WH40k' }));
      expect(marines.getByRole('button', { name: 'Marines, 0 of 1 models completed' })).toBeTruthy();
      expect(marines.queryByText('Party')).toBeNull();
      expect(within(nav()).getByRole('list', { name: 'Projects in D&D' })).toBeTruthy();
    });

    it('collapses and expands a category\'s projects', async () => {
      await renderApp();
      const toggle = screen.getByRole('button', { name: 'Collapse projects in WH40k' });
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      const listId = toggle.getAttribute('aria-controls') as string;
      expect(document.getElementById(listId)).toBeTruthy();

      fireEvent.click(toggle);
      const expand = screen.getByRole('button', { name: 'Expand projects in WH40k' });
      expect(expand.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByRole('list', { name: 'Projects in WH40k' })).toBeNull(); // hidden

      fireEvent.click(expand);
      expect(screen.getByRole('list', { name: 'Projects in WH40k' })).toBeTruthy();
    });

    it('selecting a collapsed category expands it', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Collapse projects in D&D' }));
      fireEvent.click(within(nav()).getByRole('button', { name: 'D&D' }));
      expect(screen.getByRole('list', { name: 'Projects in D&D' })).toBeTruthy();
    });

    it('clicking a project selects its category and shows only that project', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: /^Party, / }));
      expect(screen.getByRole('heading', { level: 1, name: 'D&D' })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: 'Party' })).toBeTruthy();
      expect(screen.getByLabelText('Project name: Party')).toBeTruthy();
    });

    it('shows a muted line for a category with no projects', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));
      type('New category name', 'Necrons');
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      const list = within(nav()).getByRole('list', { name: 'Projects in Necrons' });
      expect(within(list).getByText('No projects')).toBeTruthy();
    });

    it('removes a deleted project from the tree and Undo brings it back', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Delete project Marines' }));
      expect(screen.queryByRole('button', { name: /^Marines, / })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByRole('button', { name: /^Marines, / })).toBeTruthy();
    });

    it('removes a deleted category\'s projects and Undo restores them', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Delete category D&D' }));
      expect(screen.queryByRole('button', { name: /^Party, / })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByRole('button', { name: /^Party, / })).toBeTruthy();
    });

    it('has no axe violations with the tree expanded and collapsed', async () => {
      await renderApp();
      const opts = { rules: { 'color-contrast': { enabled: false } } }; // see note above
      expect((await axe(document.body, opts)).violations).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: 'Collapse projects in WH40k' }));
      expect((await axe(document.body, opts)).violations).toEqual([]);
    });
  });

  describe('one project at a time', () => {
    const nav = () => screen.getByRole('navigation', { name: 'Categories' });
    const addProject = (name: string) => {
      type('New project name', name);
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    };

    it('renders a single model table, for the first project of the category', async () => {
      await renderApp();
      addProject('Second Squad'); // WH40k now has two projects; creating selects the new one
      fireEvent.click(within(nav()).getByRole('button', { name: 'WH40k' }));
      expect(screen.getAllByRole('table')).toHaveLength(1);
      expect(screen.getByLabelText('Project name: Marines')).toBeTruthy();
      expect(screen.queryByLabelText('Project name: Second Squad')).toBeNull();
      expect(screen.getByRole('button', { name: 'Delete model Captain' })).toBeTruthy();
    });

    it('swaps the table when another project is picked in the sidebar', async () => {
      await renderApp();
      addProject('Second Squad');
      fireEvent.click(screen.getByRole('button', { name: /^Marines, / }));
      expect(screen.getAllByRole('table')).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Delete model Captain' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /^Second Squad, / }));
      expect(screen.getAllByRole('table')).toHaveLength(1);
      expect(screen.queryByRole('button', { name: 'Delete model Captain' })).toBeNull();
      expect(screen.getByLabelText('Project name: Second Squad')).toBeTruthy();
    });

    it('marks the selected project in the sidebar with aria-current', async () => {
      await renderApp();
      const marines = screen.getByRole('button', { name: /^Marines, / });
      const party = screen.getByRole('button', { name: /^Party, / });
      expect(marines.getAttribute('aria-current')).toBe('true'); // first of the first category
      expect(party.getAttribute('aria-current')).toBeNull();
      fireEvent.click(party);
      expect(party.getAttribute('aria-current')).toBe('true');
      expect(marines.getAttribute('aria-current')).toBeNull();
    });

    it('selecting a category shows its first project', async () => {
      await renderApp();
      fireEvent.click(within(nav()).getByRole('button', { name: 'D&D' }));
      expect(screen.getByLabelText('Project name: Party')).toBeTruthy();
      expect(screen.queryByLabelText('Project name: Marines')).toBeNull();
    });

    it('selects a newly created project', async () => {
      await renderApp();
      addProject('Tactical Squad');
      expect(screen.getByLabelText('Project name: Tactical Squad')).toBeTruthy();
      expect(screen.queryByLabelText('Project name: Marines')).toBeNull();
      expect(screen.getByRole('button', { name: /^Tactical Squad, / }).getAttribute('aria-current')).toBe('true');
    });

    it('falls back to another project when the selected one is deleted, and Undo selects it again', async () => {
      await renderApp();
      addProject('Second Squad'); // selected
      fireEvent.click(screen.getByRole('button', { name: 'Delete project Second Squad' }));
      expect(screen.getByLabelText('Project name: Marines')).toBeTruthy();
      expect(screen.getAllByRole('table')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByLabelText('Project name: Second Squad')).toBeTruthy();
      expect(screen.queryByLabelText('Project name: Marines')).toBeNull();
    });

    it('still shows the empty state for a category without projects', async () => {
      await renderApp();
      fireEvent.click(within(nav()).getByRole('button', { name: 'D&D' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete project Party' }));
      expect(screen.getByText('No Projects Found')).toBeTruthy();
      expect(screen.queryByRole('table')).toBeNull();
      const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } }); // see note above
      expect(results.violations).toEqual([]);
    });

    it('has no axe violations with a project selected from another category', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: /^Party, / }));
      const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } }); // see note above
      expect(results.violations).toEqual([]);
    });
  });

  describe('load error', () => {
    const corrupt = () => {
      localStorage.setItem(STORAGE_KEY, '{bad');
      return renderApp();
    };

    it('asks for confirmation before starting fresh, and Cancel keeps the error', async () => {
      await corrupt();
      fireEvent.click(await screen.findByRole('button', { name: 'Start fresh' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/A raw copy stays in browser storage/)).toBeTruthy();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByRole('alert').textContent).toContain('could not be read');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('{bad');
    });

    it('confirming starts fresh and keeps focus in the main area', async () => {
      await corrupt();
      fireEvent.click(await screen.findByRole('button', { name: 'Start fresh' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Start fresh' }));
      expect(screen.queryByRole('alert')).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('main'));
    });

    it('warns that nothing is recoverable when no backup could be written', async () => {
      localStorage.setItem(STORAGE_KEY, '{bad');
      const real = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
        if (k.includes('.bak')) throw new Error('QuotaExceededError');
        real.call(this, k, v);
      });
      render(<PaintLogApp />);
      fireEvent.click(await screen.findByRole('button', { name: 'Start fresh' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/No backup copy exists/)).toBeTruthy();
    });
  });
});
