# Project rules for this repo

## Document every commit in docs/changes/

Before any set of changes is committed, add a change note for it in `docs/changes/`.

- **File name:** `YYYY-MM-DD-HHMM-short-slug.md`, using the local date and time the note is written (for example `2026-10-24-2211-sidebar-project-tree.md`). The date-time prefix keeps the folder in chronological order, so never rename or reuse an old prefix.
- **One note per commit.** Write it when the changes are ready, before the human commits, and keep it in the same commit as the code it describes.
- **Contents:** a title, the date and time, a short summary, the changes grouped by area with file paths, any bug fixed, the tests added or changed and the result of `tsc`, ESLint, `npm test` and `next build`, and any caveats (for example behaviour only tested in jsdom).
- **Style:** UK English, plain prose, no en or em dashes, and no AI attribution lines.
- **If asked to commit or stage:** check that a note exists for the changes first, and write one if it does not. Claude does not run `git commit`; the human does.
