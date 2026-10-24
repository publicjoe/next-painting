# Show one project at a time and tighten the project list

Date: 2026-10-24 22:51

## Summary

The main area now shows a single project's card and model table, chosen from the sidebar, instead of every project in the category. The project list spacing and sizes were also tightened.

## Changes

- **One project at a time** (`components/PaintLogApp.tsx`, `components/ProjectList.tsx`)
  - `PaintLogApp` holds a `selectedProjectId`. The project shown is the chosen one if it still exists in the selected category, otherwise that category's first project, otherwise none.
  - Clicking a category shows its first project. Clicking a project in the sidebar selects its category and that project. Creating a project selects it.
  - Deleting the selected project falls back to another project in the category, and Undo selects it again. Deleting a category only clears the selection if it was the category being shown. Importing clears the selection.
  - `ProjectList` takes a single `project` and renders one card with its model table. The category heading, the new project form and the empty state are kept.
  - The per-card collapse arrow, the expand state and the scroll-to-card and focus code from the sidebar tree change were removed, because the sidebar now switches the view. The indent that lined the progress and delete buttons up under the arrow was removed too.
- **Sidebar highlight** (`components/Sidebar.tsx`)
  - The selected project is marked `aria-current="true"` and has a grey highlight with a ring, distinct from the blue selected category.
- **Accessibility** (`components/ProjectList.tsx`)
  - The project card is a labelled section with a visually hidden `h2` naming the project, since the visible name is an editable input.
  - The "No Projects Found" heading changed from `h3` to `h2` to fix a skipped heading level that the axe check flagged.
- **Spacing and sizes** (`components/ProjectList.tsx`, `components/ModelTable.tsx`)
  - Top padding above the category heading halved (`pt-3`, `md:pt-5`).
  - Space under "Manage your projects and models..." halved (`pb-3`), and the gap between the heading and that text reduced to 2.5px (`mt-0.625`).
  - New project name input widened to 288px (`w-72`, `min-w-0` so it can shrink on small screens).
  - Project name text reduced by 20% (`text-xl` to `text-base`).
  - Top and bottom padding of the project header and body halved (`px-5 py-2.5`), and of the model table container halved (`px-4 py-2`).

## Tests

- `components/PaintLogApp.test.tsx`: 7 new tests, 116 in total.
- Two sidebar tree tests were replaced on purpose, because they covered scrolling to and expanding cards, which no longer exist.
- New tests cover: one model table in the DOM at a time, switching project from the sidebar, `aria-current` following the selection, a category showing its first project, a created project being selected, delete falling back and Undo re-selecting, the empty category state, and axe checks.
- `tsc`, ESLint, `vitest` and `next build` all pass.

## Notes

- Behaviour in a real browser (layout, spacing, highlight) is not covered by the jsdom tests, so check it by eye.
- The spacing values were chosen to match the requested proportions, for example the new project input was about 190px before. Adjust them if they look off.
