# Count models as completed once based

Date: 2026-10-24 21:53 (commit `25d9f74`)

## Summary

The per-project progress counter now counts a model only once it is ticked as based. Ticking painted no longer changes it. The label changed from "Models Painted" to "Models Completed" to match.

## Changes

- **Progress rule** (`components/ProjectList.tsx`)
  - The completed count now filters on `m.based` instead of `m.painted`. The percentage and the progress bar use the same count.
  - A model that is based but not painted still counts as completed.
- **Label** (`components/ProjectList.tsx`)
  - "Models Painted" is now "Models Completed".

## Tests

- `components/PaintLogApp.test.tsx`: the "toggles a status and updates progress" test now checks that ticking painted leaves the count at 0 and ticking based moves it to 1 of 1, and uses the new label.
- At the time of the change `tsc` and ESLint were clean and all 98 tests passed. `next build` was not re-run for this change.

## Notes

- The variable `paintedCount` in `ProjectList.tsx` keeps its old name even though it now counts based models. Renaming it to `completedCount` was left for later.
- To require both painted and based, change the filter to `m.painted && m.based`.
- This note was written after the commit, so it uses the commit's time (21:53) in the file name to keep the folder in order.
