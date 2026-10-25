import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { STORAGE_KEY } from '../lib/migrate';

// The naming rules in a real browser (production build): no two categories share a
// name, and no two projects in one category do. The same project name in two
// categories is fine.

const state = {
  categories: [{ id: 'c1', name: 'Orks' }, { id: 'c2', name: 'Tau' }, { id: 'c3', name: 'Empty' }],
  projects: [
    { id: 'p1', categoryId: 'c1', name: 'Boyz' },
    { id: 'p2', categoryId: 'c2', name: 'Boyz' },
    { id: 'p3', categoryId: 'c2', name: 'Fire Warriors' },
  ],
  models: [],
};

async function open(page: Page) {
  await page.addInitScript(([k, v]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(k, v);
      sessionStorage.setItem('seeded', '1');
    }
  }, [STORAGE_KEY, JSON.stringify({ version: 1, state })]);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Painting Log' })).toBeVisible();
}

/** Project names per category as saved (saves are debounced by 300 ms, so poll). */
const saved = (page: Page) =>
  page.evaluate(k => {
    const { state } = JSON.parse(localStorage.getItem(k) ?? '{}');
    return Object.fromEntries(
      state.categories.map((c: { id: string; name: string }) => [
        c.name,
        state.projects.filter((p: { categoryId: string }) => p.categoryId === c.id).map((p: { name: string }) => p.name),
      ]),
    );
  }, STORAGE_KEY);

const list = (page: Page, category: string) => page.getByRole('list', { name: `Projects in ${category}` });
/** Our alerts, not Next's empty route announcer, which is also role=alert. */
const alerts = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const said = (page: Page) => page.locator('body > [role="status"]');

test('adding a project with a name already used in the category is refused', async ({ page }) => {
  await open(page);
  const input = page.getByLabel('New project name');
  await input.fill('boyz');
  await page.getByRole('button', { name: 'Create' }).click();
  const alert = alerts(page);
  await expect(alert).toHaveText('A project named "boyz" already exists in category "Orks".');
  await expect(input).toHaveValue('boyz');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  // Axe, with the error visible, contrast included
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  // The same name in another category is fine
  await page.getByRole('button', { name: 'Tau', exact: true }).click();
  await input.fill('Marines');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(alert).toBeHidden();
  await expect.poll(() => saved(page)).toEqual({ Orks: ['Boyz'], Tau: ['Boyz', 'Fire Warriors', 'Marines'], Empty: [] });
});

test('renaming a project to a sibling name is refused, and Escape reverts', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Tau', exact: true }).click();
  await list(page, 'Tau').getByRole('button', { name: /^Fire Warriors/ }).click();
  const name = page.getByLabel('Project name: Fire Warriors');
  await name.fill('BOYZ');
  await name.press('Enter');
  await expect(alerts(page)).toContainText('A project named "BOYZ" already exists in category "Tau", so "Fire Warriors" was not renamed');
  await expect(name).toBeFocused(); // not stranded: focus returns to the field
  await expect(name).toHaveValue('BOYZ');
  await name.press('Escape');
  await expect(alerts(page)).toBeHidden();
  await expect(name).toHaveValue('Fire Warriors');
  await page.waitForTimeout(500);
  expect(await saved(page)).toEqual({ Orks: ['Boyz'], Tau: ['Boyz', 'Fire Warriors'], Empty: [] });
});

test('a keyboard move into a category holding the name is refused with a message, and can be stepped past', async ({ page }) => {
  await open(page);
  const grip = list(page, 'Orks').getByRole('button', { name: 'Drag Boyz' });
  await grip.focus();
  await page.keyboard.press('Space');
  await expect(said(page)).toContainText('Picked up');
  await page.waitForTimeout(300); // dnd-kit attaches its key listener a tick after pick-up
  await page.keyboard.press('ArrowDown');
  await expect(said(page)).toContainText('cannot be dropped here: category "Tau" already has a project named "Boyz"');
  await page.keyboard.press('Space');
  await expect(said(page)).toContainText('Project "Boyz" was not moved');
  await expect(alerts(page)).toHaveText('"Boyz" was not moved to category "Tau": it already has a project named "Boyz".');
  await expect(page.locator('[data-drag-overlay]')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(await saved(page)).toEqual({ Orks: ['Boyz'], Tau: ['Boyz', 'Fire Warriors'], Empty: [] });

  // Not trapped: step past the three Tau slots to Empty and drop there
  await grip.focus();
  await page.keyboard.press('Space');
  await expect(said(page)).toContainText('Picked up');
  await page.waitForTimeout(300);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
  }
  await expect(said(page)).toContainText('will move to category "Empty"');
  await page.keyboard.press('Space');
  await expect.poll(() => saved(page)).toEqual({ Orks: [], Tau: ['Boyz', 'Fire Warriors'], Empty: ['Boyz'] });
});

test('the Move menu refuses a clashing destination with a message', async ({ page }) => {
  await open(page);
  await list(page, 'Orks').getByRole('button', { name: 'Move project Boyz' }).click();
  await page.getByRole('menuitem', { name: 'Move to Tau' }).click();
  await expect(page.getByRole('complementary').locator('[role="alert"]')).toHaveText('"Boyz" was not moved to category "Tau": it already has a project named "Boyz".');
  await expect(list(page, 'Orks').getByRole('button', { name: /^Boyz/ })).toBeVisible();
});

test('importing a file with a duplicate name is rejected and the data is untouched', async ({ page }) => {
  await open(page);
  const file = (contents: unknown) => ({ name: 'dup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(contents)) });
  const duplicate = {
    categories: [{ id: 'a', name: 'Orks' }, { id: 'b', name: 'Tau' }],
    projects: [{ id: 'x', categoryId: 'a', name: 'Boyz' }, { id: 'y', categoryId: 'a', name: 'boyz' }],
    models: [],
  };
  await page.getByLabel('Import data file').setInputFiles(file(duplicate));
  await expect(alerts(page)).toContainText('Could not import: the projects "Boyz" and "boyz" in category "Orks" have the same name.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(list(page, 'Tau').getByRole('button', { name: /^Fire Warriors/ })).toBeVisible();

  // The same project name in two categories is accepted (the confirm dialog opens)
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await page.getByLabel('Import data file').setInputFiles(file({ ...duplicate, projects: [{ id: 'x', categoryId: 'a', name: 'Boyz' }, { id: 'y', categoryId: 'b', name: 'Boyz' }] }));
  await expect(page.getByRole('dialog', { name: 'Replace all data?' })).toBeVisible();
});
