import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { STORAGE_KEY } from '../lib/migrate';

// Sidebar reordering in a real browser (production build). Keyboard assertions carry
// most of the weight; the pointer tests cover what jsdom cannot: real geometry, real
// auto-scroll, and the drop landing on the row under the cursor at release.

type Seed = { categories: string[]; projects: Record<string, string[]> };

const base: Seed = {
  categories: ['Space Marines', 'Orks', 'Empty', 'Tau'],
  projects: {
    'Space Marines': ['Intercessors', 'Hellblasters'],
    Orks: ['Boyz'],
    Empty: [],
    Tau: ['Fire Warriors'],
  },
};

function buildState(seed: Seed) {
  const categories = seed.categories.map((name, i) => ({ id: `c${i}`, name }));
  const projects: { id: string; categoryId: string; name: string }[] = [];
  const models: unknown[] = [];
  categories.forEach(c => {
    (seed.projects[c.name] ?? []).forEach((name, j) => {
      const id = `p-${c.id}-${j}`;
      projects.push({ id, categoryId: c.id, name });
      models.push({ id: `m-${id}`, projectId: id, name: 'Unit', count: 1, built: false, primed: false, painted: false, based: false });
    });
  });
  return { version: 1, state: { categories, projects, models } };
}

async function open(page: Page, seed: Seed = base) {
  await page.addInitScript(([k, v]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(k, v);
      sessionStorage.setItem('seeded', '1');
    }
  }, [STORAGE_KEY, JSON.stringify(buildState(seed))]);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Painting Log' })).toBeVisible();
}

/** The saved order, read back from localStorage: category names, and project names per category. */
async function saved(page: Page): Promise<Seed> {
  return page.evaluate(k => {
    const { state } = JSON.parse(localStorage.getItem(k) ?? '{}');
    const projects: Record<string, string[]> = {};
    for (const c of state.categories) {
      projects[c.name] = state.projects.filter((p: { categoryId: string }) => p.categoryId === c.id).map((p: { name: string }) => p.name);
    }
    return { categories: state.categories.map((c: { name: string }) => c.name), projects };
  }, STORAGE_KEY);
}

/** Saves are debounced by 300 ms, so poll rather than sleep. */
async function expectSaved(page: Page, expected: Seed) {
  await expect.poll(() => saved(page)).toEqual(expected);
}

function withMove(seed: Seed, mutate: (s: Seed) => void): Seed {
  const copy: Seed = structuredClone(seed);
  mutate(copy);
  return copy;
}

const status = (page: Page) => page.locator('aside [role="status"]');
const grip = (page: Page, name: string) => page.getByRole('button', { name: `Drag ${name}`, exact: true });

/** One arrow key, then a pause: dnd-kit renders each step before it reads the next key. */
async function step(page: Page, key: 'ArrowDown' | 'ArrowUp') {
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
}

/** dnd-kit's own live region, portalled to the body (the Move menu's is inside the sidebar). */
const said = (page: Page) => page.locator('body > [role="status"]');

/**
 * Focus a grip and pick it up with Space. Returns once the pick-up is announced and the
 * overlay has stopped moving: an arrow pressed while dnd-kit is still attaching its
 * listeners or re-measuring can be ignored, which a person never notices but Playwright does.
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
async function arrowUntil(page: Page, key: 'ArrowDown' | 'ArrowUp', until: RegExp, max = 10) {
  for (let i = 0; i < max; i++) {
    if (until.test((await said(page).textContent()) ?? '')) return;
    await step(page, key);
  }
  await expect(said(page)).toContainText(until);
}

/** Pick up, arrow to the announced move, and drop. */
async function keyboardDrag(page: Page, name: string, key: 'ArrowDown' | 'ArrowUp', until: RegExp) {
  await pickUp(page, name);
  await arrowUntil(page, key, until);
  await page.keyboard.press('Space');
  await expect(page.locator('[data-drag-overlay]')).toHaveCount(0);
}

