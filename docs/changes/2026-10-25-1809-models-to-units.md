# Call models "units" in the interface

Date and time: 2026-10-25 18:09

## Summary

Everything the user reads or a screen reader announces now says "unit" instead of "model". The internal names are unchanged on purpose: the `models` key in the stored and exported data, the `Model` type, the `*_MODEL` actions and the `ModelTable` component. Renaming the storage key would need a migration and would break saved and imported data, and the owner only asked for the wording to change.

## Changes

- **Table and form** (`components/ModelTable.tsx`)
  - Column header "Unit Name", input label and placeholder "New unit name", button "Add Unit", empty state "No units in this project yet.", delete button label "Delete unit <name>" and tooltip "Delete Unit".
- **Project header** (`components/ProjectList.tsx`)
  - "Units Completed" counter and the "Manage your projects and units" line.
- **App shell** (`components/PaintLogApp.tsx`)
  - Delete toasts ("Deleted unit ...", and the category and project cascade messages), the tagline and the import warning.
- **Sidebar** (`components/Sidebar.tsx`)
  - Screen-reader text now reads "X of Y units completed".
- **Tests** (`components/*.test.tsx`, `e2e/smoke.spec.ts`, `e2e/sidebar-drag.spec.ts`)
  - Selectors, expected text and test titles updated to match.
- **Docs**
  - `README.md` uses "unit" and notes that the `models` storage key holds units.
  - `CLAUDE.md`: the owner's rewrite of the project description is kept, with its typos corrected.

## Tests and checks

- `tsc`: clean. ESLint: clean.
- `npm test`: 328 passed.
- `next build`: succeeded.
- Playwright (`npm run test:e2e`): 25 passed.

## QA review

`qa-reviewer` (fresh context, sonnet) read the diff and found no Critical, High or Medium issues. Low items: this change note was missing (now added), a stale "model table" phrase in the QA record (left, as it names the component), the README storage key (now explained), and developer-only comments and test titles that still say "model" (left, as internal names are unchanged).

## Caveats

- The reviewer worked by reading only; the execution results above are from this session's own runs.
- Developer-only comments, identifiers and some test titles in `lib/` still say "model".
