// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe } from '@/lib/test-axe';
import PaintLogApp from './PaintLogApp';
import { STORAGE_KEY } from '@/lib/migrate';
import type { AppState } from '@/types';

// The naming rules through the whole app: no two categories share a name, and no two
// projects in one category do (the same project name in two categories is fine).
// Two "Party" projects, one in each of the first two categories, so moving either
// across is a clash; "Rogues" and the empty category are free to move into.
const data: AppState = {
  categories: [{ id: 'c1', name: 'WH40k' }, { id: 'c2', name: 'D&D' }, { id: 'c3', name: 'Empty' }],
  projects: [
    { id: 'p1', categoryId: 'c1', name: 'Party' },
    { id: 'p2', categoryId: 'c2', name: 'Party' },
    { id: 'p3', categoryId: 'c2', name: 'Rogues' },
  ],
  models: [],
};

const seed = (state: AppState) => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state }));
};

beforeEach(() => seed(data));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderApp() {
  render(<PaintLogApp />);
  await screen.findByRole('navigation', { name: 'Categories' });
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const projectList = (category: string) => within(screen.getByRole('list', { name: `Projects in ${category}` }));
const projectNames = (category: string) =>
  projectList(category).queryAllByRole('button', { name: /^(?!Drag|Move)/ }).map(b => b.textContent?.replace(/\d+\/\d+$/, '').replace(/, \d+ of \d+ units completed$/, ''));
const sidebar = () => within(screen.getByRole('complementary'));
const select = (category: string) => fireEvent.click(screen.getByRole('button', { name: category }));
const noRules = { 'color-contrast': { enabled: false } }; // jsdom has no layout, so no contrast

describe('adding a project', () => {
  const create = (name: string) => {
    type('New project name', name);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  };

  it('refuses a name already used in the category, keeps the typed value and the focus, and says why', async () => {
    await renderApp();
    create(' party ');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('A project named "party" already exists in category "WH40k".');
    const input = screen.getByLabelText('New project name') as HTMLInputElement;
    expect(input.value).toBe(' party ');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    expect(document.activeElement).toBe(input);
    expect(projectNames('WH40k')).toEqual(['Party']);
    // Typing clears the message and the invalid state
    type('New project name', 'Part');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('refuses a name that differs only by Unicode composition', async () => {
    seed({ ...data, projects: [{ id: 'p1', categoryId: 'c1', name: 'Café' }] });
    await renderApp();
    create('Café');
    expect(screen.getByRole('alert').textContent).toContain('already exists');
  });

  it('allows the same name in another category, and a fixed name after a refusal', async () => {
    await renderApp();
    select('D&D');
    create('Marines'); // new here
    expect(projectNames('D&D')).toEqual(['Party', 'Rogues', 'Marines']);
    select('WH40k');
    create('Marines'); // the same name, in a different category
    expect(screen.queryByRole('alert')).toBeNull();
    expect(projectNames('WH40k')).toEqual(['Party', 'Marines']);
    create('marines');
    expect(screen.getByRole('alert')).toBeTruthy();
    create('Orks');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(projectNames('WH40k')).toEqual(['Party', 'Marines', 'Orks']);
  });

  it('drops the message when another category is chosen', async () => {
    await renderApp();
    create('Party');
    expect(screen.getByRole('alert')).toBeTruthy();
    select('D&D');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not bring a refused add back when its category is shown again, and clears the typed text', async () => {
    await renderApp();
    create('Party');
    select('D&D');
    select('WH40k');
    expect(screen.queryByRole('alert')).toBeNull();
    const input = screen.getByLabelText('New project name') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(input.value).toBe('');
  });

  it('has no axe violations with the error showing', async () => {
    await renderApp();
    create('Party');
    expect((await axe(document.body, { rules: noRules })).violations).toEqual([]);
  });
});

describe('renaming a project', () => {
  const rename = (from: string, to: string) => {
    const input = screen.getByLabelText(`Project name: ${from}`);
    act(() => (input as HTMLInputElement).focus());
    fireEvent.change(input, { target: { value: to } });
    fireEvent.blur(input);
  };
  const showRogues = async () => {
    await renderApp();
    fireEvent.click(sidebar().getByRole('button', { name: /^Rogues/ }));
  };

  it('refuses a name a sibling already has, keeps the typed name and puts focus back', async () => {
    await showRogues();
    rename('Rogues', 'PARTY');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('A project named "PARTY" already exists in category "D&D", so "Rogues" was not renamed. Edit the name or press Escape.');
    const input = screen.getByLabelText('Project name: Rogues') as HTMLInputElement;
    expect(input.value).toBe('PARTY');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(projectNames('D&D')).toEqual(['Party', 'Rogues']);
    // Correcting it commits and clears the message
    rename('Rogues', 'Bandits');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(projectNames('D&D')).toEqual(['Party', 'Bandits']);
  });

  it('clears the message when the refused rename is cancelled with Escape', async () => {
    await showRogues();
    rename('Rogues', 'party');
    const input = screen.getByLabelText('Project name: Rogues') as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByLabelText('Project name: Rogues') as HTMLInputElement).value).toBe('Rogues');
  });

  it('drops the message when another project is chosen', async () => {
    await showRogues();
    rename('Rogues', 'party');
    fireEvent.click(projectList('D&D').getByRole('button', { name: /^Party/ }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not bring a refused rename back when its project is shown again', async () => {
    await showRogues();
    rename('Rogues', 'party');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Project name: Rogues')));
    fireEvent.click(projectList('D&D').getByRole('button', { name: /^Party/ }));
    fireEvent.click(projectList('D&D').getByRole('button', { name: /^Rogues/ }));
    expect(screen.queryByRole('alert')).toBeNull();
    const input = screen.getByLabelText('Project name: Rogues') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(input.value).toBe('Rogues');
  });

  it('does not move focus into another project\'s field when the refocus fires after a new choice', async () => {
    await renderApp();
    fireEvent.click(sidebar().getByRole('button', { name: /^Rogues/ }));
    rename('Rogues', 'party'); // queues the refocus
    fireEvent.click(projectList('D&D').getByRole('button', { name: /^Party/ }));
    await act(() => new Promise(resolve => setTimeout(resolve, 20)));
    expect(document.activeElement).not.toBe(screen.getByLabelText('Project name: Party'));
  });

  describe('in data that already holds a namesake', () => {
    const twins: AppState = {
      categories: [{ id: 'c1', name: 'Same' }, { id: 'c2', name: 'same' }, { id: 'c3', name: 'Other' }],
      projects: [{ id: 'p1', categoryId: 'c1', name: 'Rex' }, { id: 'p2', categoryId: 'c1', name: 'rex' }],
      models: [],
    };

    it('allows a project to change only the case of its own name through the form', async () => {
      seed(twins);
      await renderApp();
      fireEvent.click(projectList('Same').getAllByRole('button', { name: /^rex/ })[0]);
      rename('rex', 'REX');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByLabelText('Project name: REX')).toBeTruthy();
    });

    it('still refuses renaming a different project to the other one\'s name', async () => {
      seed({ ...twins, projects: [...twins.projects, { id: 'p3', categoryId: 'c1', name: 'Solo' }] });
      await renderApp();
      fireEvent.click(projectList('Same').getByRole('button', { name: /^Solo/ }));
      rename('Solo', 'rex');
      expect(screen.getByRole('alert').textContent).toContain('already exists');
    });

    it('allows a category to change only the case of its own name through the form', async () => {
      seed(twins);
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Rename category same' }));
      const input = screen.getByLabelText('Category name: same');
      fireEvent.change(input, { target: { value: 'SAME' } });
      fireEvent.blur(input);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('button', { name: 'SAME' })).toBeTruthy();
    });
  });

  it('allows a change of case or spacing to the project itself, and a name used in another category', async () => {
    await renderApp();
    rename('Party', ' PARTY ');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(projectNames('WH40k')).toEqual(['PARTY']);
    select('D&D');
    rename('Party', 'PARTY'); // D&D's Party may share a name with WH40k's
    expect(screen.queryByRole('alert')).toBeNull();
    expect(projectNames('D&D')).toEqual(['PARTY', 'Rogues']);
  });

  it('has no axe violations with the error showing', async () => {
    await showRogues();
    rename('Rogues', 'party');
    expect((await axe(document.body, { rules: noRules })).violations).toEqual([]);
  });
});

describe('moving a project between categories', () => {
  const menu = (category: string, project: string) => {
    fireEvent.click(projectList(category).getByRole('button', { name: `Move project ${project}` }));
  };

  it('refuses a Move menu move into a category holding the name, keeps the item, and says why', async () => {
    await renderApp();
    menu('WH40k', 'Party');
    // Offered like any other destination, so the reason can be reached with the keyboard
    const option = screen.getByRole('menuitem', { name: 'Move to D&D' });
    expect(option.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(option);
    expect(sidebar().getByRole('alert').textContent).toBe('"Party" was not moved to category "D&D": it already has a project named "Party".');
    expect(projectNames('WH40k')).toEqual(['Party']);
    expect(projectNames('D&D')).toEqual(['Party', 'Rogues']);
    expect(screen.queryByRole('menu')).toBeNull();
    // The heading and shown project did not follow the refused move
    expect(screen.getByRole('heading', { level: 2, name: 'WH40k' })).toBeTruthy();
    expect(document.activeElement).toBe(projectList('WH40k').getByRole('button', { name: 'Move project Party' }));
  });

  it('still moves into a category without the name, and the next move clears the message', async () => {
    await renderApp();
    menu('WH40k', 'Party');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to D&D' }));
    expect(sidebar().getByRole('alert')).toBeTruthy();
    menu('D&D', 'Rogues');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to WH40k' }));
    expect(sidebar().queryByRole('alert')).toBeNull();
    expect(projectNames('WH40k')).toEqual(['Party', 'Rogues']);
  });

  it('never treats Move up and Move down within the own category as a clash', async () => {
    seed({
      ...data,
      projects: [...data.projects, { id: 'p4', categoryId: 'c2', name: 'Pa' }],
    });
    await renderApp();
    menu('D&D', 'Rogues');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(sidebar().queryByRole('alert')).toBeNull();
    expect(projectNames('D&D')).toEqual(['Rogues', 'Party', 'Pa']);
  });

  describe('by keyboard drag', () => {
    // The keyboard sensor starts listening for keys on the next tick
    const tick = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));
    const key = (code: string, target: Element | Document = document) => fireEvent.keyDown(target, { code, key: code === 'Space' ? ' ' : code });
    const spoken = () => document.body.querySelector(':scope > [role="status"]')!.textContent;
    const pickUp = async (category: string, project: string) => {
      const handle = projectList(category).getByRole('button', { name: `Drag ${project}` });
      handle.focus();
      key('Space', handle);
      await tick();
    };
    const lines = () => document.querySelectorAll('li > span.bg-blue-400').length;

    it('refuses the drop with an announcement and a visible message, then lets the user step past it', async () => {
      await renderApp();
      // Party (WH40k) is alone: its own list, then before Party, before Rogues and after Rogues in D&D, then Empty
      await pickUp('WH40k', 'Party');
      key('ArrowDown');
      expect(spoken()).toBe('Project "Party" cannot be dropped here: category "D&D" already has a project named "Party".');
      // No valid drop line is drawn on the refused slot
      expect(lines()).toBe(0);
      key('Space');
      await tick();
      expect(spoken()).toBe('Project "Party" was not moved: category "D&D" already has a project named "Party".');
      expect(sidebar().getByRole('alert').textContent).toBe('"Party" was not moved to category "D&D": it already has a project named "Party".');
      expect(projectNames('WH40k')).toEqual(['Party']);
      expect(projectNames('D&D')).toEqual(['Party', 'Rogues']);

      // Not trapped: stepping on through the clashing slots reaches Empty, and that drop works
      await pickUp('WH40k', 'Party');
      expect(sidebar().queryByRole('alert')).toBeNull(); // cleared by the new drag
      for (let i = 0; i < 4; i++) key('ArrowDown');
      expect(spoken()).toBe('Project "Party" will move to category "Empty", position 1 of 1.');
      key('Space');
      await tick();
      expect(spoken()).toBe('Moved project "Party" to category "Empty", position 1 of 1.');
      expect(projectNames('Empty')).toEqual(['Party']);
      expect(sidebar().queryByRole('alert')).toBeNull();
    });

    it('draws the line for a slot that is not refused', async () => {
      await renderApp();
      // Rogues (D&D) into WH40k: no clash, and a line shows before Party
      await pickUp('D&D', 'Rogues');
      key('ArrowUp');
      key('ArrowUp');
      expect(spoken()).toContain('will move to category "WH40k"');
      expect(lines()).toBe(1);
    });

    it('refuses a drop onto a collapsed category that holds the name', async () => {
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Collapse projects in D&D' }));
      await pickUp('WH40k', 'Party');
      key('ArrowDown');
      key('Space');
      await tick();
      expect(sidebar().getByRole('alert').textContent).toContain('was not moved to category "D&D"');
      expect(projectNames('WH40k')).toEqual(['Party']);
    });

    it('has no axe violations with the refusal showing', async () => {
      await renderApp();
      await pickUp('WH40k', 'Party');
      key('ArrowDown');
      key('Space');
      await tick();
      expect((await axe(document.body, { rules: noRules })).violations).toEqual([]);
    });
  });
});

