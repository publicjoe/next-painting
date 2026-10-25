# Project rules for this repo

## Document every commit in docs/changes/

Before any set of changes is committed, add a change note for it in `docs/changes/`.

- **File name:** `YYYY-MM-DD-HHMM-short-slug.md`, using the local date and time the note is written (for example `2026-10-24-2211-sidebar-project-tree.md`). The date-time prefix keeps the folder in chronological order, so never rename or reuse an old prefix.
- **One note per commit.** Write it when the changes are ready, before the human commits, and keep it in the same commit as the code it describes.
- **Contents:** a title, the date and time, a short summary, the changes grouped by area with file paths, any bug fixed, the tests added or changed and the result of `tsc`, ESLint, `npm test` and `next build`, and any caveats (for example behaviour only tested in jsdom).
- **Style:** UK English, plain prose, no en or em dashes, and no AI attribution lines.
- **If asked to commit or stage:** check that a note exists for the changes first, and write one if it does not. Claude does not run `git commit`; the human does.

## QA before staging

Always run a QA review of the changes before staging them, even if the user only asks to stage.

- Dispatch the `qa-reviewer` agent (fresh context, never the agent that wrote the code) on the uncommitted changes, with an explicit `model`.
- Fix or report its findings first. Stage only once the user has seen the result, and record the review in the change note.
- Skip the review only if the user explicitly says to.

## About the project and the owner

PaintLog is a client-side tabletop miniature painting tracker built with Next.js (App Router). The owner is using this project to expand knowledge of Next.js and Claude, so explain framework concepts briefly when a change touches them.

- **Workflow:** one branch per change, then a pull request to `main` using the `gh` CLI. Claude does not push or open a PR until asked, and does not commit.
- **`main` is protected:** it needs the five CI checks to pass (Dependency audit, Lint and types, Unit tests (Vitest), Production build, Browser tests (Playwright)). Dependabot is switched off.
- **QA record:** `docs/qa/2026-10-24-2329-qa-review.md` holds the open items, accepted trade-offs and unverified areas. Read it before changing behaviour it mentions, and update it when a finding is added or fixed.
