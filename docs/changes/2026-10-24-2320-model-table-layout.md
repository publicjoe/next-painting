# Compact model table with status colours

Date: 2026-10-24 23:20

## Summary

The model table is more compact, which matters for projects with many models, and each status cell is now coloured by whether it is ticked. A model with every stage ticked has its whole row tinted green.

## Changes

All changes are in `components/ModelTable.tsx`.

- **Tighter rows and header**
  - Header cell vertical padding halved (`py-3` to `py-1.5`).
  - Model row cell padding reduced from 8px to 2px top and bottom (`py-0.5`), and the status cells from `p-2` to `px-2 py-0.5`.
  - Delete button padding reduced from `p-2` to `p-1` (about 28px tall), and the count input from `py-1` to `py-0.5`.
  - Status checkboxes are smaller: the box goes from 24px to 20px (`w-5 h-5`), the tick from `w-4` to `w-3.5`, and the label padding from `p-2` to `p-1`. The click area is about 28px, above the 24px WCAG minimum target size.
- **Layout**
  - The "Model Name" column takes all spare width (`w-full`), so the Count, Built, Primed, Painted, Based and delete columns sit next to each other on the right. The column widths themselves are unchanged.
  - The "Actions" header text is visually hidden (`sr-only`) but kept in the DOM, because an empty table header fails accessibility checks.
- **Row styling**
  - Each model row has a medium grey background (`bg-zinc-700`), a brighter divider (`border-zinc-500`) and a lighter hover (`hover:bg-zinc-600`).
- **Status colours**
  - A ticked status cell is tinted green (`bg-green-600/40`) and an unticked one red (`bg-red-800/40`).
  - A model with all four stages ticked is complete: its name, count and delete cells take the same green, so the whole row reads as one colour. Unticking any stage returns the row to grey.
  - The helpers `isComplete`, `statusCellClass` and `rowCellClass` hold this logic at the top of the file.

## Tests

- No new tests. Existing tests do not assert on colours or spacing, and all 116 still pass.
- `tsc` and ESLint are clean. `next build` was not re-run for this change.

## Notes

- The ticked/unticked state is not conveyed by colour alone: the checkbox still shows a tick when ticked.
- "Complete" for the row means all four stages are ticked, but the "Models Completed" counter in the project header counts a model once it is based. The two can disagree for a model that is based but not fully ticked. Aligning the counter is a possible follow-up.
- The colours and spacing were tuned by eye in the dev server, and the layout has not been checked at narrow widths.
