import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { STORAGE_KEY } from '../lib/migrate';

// Dragging units in a real browser (production build): reorder within a project, and
// move to another project by dropping on its row in the sidebar. Keyboard assertions
// carry most of the weight; one pointer drag covers what jsdom cannot, which is real
// geometry, the shared drag context across the sidebar and the main area, and the drop
// landing on the row under the cursor at release.

type Seed = Record<string, string[]>; // project name -> unit names, in order

const base: Seed = {
  Marines: ['Captain', 'Sergeant', 'Apothecary'],
  Boyz: ['Nob'],
  Spare: [],
};
// One category per project name, so each project is its own sidebar row
const categoryOf: Record<string, string> = { Marines: 'Space Marines', Boyz: 'Orks', Spare: 'Orks' };

function buildState(seed: Seed) {
  const categories = ['Space Marines', 'Orks'].map((name, i) => ({ id: `c${i}`, name }));
  const projects = Object.keys(seed).map(name => ({
    id: `p-${name}`,
    categoryId: categories.find(c => c.name === categoryOf[name])!.id,
    name,
  }));
  const models = Object.entries(seed).flatMap(([project, names]) =>
    names.map(name => ({ id: `m-${name}`, projectId: `p-${project}`, name, count: 1, built: false, primed: false, painted: false, based: false })),
  );
  return { version: 1, state: { categories, projects, models } };
}

async function open(page: Page) {
  await page.addInitScript(([k, v]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(k, v);
      sessionStorage.setItem('seeded', '1');
    }
  }, [STORAGE_KEY, JSON.stringify(buildState(base))]);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Painting Log' })).toBeVisible();
}

/** The saved unit order per project, read back from localStorage. */
async function saved(page: Page): Promise<Seed> {
  return page.evaluate(k => {
    const { state } = JSON.parse(localStorage.getItem(k) ?? '{}');
    const out: Record<string, string[]> = {};
    for (const p of state.projects) {
      out[p.name] = state.models.filter((m: { projectId: string }) => m.projectId === p.id).map((m: { name: string }) => m.name);
    }
    return out;
  }, STORAGE_KEY);
}

/** Saves are debounced by 300 ms, so poll rather than sleep. */
const expectSaved = (page: Page, expected: Seed) => expect.poll(() => saved(page)).toEqual(expected);

const grip = (page: Page, name: string) => page.getByRole('button', { name: `Drag unit ${name}`, exact: true });
/** dnd-kit's own live region, portalled to the body. */
const said = (page: Page) => page.locator('body > [role="status"]');

async function step(page: Page, key: 'ArrowDown' | 'ArrowUp') {
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
}

/**
 * Focus a grip and pick it up with Space, and wait until the overlay has stopped moving:
 * an arrow pressed while dnd-kit is still attaching its listeners can be ignored, which a
 * person never notices but Playwright does.
 */
async function pickUp(page: Page, name: string) {
  await grip(page, name).focus();
  await page.keyboard.press('Space');
  await expect(said(page)).toContainText('Picked up');
  const overlay = page.locator('[data-drag-overlay]');
  await expect(overlay).toBeVisible();
  let last = '';
  await expect.poll(async () => {
    const now = JSON.stringify(await overlay.boundingBox());
    const stable = now === last;
    last = now;
    await page.waitForTimeout(150);
    return stable;
  }).toBe(true);
}

/** Press the arrow until the announcement matches. It checks before each press, so it cannot overshoot. */
async function arrowUntil(page: Page, until: RegExp, max = 10) {
  for (let i = 0; i < max; i++) {
    if (until.test((await said(page).textContent()) ?? '')) return;
    await step(page, 'ArrowDown');
  }
  await expect(said(page)).toContainText(until);
}

const shownProject = (page: Page, name: string) => expect(page.getByLabel(`Project name: ${name}`)).toBeVisible();
const unitTable = (page: Page) => page.getByRole('table');

