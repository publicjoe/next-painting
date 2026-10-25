import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const KEY = 'painting-log-state';

const state = {
  categories: [{ id: 'c1', name: 'WH40k' }],
  projects: [{ id: 'p1', categoryId: 'c1', name: 'Marines' }],
  models: [
    { id: 'm1', projectId: 'p1', name: 'Captain', count: 1, built: true, primed: true, painted: true, based: true },
    { id: 'm2', projectId: 'p1', name: 'Librarian', count: 2, built: true, primed: false, painted: false, based: false },
    { id: 'm3', projectId: 'p1', name: 'Scout', count: 5, built: false, primed: false, painted: false, based: false },
  ],
};

async function seed(page: Page, raw: string) {
  await page.addInitScript(([k, v]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(k, v);
      sessionStorage.setItem('seeded', '1');
    }
  }, [KEY, raw]);
  await page.goto('/');
}

test('the main screen has no axe violations, contrast included', async ({ page }) => {
  await seed(page, JSON.stringify({ version: 1, state }));
  await expect(page.getByRole('heading', { level: 2, name: 'WH40k' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
});

test('the page has one h1, and the selected project button is named with its progress', async ({ page }) => {
  await seed(page, JSON.stringify({ version: 1, state }));
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: 'Painting Log' })).toBeVisible();
  // Captain (1) is finished; Librarian (2) and Scout (5) are not: 1 of 8
  await expect(page.getByRole('button', { name: /^Marines/ })).toHaveAccessibleName(/^Marines.*1 of 8 units completed/);
});

test('a keyboard delete puts focus on Undo, and Dismiss hands it to the main area', async ({ page }) => {
  await seed(page, JSON.stringify({ version: 1, state }));
  await page.getByRole('button', { name: 'Delete unit Scout' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(page.getByRole('main')).toBeFocused();
});

test('the Start fresh dialog traps focus, closes on Escape and returns focus', async ({ page }) => {
  await seed(page, '{bad');
  const trigger = page.getByRole('button', { name: 'Start fresh' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Start fresh?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  // Tab may leave the page for the browser's own UI (focus then reads as <body>),
  // but it must never land on the inert page behind the dialog.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const where = await dialog.evaluate(d => {
      const el = document.activeElement;
      return el === document.body ? 'body' : d.contains(el) ? 'dialog' : 'page';
    });
    expect(where).not.toBe('page');
  }
  await dialog.getByRole('button', { name: 'Cancel' }).focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