test.describe('keyboard dragging', () => {
  test('a project moves down and up within its category', async ({ page }) => {
    await open(page);
    await keyboardDrag(page, 'Intercessors', 'ArrowDown', /will move to category "Space Marines", position 2 of 2/);
    await expectSaved(page, withMove(base, s => { s.projects['Space Marines'] = ['Hellblasters', 'Intercessors']; }));
    await expect(grip(page, 'Intercessors')).toBeFocused();
    await keyboardDrag(page, 'Intercessors', 'ArrowUp', /will move to category "Space Marines", position 1 of 2/);
    await expectSaved(page, base);
  });

  test('a project moves into an empty category', async ({ page }) => {
    await open(page);
    // Intercessors' own slot, then Hellblasters' end, Orks (before and after Boyz), Empty's list
    await pickUp(page, 'Intercessors');
    await arrowUntil(page, 'ArrowDown', /will move to category "Empty"/);
    await page.keyboard.press('Space');
    await expectSaved(page, withMove(base, s => {
      s.projects['Space Marines'] = ['Hellblasters'];
      s.projects.Empty = ['Intercessors'];
    }));
  });

  test('a project moves onto a collapsed category and opens it', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Collapse projects in Tau' }).click();
    await expect(page.getByRole('button', { name: 'Expand projects in Tau' })).toHaveAttribute('aria-expanded', 'false');
    await pickUp(page, 'Boyz');
    await arrowUntil(page, 'ArrowDown', /will move to category "Tau"/);
    await page.keyboard.press('Space');
    await expectSaved(page, withMove(base, s => {
      s.projects.Orks = [];
      s.projects.Tau = ['Fire Warriors', 'Boyz'];
    }));
    // Dropping on a collapsed category opens it (matching the Move menu)
    await expect(page.getByRole('button', { name: 'Collapse projects in Tau' })).toHaveAttribute('aria-expanded', 'true');
    await expect(grip(page, 'Boyz')).toBeVisible();
  });

  test('a project moves between categories, to the position chosen', async ({ page }) => {
    await open(page);
    // Fire Warriors up into Orks, before Boyz
    await pickUp(page, 'Fire Warriors');
    await arrowUntil(page, 'ArrowUp', /will move to category "Orks", position 1 of 2/);
    await page.keyboard.press('Space');
    await expectSaved(page, withMove(base, s => {
      s.projects.Tau = [];
      s.projects.Orks = ['Fire Warriors', 'Boyz'];
    }));
  });

  test('a category moves, and the project lists close for the drag and reopen after', async ({ page }) => {
    await open(page);
    await pickUp(page, 'Orks');
    await expect(page.getByRole('button', { name: /^Intercessors/ })).toHaveCount(0);
    await arrowUntil(page, 'ArrowUp', /will move to position 1 of 4/);
    await page.keyboard.press('Space');
    await expectSaved(page, withMove(base, s => { s.categories = ['Orks', 'Space Marines', 'Empty', 'Tau']; }));
    await expect(page.getByRole('button', { name: /^Intercessors/ })).toBeVisible();
  });

  test('Escape cancels a drag and leaves the order unchanged', async ({ page }) => {
    await open(page);
    await pickUp(page, 'Intercessors');
    await step(page, 'ArrowDown');
    await step(page, 'ArrowDown');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-drag-overlay]')).toHaveCount(0);
    await expect(said(page)).toContainText(/cancel/i);
    // Nothing was dispatched, so nothing new is saved: give a debounce time to prove it
    await page.waitForTimeout(500);
    expect(await saved(page)).toEqual(base);
    await expect(grip(page, 'Intercessors')).toBeFocused();
  });

  test('Tab cancels a drag too, and the next Tab moves on', async ({ page }) => {
    await open(page);
    await pickUp(page, 'Intercessors');
    await step(page, 'ArrowDown');
    await step(page, 'ArrowDown');
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-drag-overlay]')).toHaveCount(0);
    await expect(said(page)).toContainText(/cancel/i);
    await page.waitForTimeout(500);
    expect(await saved(page)).toEqual(base);
    // dnd-kit takes the cancelling Tab and returns focus to the grip; the next Tab leaves it
    await expect(grip(page, 'Intercessors')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(grip(page, 'Intercessors')).not.toBeFocused();
  });
});

