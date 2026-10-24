# Fix the Medium QA findings and add browser smoke tests

Date: 2026-10-25 00:30

## Summary

Fixes M1 to M7 from `docs/qa/2026-10-24-2329-qa-review.md`, replaces the low-adoption `vitest-axe` package, refuses duplicate category names, and adds Playwright smoke tests that run in a real browser. The browser tests found two accessibility defects that jsdom could not, both fixed here.

- **QA file** (`docs/qa/2026-10-24-2329-qa-review.md`): M1 to M7 marked fixed (M7 as mostly fixed, with its two remaining gaps named), and a new section records the third review of this branch, with follow-ups N1 to N13 left Open for a fresh branch.

## Changes

- **M1: checkbox contrast** (`components/ModelTable.tsx`)
  - Checkbox boxes now have a light border (`border-zinc-300` unticked, `border-zinc-100` ticked) and a darker unticked fill. Hand-computed ratios against the cell tints are about 7:1 on red and 4.5:1 on green, above the 3:1 needed for the control boundary.
  - The tick is still the second cue for colour-blind users. The red and green tints are only about 1.6:1 apart, so colour alone is not relied on.
- **M2: one definition of "completed"** (`lib/progress.ts`, `components/ModelTable.tsx`, `components/ProjectList.tsx`, `components/Sidebar.tsx`)
  - A model is complete when built, primed, painted and based are all ticked. The green row, the header counter and the sidebar counts share one `isComplete`. `paintedCount` is renamed `completedCount`.
  - This changes the counter, which previously counted a model once it was based.
- **M3: Count input** (`components/ModelTable.tsx`, `lib/validate.ts`)
  - A new `CountInput` keeps a draft, so the field can be cleared and retyped. It commits a whole number on blur or Enter, Escape reverts, and anything invalid (empty, `1e3`, `-2`, `2.5`) reverts. Values are raised to at least 1 and capped at 9999 (`MAX_MODEL_COUNT`).
  - `isAppState` enforces the same cap, so stored or imported data with a count above 9999 is now treated as unreadable.
- **M4: sidebar focus** (`components/Sidebar.tsx`)
  - Focus returns to the new or renamed category button and to "Add Category" after Cancel or Escape. It only moves when focus was actually lost.
- **M5: multiple tabs** (`hooks/usePaintingLog.ts`, `components/PaintLogApp.tsx`)
  - A pending save is also flushed when the tab becomes hidden (`visibilitychange`).
  - When another tab's save replaces unsaved edits, an amber dismissible banner says so (`externalReplaced`, `dismissExternalNotice`).
- **M6: CI and supply chain** (`.github/workflows/ci.yml`, `.github/dependabot.yml`)
  - Added `npm audit --audit-level=high --omit=dev` after `npm ci`, and weekly Dependabot updates for npm (minor and patch grouped) and GitHub Actions. The three pinned action SHAs were checked against their `v4` tags and match.
  - `vitest-axe@0.1.0` is replaced by calling `axe-core` directly through `lib/test-axe.ts`.
  - CI also installs Chromium and runs the Playwright tests after the build.
- **M7: tests**
  - New `components/ModelTable.test.tsx`. New app-level tests for export, the save-error banner, import during a load error, toasts after import, category renames, sidebar focus and the cross-tab banner.
  - New Playwright smoke tests (`e2e/smoke.spec.ts`, `playwright.config.ts`, `npm run test:e2e`): axe with colour contrast on the main screen, keyboard delete and Dismiss focus, and the "Start fresh" dialog (focus trap, Escape, focus return).
- **Duplicate category names** (`components/Sidebar.tsx`)
  - Adding or renaming a category to a name that already exists (ignoring case and surrounding spaces) is refused with an inline alert. Two identical buttons made the aria-labels ambiguous. Existing data that already has duplicates still loads.
- **Defects found by the browser tests** (`components/Sidebar.tsx`)
  - The selected project's count text was `zinc-400` on `zinc-600` (2.94:1). It is now `zinc-100` when selected.
  - The sidebar project button's `aria-label` did not contain its visible text. The name now comes from the content, with the count in screen-reader-only text.
- **Docs** (`README.md`)
  - The layout table now lists `ConfirmDialog`, `UndoToasts`, `icons.tsx`, `backup.ts`, `progress.ts` and `e2e/`, explains "completed", and documents `npm run test:e2e`.

## Tests

- 171 Vitest tests pass in 11 files (170 before the duplicate-name change). 3 Playwright tests pass in Chromium.
- `tsc`, ESLint and `next build` are clean.

## Notes

- The Playwright tests run against a production build on port 3100 and need `npx playwright install chromium` once. They were run locally in Chromium only, and the new CI step has not run on GitHub yet.
- Axe does not measure non-text contrast, so the checkbox border ratios in M1 are hand-computed and not machine-checked.
- Keyboard focus was checked in Chromium. Safari and Firefox behaviour is untested.
- The Count input commits on blur or Enter, so a spinner click is not saved until the field loses focus.