describe('undo of a delete', () => {
  it('refuses to restore a project whose name has been taken since, says why, and keeps the toast', async () => {
    await renderApp();
    fireEvent.click(sidebar().getByRole('button', { name: /^Rogues/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete project Rogues' }));
    type('New project name', 'rogues');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const alert = screen.getAllByRole('alert').find(a => a.textContent?.startsWith('Could not undo'))!;
    expect(alert.textContent).toContain('Could not undo: a project named "Rogues" already exists in category "D&D". Rename or delete it, then try Undo again.');
    expect(projectNames('D&D')).toEqual(['Party', 'rogues']);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy(); // the toast stays
    // Once the namesake is renamed, the undo works
    fireEvent.change(screen.getByLabelText('Project name: rogues'), { target: { value: 'Bandits' } });
    fireEvent.blur(screen.getByLabelText('Project name: rogues'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(projectNames('D&D')).toEqual(['Party', 'Rogues', 'Bandits']);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('refuses to restore a category whose name has been taken since, whole, with its projects', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Delete category D&D' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));
    type('New category name', 'd&d');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getAllByRole('alert').some(a => a.textContent?.startsWith('Could not undo: a category named "D&D" already exists.'))).toBe(true);
    expect(sidebar().getAllByRole('button', { name: 'd&d' })).toHaveLength(1);
    expect(sidebar().queryByRole('list', { name: 'Projects in D&D' })).toBeNull();
  });
});

describe('import', () => {
  const importFile = (state: unknown) => {
    const file = new File([JSON.stringify(state)], 'file.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Import data file'), { target: { files: [file] } });
  };
  const withModels = (s: Pick<AppState, 'categories' | 'projects'>) => ({ ...s, models: [] });

  it('rejects two categories with one name, naming it, and keeps the current data', async () => {
    await renderApp();
    importFile(withModels({ categories: [{ id: 'a', name: 'Orks' }, { id: 'b', name: ' orks' }], projects: [] }));
    const alert = await screen.findByText(/Could not import: the categories "Orks" and " orks" have the same name/);
    expect(alert.closest('[role="alert"]')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sidebar().getByRole('button', { name: 'WH40k' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects two projects in one category, naming the category', async () => {
    await renderApp();
    importFile(withModels({
      categories: [{ id: 'a', name: 'Orks' }],
      projects: [{ id: 'p', categoryId: 'a', name: 'Boyz' }, { id: 'q', categoryId: 'a', name: 'Boyz' }],
    }));
    await screen.findByText(/Could not import: two projects in category "Orks" are named "Boyz"\./);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('rejects names that only become equal when shortened to the limit', async () => {
    await renderApp();
    importFile(withModels({
      categories: [{ id: 'a', name: 'Orks' }],
      projects: [{ id: 'p', categoryId: 'a', name: `${'x'.repeat(120)}1` }, { id: 'q', categoryId: 'a', name: `${'x'.repeat(120)}2` }],
    }));
    await screen.findByText(/Could not import: two projects in category "Orks"/);
  });

  it('accepts the same project name in different categories', async () => {
    await renderApp();
    importFile(withModels({
      categories: [{ id: 'a', name: 'Orks' }, { id: 'b', name: 'Tau' }],
      projects: [{ id: 'p', categoryId: 'a', name: 'Boyz' }, { id: 'q', categoryId: 'b', name: 'Boyz' }],
    }));
    expect(await screen.findByRole('dialog', { name: 'Replace all data?' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('stored data that already holds duplicates', () => {
  const dirty: AppState = {
    categories: [{ id: 'c1', name: 'Same' }, { id: 'c2', name: 'same' }, { id: 'c3', name: 'Other' }],
    projects: [
      { id: 'p1', categoryId: 'c1', name: 'Twin' },
      { id: 'p2', categoryId: 'c1', name: 'twin' },
      { id: 'p3', categoryId: 'c3', name: 'Solo' },
    ],
    models: [],
  };

  it('still loads with no notice, and other items can be renamed', async () => {
    seed(dirty);
    await renderApp();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(sidebar().getAllByRole('button', { name: /^same$/i })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Rename category Other' }));
    const input = screen.getByLabelText('Category name: Other');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.blur(input);
    expect(sidebar().getByRole('button', { name: 'Renamed' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