test.describe('Move menu', () => {
  test('Move up, Move down and Move to category work, and are announced', async ({ page }) => {
    await open(page);
    const say = status(page);

    await page.getByRole('button', { name: 'Move project Intercessors' }).click();
    await expect(page.getByRole('menuitem', { name: 'Move up' })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('menuitem', { name: 'Move down' }).click();
    await expect(say).toHaveText('Moved project "Intercessors" to category "Space Marines", position 2 of 2.');
    await expectSaved(page, withMove(base, s => { s.projects['Space Marines'] = ['Hellblasters', 'Intercessors']; }));

    await page.getByRole('button', { name: 'Move project Intercessors' }).click();
    await page.getByRole('menuitem', { name: 'Move up' }).click();
    await expect(say).toHaveText('Moved project "Intercessors" to category "Space Marines", position 1 of 2.');
    await expectSaved(page, base);

    await page.getByRole('button', { name: 'Move project Boyz' }).click();
    await page.getByRole('menuitem', { name: 'Move to Empty' }).click();
    await expect(say).toHaveText('Moved project "Boyz" to category "Empty", position 1 of 1.');
    await expectSaved(page, withMove(base, s => { s.projects.Orks = []; s.projects.Empty = ['Boyz']; }));
    // Focus follows the moved project's Move button
    await expect(page.getByRole('button', { name: 'Move project Boyz' })).toBeFocused();

    await page.getByRole('button', { name: 'Move category Tau' }).click();
    await page.getByRole('menuitem', { name: 'Move up' }).click();
    await expect(say).toHaveText('Moved category "Tau", position 3 of 4.');
    await expectSaved(page, withMove(base, s => {
      s.projects.Orks = [];
      s.projects.Empty = ['Boyz'];
      s.categories = ['Space Marines', 'Orks', 'Tau', 'Empty'];
    }));
  });

  test('Escape closes the menu and returns focus to its button', async ({ page }) => {
    await open(page);
    const trigger = page.getByRole('button', { name: 'Move project Boyz' });
    await trigger.click();
    await expect(page.getByRole('menu', { name: 'Move project Boyz' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test('the sidebar has no axe violations with grips shown and a Move menu open, contrast included', async ({ page }) => {
  await open(page);
  await expect(grip(page, 'Intercessors')).toBeVisible();
  const run = async () => {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
  };
  expect(await run()).toEqual([]);
  await page.getByRole('button', { name: 'Move project Boyz' }).click();
  await expect(page.getByRole('menu', { name: 'Move project Boyz' })).toBeVisible();
  expect(await run()).toEqual([]);
});

/** Mouse press on a grip, then several moves, so the 4 px activation distance is passed. */
async function centre(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

test('pointer smoke: dragging a project grip onto another category row moves it', async ({ page }) => {
  await open(page);
  const from = await centre(grip(page, 'Intercessors'));
  const to = await centre(page.getByRole('button', { name: /^Boyz/ }));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  await expect(page.locator('[data-drag-overlay]')).toBeVisible();
  // Settle on the bottom half of the Boyz row, so it lands after Boyz
  await page.mouse.move(to.x, to.box.y + to.box.height * 0.8, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator('[data-drag-overlay]')).toHaveCount(0);
  await expectSaved(page, withMove(base, s => {
    s.projects['Space Marines'] = ['Hellblasters'];
    s.projects.Orks = ['Boyz', 'Intercessors'];
  }));
});

test.describe('pointer drag over a collapsed category', () => {
  /** Press the Boyz grip and move past the activation distance. */
  async function liftBoyz(page: Page) {
    const from = await centre(grip(page, 'Boyz'));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 12, { steps: 4 });
    await expect(page.locator('[data-drag-overlay]')).toBeVisible();
  }
  const tauToggle = (page: Page) => page.locator('button[aria-controls][aria-label$="projects in Tau"]');

  test('resting about 600 ms opens it, and it stays open after Escape', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Collapse projects in Tau' }).click();
    await expect(tauToggle(page)).toHaveAttribute('aria-expanded', 'false');
    await liftBoyz(page);
    const tau = await centre(page.getByRole('button', { name: 'Tau', exact: true }));
    await page.mouse.move(tau.x, tau.y, { steps: 8 });
    await page.waitForTimeout(600);
    await expect(tauToggle(page)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-drag-overlay]')).toHaveCount(0);
    await page.mouse.up();
    await expect(tauToggle(page)).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(500);
    expect(await saved(page)).toEqual(base);
  });

  test('a quick pass leaves it shut', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Collapse projects in Tau' }).click();
    await liftBoyz(page);
    const tau = await centre(page.getByRole('button', { name: 'Tau', exact: true }));
    // Cross the Tau header without stopping, and rest well away from it
    await page.mouse.move(tau.x, tau.y + 40, { steps: 6 });
    await page.mouse.move(tau.x, tau.y - 120, { steps: 6 });
    await page.waitForTimeout(900);
    await expect(tauToggle(page)).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Escape');
    await page.mouse.up();
  });
});

test.describe('pointer drag after auto-scroll (short viewport)', () => {
  test.use({ viewport: { width: 390, height: 900 } });

  const many: Seed = {
    categories: Array.from({ length: 6 }, (_, i) => `Cat ${i}`),
    projects: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`Cat ${i}`, Array.from({ length: 4 }, (_, j) => `Proj ${i}-${j}`)])),
  };

  // Where the cursor settles inside the visible list: a fraction of its height, and the half of the row
  for (const fraction of [0.35, 0.5, 0.65]) {
    for (const half of ['top', 'bottom'] as const) {
      test(`release on the ${half} half of the row under the cursor (list at ${fraction * 100}%)`, async ({ page }) => {
        await open(page, many);
        const handle = grip(page, 'Proj 0-0');
        await handle.scrollIntoViewIfNeeded();
        const from = await centre(handle);

        // The scrolling list: the innermost scrollable ancestor of the category nav
        const box = await page.evaluate(() => {
          let el: HTMLElement | null = document.querySelector('nav[aria-label="Categories"]');
          while (el && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
          if (!el) return null;
          el.setAttribute('data-test-scroller', '');
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        });
        expect(box).not.toBeNull();
        const scroller = page.locator('[data-test-scroller]');
        const scrollTop = () => scroller.evaluate(el => el.scrollTop);
        const b = box!;

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        const cx = b.x + b.w / 2;
        await page.mouse.move(cx, from.y + 20, { steps: 5 });
        // Rest at the bottom edge until the list has auto-scrolled a long way
        await page.mouse.move(cx, b.y + b.h - 4, { steps: 5 });
        await expect.poll(scrollTop, { timeout: 15_000 }).toBeGreaterThan(300);
        // Move to the chosen height, and let the scrolling stop before looking at the rows
        await page.mouse.move(cx, b.y + b.h * fraction, { steps: 8 });
        await page.waitForTimeout(400);

        // The nearest project row to that height (a category header may sit exactly there),
        // staying clear of the list's auto-scroll edge zones
        const target = await page.evaluate(([x, y0, top, height]) => {
          const rowAt = (y: number) => {
            const li = document.elementsFromPoint(x, y).map(e => e.closest('li')).find(Boolean);
            return li?.closest('ul[aria-label^="Projects in"]') ? li : null;
          };
          for (let d = 0; d <= 90; d += 6) {
            for (const y of d === 0 ? [y0] : [y0 + d, y0 - d]) {
              if (y < top + height * 0.2 || y > top + height * 0.8) continue;
              const row = rowAt(y);
              if (!row) continue;
              const r = row.getBoundingClientRect();
              const ul = row.closest('ul[aria-label^="Projects in"]')!;
              return { name: row.querySelector('span.truncate')!.textContent!, top: r.top, height: r.height, cat: ul.getAttribute('aria-label')!.replace('Projects in ', '') };
            }
          }
          return null;
        }, [cx, b.y + b.h * fraction, b.y, b.h]);
        expect(target, 'a project row sits under the cursor').not.toBeNull();
        const t = target!;
        const releaseY = t.top + t.height * (half === 'top' ? 0.25 : 0.75);
        await page.mouse.move(cx, releaseY, { steps: 4 });
        await page.waitForTimeout(150);

        // The indicator line: which row it sits on, and on which edge
        const line = await page.evaluate(() => {
          const el = document.querySelector('aside span.pointer-events-none.bg-blue-400');
          const row = el?.closest('li');
          if (!el || !row) return null;
          return { name: row.querySelector('span.truncate')?.textContent ?? '', edge: el.className.includes('-top-0.5') ? 'top' : 'bottom' };
        });

        // What is under the cursor now, in case the list moved: the expected spot is decided here
        const now = await page.evaluate(([x, y]) => {
          const li = document.elementsFromPoint(x, y).map(e => e.closest('li')).find(Boolean);
          const row = li?.closest('ul[aria-label^="Projects in"]') ? li : null;
          if (!row) return null;
          const r = row.getBoundingClientRect();
          return { name: row.querySelector('span.truncate')!.textContent!, after: y > r.top + r.height / 2, cat: row.closest('ul[aria-label^="Projects in"]')!.getAttribute('aria-label')!.replace('Projects in ', '') };
        }, [cx, releaseY]);
        expect(now, 'still over a project row at release').not.toBeNull();
        expect(now!.name).toBe(t.name);
        expect(now!.after).toBe(half === 'bottom');

        await page.mouse.up();
        await expect(page.locator('[data-drag-overlay]')).toHaveCount(0);

        // The saved move is at the row under the cursor: before it for the top half, after it for the bottom
        await expect.poll(async () => (await saved(page)).projects[now!.cat].includes('Proj 0-0')).toBe(true);
        const result = (await saved(page)).projects[now!.cat];
        const rest = result.filter(n => n !== 'Proj 0-0');
        const at = result.indexOf('Proj 0-0');
        const targetIndex = rest.indexOf(now!.name);
        // Dropping on a row that is the dragged project itself is a no-op and cannot happen here
        expect(at).toBe(now!.after ? targetIndex + 1 : targetIndex);

        // The indicator showed that same insertion point (after row X and before the next row are one point)
        expect(line, 'an indicator line was shown').not.toBeNull();
        const lineIndex = line!.edge === 'top' ? rest.indexOf(line!.name) : rest.indexOf(line!.name) + 1;
        expect(lineIndex).toBe(at);
      });
    }
  }
});

test.describe('touch emulation', () => {
  test.use({ hasTouch: true, viewport: { width: 412, height: 915 } });

  // Enough rows to overflow the sidebar, so a swipe has something to scroll
  const tall: Seed = {
    categories: Array.from({ length: 6 }, (_, i) => `Cat ${i}`),
    projects: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`Cat ${i}`, Array.from({ length: 4 }, (_, j) => `Proj ${i}-${j}`)])),
  };

  async function touchPath(page: Page, points: { x: number; y: number }[]) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    for (const p of points.slice(1)) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
      await page.waitForTimeout(16);
    }
    return cdp;
  }

  /** The innermost scrolling ancestor of the category nav. */
  async function scroller(page: Page) {
    await page.evaluate(() => {
      let el: HTMLElement | null = document.querySelector('nav[aria-label="Categories"]');
      while (el && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      el?.setAttribute('data-test-scroller', '');
    });
    return page.locator('[data-test-scroller]');
  }

  test('a swipe on a project name scrolls the list and does not start a drag', async ({ page }) => {
    await open(page, tall);
    const list = await scroller(page);
    await expect(list).toHaveCount(1);
    expect(await grip(page, 'Proj 0-1').evaluate(el => getComputedStyle(el).touchAction)).toBe('none');
    const name = await centre(page.getByRole('button', { name: /^Proj 0-1/ }));
    const before = await list.evaluate(el => el.scrollTop);
    const cdp = await touchPath(page, Array.from({ length: 10 }, (_, i) => ({ x: name.x, y: name.y - i * 15 })));
    await expect(page.locator('[data-drag-overlay]')).toHaveCount(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(before);
    await page.waitForTimeout(500);
    expect(await saved(page)).toEqual(tall);
  });

  test('a touch drag on a grip moves the project', async ({ page }) => {
    await open(page);
    const from = await centre(grip(page, 'Intercessors'));
    const to = await centre(page.getByRole('button', { name: /^Hellblasters/ }));
    const endY = to.box.y + to.box.height * 0.8;
    const cdp = await touchPath(page, Array.from({ length: 13 }, (_, i) => ({ x: from.x, y: from.y + ((endY - from.y) * i) / 12 })));
    await expect(page.locator('[data-drag-overlay]')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expectSaved(page, withMove(base, s => { s.projects['Space Marines'] = ['Hellblasters', 'Intercessors']; }));
  });
});
