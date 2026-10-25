# Sidebar project tree

Date: 2026-10-24 22:11

> Superseded in part: `2026-10-24-2251-one-project-at-a-time.md` removed the card collapse, scroll-to-card and focus code described below. This note is kept as a record of what was committed at the time.

## Summary

The sidebar now lists each category's projects underneath it, with a chevron to show or hide them. Clicking a project selects its category and jumps to that project's card in the main area. The sidebar is also 50% wider on desktop.

## Changes

- **Project tree in the sidebar** (`components/Sidebar.tsx`)
  - Each category has a chevron button (`aria-expanded`, `aria-controls`) that shows or hides its projects. All categories start expanded, selecting a category expands it, and the state is not saved between visits.
  - Each project row shows its name and a completed/total count. A category with no projects shows "No projects".
  - The nested list stays in the DOM and uses `hidden` when collapsed, so `aria-controls` always points at a real element.
- **Jump to a project** (`components/PaintLogApp.tsx`, `components/ProjectList.tsx`)
  - Clicking a project in the sidebar selects its category, expands the project card if collapsed, scrolls to it and moves focus to it.
  - Smooth scrolling is switched off when the user prefers reduced motion.
  - Project cards now have an `id` of `project-<id>` and a focusable header.
- **Shared progress rule** (`lib/progress.ts`, `lib/progress.test.ts`)
  - The completion calculation moved out of `ProjectList` so the sidebar counts and the project cards use the same rule (a model counts as completed once it is based).
- **Wider sidebar** (`components/Sidebar.tsx`)
  - Desktop width changed from `md:w-64` (256px) to `md:w-96` (384px). Mobile is unchanged.

## Bug fixed

The first click on a project's collapse arrow did nothing. Cards default to expanded, but the first click set the state to "expanded". It now collapses on the first click (`components/ProjectList.tsx`).

## Tests

- 11 new tests in `components/PaintLogApp.test.tsx` and `lib/progress.test.ts`, 109 in total.
- They cover: projects listed under the right category, collapse and expand, selecting a collapsed category, clicking a project, an empty category, delete and undo for a project and a category, and axe checks with the tree expanded and collapsed.
- `tsc`, ESLint, `vitest` and `next build` all pass.

## Notes

- Scroll and focus behaviour is only tested in jsdom, so check it in a browser.
- `ProjectList.tsx` has one `eslint-disable-next-line react-hooks/set-state-in-effect`, with a comment explaining why: the effect syncs a card to an external request from the sidebar.
