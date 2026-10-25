# Record the open low severity QA findings

Date and time: 2026-10-25 22:36

## Summary

The Low findings left open when PRs #20 (unit drag and drop) and #21 (unique names) were merged are now written down in one place, so they are not lost in the change notes. Documentation only: no code changed.

## Changes

- **QA record** (`docs/qa/2026-10-25-2236-low-severity-findings.md`)
  - New file listing eleven open Low findings, with file references, grouped by theme (announcements, focus, small behaviour gaps, tests only). Items not reproduced in a browser are marked as such.
- **Change note** (`docs/changes/2026-10-25-2236-qa-low-severity-findings.md`)
  - This note.

## Tests and checks

None run: documentation only, no source, test or configuration file changed.

## QA review

Not run: no code changed. The findings come from the two earlier reviews recorded in `docs/changes/2026-10-25-1942-drag-units.md` and `docs/changes/2026-10-25-2008-unique-names.md`.

## Caveats

- The findings are copied from the reviewers' reports and were not re-checked against the current code.