test.describe('keyboard dragging a unit', () => {
  test('reorders within the project, announces by name, and keeps focus on the grip', async ({ page }) => {
    await open(page);
    await pickUp(page, 'Captain');
    await expect(said(page)).toContainText('Picked up unit "Captain" in project "Marines", position 1 of 3.');
    await arrowUntil(page, /will move to project "Marines", position 2 of 3/);
    await page.keyboard.press('Space');
    await expect(page.locator('[data-drag-overlay]')).toHaveCount(0);
    await expect(said(page)).toContainText('Moved unit "Captain" to project "Marines", position 2 of 3.');
    await expectSaved(page, { ...base, Marines: ['Sergeant', 'Captain', 'Apothecary'] });
    await expect(grip(page, 'Captain')).toBeFocused();
  });

  test('moves to another project without changing what is shown, and focuses the neighbouring unit', async ({ page }) => {
    await open(page);
    await pickUp(page, 'Captain');
    await arrowUntil(page, /will move to project "Boyz", position 2 of 2/);
    await page.keyboard.press('Space');
    await expect(page.locator('[data-drag-overlay]')).toHaveCount(0);
    await expect(said(page)).toContainText('Moved unit "Captain" to project "Boyz", position 2 of 2.');
    await expectSaved(page, { ...base, Marines: ['Sergeant', 'Apothecary'], Boyz: ['Nob', 'Captain'] });
    // Still showing Marines, now without Captain
    await shownProject(page, 'Marines');
    await expect(unitTable(page).getByLabel(/^Name of /)).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Move unit Sergeant' })).toBeFocused();
  });

  test('moves into a project with no units', async ({ page }) => {
    await open(page);
    await pickUp(page, 'Captain');
    await arrowUntil(page, /will move to project "Spare", position 1 of 1/);
    await page.keyboard.press('Space');
    await expectSaved(page, { ...base, Marines: ['Sergeant', 'Apothecary'], Spare: ['Captain'] });
  });

  test('Escape cancels and leaves the order unchanged', async ({ page }) => {
    await open(page);
    await pickUp(page, 'Captain');
    await arrowUntil(page, /will move to project "Boyz"/);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-drag-overlay]')).toHaveCount(0);
    await expect(grip(page, 'Captain')).toBeFocused();
    await page.waitForTimeout(500);
    expect(await saved(page)).toEqual(base);
  });
});

test.describe('Move menu', () => {
  test('is not clipped by the table, and Move to another project works and is announced', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Move unit Apothecary' }).click();
    const menu = page.getByRole('menu', { name: 'Move unit Apothecary' });
    await expect(menu).toBeVisible();
    // The last row's menu must be wholly on screen, not cut off by the table's scroll box
    const box = (await menu.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    for (const item of await menu.getByRole('menuitem').all()) await expect(item).toBeInViewport({ ratio: 1 });
    await page.getByRole('menuitem', { name: 'Move to Boyz (Orks)' }).click();
    await expect(page.locator('main [role="status"]')).toHaveText('Moved unit "Apothecary" to project "Boyz", position 2 of 2.');
    await expectSaved(page, { ...base, Marines: ['Captain', 'Sergeant'], Boyz: ['Nob', 'Apothecary'] });
    await expect(page.getByRole('button', { name: 'Move unit Sergeant' })).toBeFocused();
  });
});

test('pointer: dragging a unit grip onto a project in the sidebar moves it to the end of that project', async ({ page }) => {
  await open(page);
  const from = await centre(grip(page, 'Sergeant'));
  const to = await centre(page.getByRole('button', { name: /^Boyz/ }));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  await expect(page.locator('[data-drag-overlay]')).toBeVisible();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  // The project row, not a line in the table, shows where it will land
  await expect(page.getByRole('button', { name: /^Boyz/ }).locator('xpath=ancestor::li[1]')).toHaveClass(/ring-blue-400/);
  await page.mouse.up();
  await expect(page.locator('[data-drag-overlay]')).toHaveCount(0);
  await expectSaved(page, { ...base, Marines: ['Captain', 'Apothecary'], Boyz: ['Nob', 'Sergeant'] });
  await shownProject(page, 'Marines');
});

test('pointer: dragging a unit grip onto another row of its table reorders it', async ({ page }) => {
  await open(page);
  const from = await centre(grip(page, 'Captain'));
  const to = await centre(page.getByLabel('Name of Apothecary'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  // The lower half of the row: after Apothecary
  await page.mouse.move(to.x, to.box.y + to.box.height * 0.9, { steps: 3 });
  await page.mouse.up();
  await expectSaved(page, { ...base, Marines: ['Sergeant', 'Apothecary', 'Captain'] });
});

test('the unit table has no axe violations with grips shown and a Move menu open, contrast included', async ({ page }) => {
  await open(page);
  await expect(grip(page, 'Captain')).toBeVisible();
  const run = async () => {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
  };
  expect(await run()).toEqual([]);
  await page.getByRole('button', { name: 'Move unit Captain' }).click();
  await expect(page.getByRole('menu', { name: 'Move unit Captain' })).toBeVisible();
  expect(await run()).toEqual([]);
});

async function centre(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}
