# Drag and drop reordering for categories and projects in the sidebar

Date: 2026-10-25 14:44

## Summary

Categories and projects can now be reordered in the sidebar. Each row has a six-dot grip that can be dragged with a mouse, a finger or the keyboard (Space to pick up, Up and Down to choose a place, Space to drop, Escape or Tab to cancel). Each row also has a Move button that opens a small menu (Move up, Move down, Move to another category), which does the same moves without dragging. A project can be dropped into another category, into an empty category, or onto a collapsed category, which then opens. There is no order field: the order of the `categories` and `projects` arrays is the display order, so the storage format and `STORAGE_VERSION` are unchanged. The design and its conditions are in `docs/decisions/0001-sidebar-drag-and-drop.md`.

## Changes

- **Reducer** (`lib/state.ts`)
  - Two new actions, `MOVE_CATEGORY` and `MOVE_PROJECT`. Positions are counted after the moved item has been taken out of its list. A non-integer index (including NaN) means "the end", and everything else is clamped, so a raw index never reaches `splice`.
  - A move to the same place returns the same state object, and an unknown id or unknown target category is refused.
- **Selection** (`components/PaintLogApp.tsx`)
  - `handleMoveProject` and `handleMoveCategory` pin the shown project and category before a move, because the implicit "first of its category" would otherwise jump away when the item leaves. When the viewed project moves to another category, the heading follows it and that category opens in the sidebar (`expandCategoryId` and `onExpanded`).
- **Move menu** (`components/MoveMenu.tsx`, `components/icons.tsx`)
  - A button with a menu of moves. Disabled options stay discoverable (`aria-disabled`), arrow keys, Home, End, Tab and Escape work, and a press outside closes it. `MoreIcon` is new.
  - Each move is announced in the sidebar's live region by name, for example `Moved project "Boyz" to category "Empty", position 1 of 1.`
  - Each option has an `id` and the menu keys its items by it, because imported data can hold two categories with the same name.
- **Drag layer** (`components/Sidebar.tsx`, `components/DragHandle.tsx`)
  - A dnd-kit `DndContext` wraps the category tree, with a pointer sensor (4 px activation), a keyboard sensor with a custom slot stepper, one sortable context for the categories and one per open category, and a drag overlay. `GripIcon` is new.
  - The grip is the only drag handle and the only part with `touch-action: none`, so a swipe on a name still scrolls. It is at least 24 by 24 px.
  - A drop line shows where the item will land, from the same resolver the drop uses. Empty categories show a 40 px drop zone. Collapsed headers are drop targets, and hovering a project over one for 500 ms opens it.
  - During a category drag every project list closes. Announcements name items and never speak an id. A drag is cancelled if the dragged item or its target disappears (for example another tab replaces the data).
  - A move is dispatched once, on drop, through the same handlers as the Move menu. Escape and Tab cancel and dispatch nothing (dnd-kit's default would drop on Tab).
  - Keyboard steps scroll instantly when reduced motion is requested.
  - Collapse state is read with an own-property check, so a category id such as `constructor` or `toString` is not mistaken for a collapsed one.
- **Helpers** (`lib/dnd-ids.ts`, `lib/drop-target.ts`, `lib/sidebar-dnd.ts`, `hooks/useHoverOpen.ts`)
  - `dnd-ids`: typed ids for categories, projects, lists and headers. `drop-target`: turns a drop position into a move. `sidebar-dnd`: keyboard slots and stepping, collision detection, `pointerDrop()` (before or after from the pointer in the viewport), screen-reader instructions and the announcement builder. `useHoverOpen`: the 500 ms open timer.
- **Dependencies and CI** (`package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `.gitignore`)
  - Added `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0 and `@dnd-kit/utilities` 3.2.2 at exact versions, plus an `overrides` entry pinning `@dnd-kit/accessibility` 3.1.1.
  - A weekly `schedule:` trigger (Mondays at 06:17 UTC) runs the Dependency audit between pull requests. Four `if: github.event_name != 'schedule'` guards keep the lint and types, unit test, build and Playwright jobs off the scheduled run.
  - The CI concurrency group is now `ci-${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}`, so a scheduled run and a push to `main` cannot cancel each other. Nothing else in the workflow changed.
  - `.superpowers/` (working notes) is ignored.
- **Tests**
  - Unit and component tests as listed below, and a new browser spec, `e2e/sidebar-drag.spec.ts`.
- **Docs**
  - `docs/decisions/0001-sidebar-drag-and-drop.md`: the decision record (new in this branch), with a "Spike results and implementation notes" section. Status stays Proposed.
  - `docs/superpowers/plans/2026-10-25-sidebar-drag-and-drop.md`: the implementation plan.
  - `docs/qa/2026-10-24-2329-qa-review.md`: new accepted trade-offs and advisories for this feature.
  - `README.md`: one line on reordering and that order is the array order in the export, and the `e2e/` description.
  - `CLAUDE.md`: project and owner notes.

## Bugs found and fixed during the work

- After the sidebar auto-scrolled during a pointer drag, the drop line and the saved move could land on the wrong side of the row under the cursor (3 of 6 test releases). dnd-kit's scroll-adjusted `delta` was compared with rectangles already in the live viewport frame. `pointerDrop()` uses the pointer in the viewport instead. The new browser specs release on the top and bottom half of a row after auto-scroll at three heights each and check the saved order and the drop line.

- Tab ended a keyboard drag and committed the move, because dnd-kit's default end keys include Tab. Tab now cancels.
- A category whose id was `constructor` or `toString` (allowed by import) rendered collapsed, because the collapse state was read from a plain object.
- Two categories with the same name gave the Move menu duplicate React keys.

## Tests added or changed

- New files: `components/MoveMenu.test.tsx`, `hooks/useHoverOpen.test.ts`, `lib/dnd-ids.test.ts`, `lib/drop-target.test.ts`, `lib/sidebar-dnd.test.ts`.
- Extended: `lib/state.test.ts` (reducer moves), `components/Sidebar.test.tsx` (Move menu and drag, including jsdom keyboard drags with Space, arrows and Escape), `components/PaintLogApp.test.tsx` (selection after a move).
- Unit suite: 13 files and 202 tests before this work, 18 files and 328 tests now. The sidebar tests include hover-open with fake timers (driven by keyboard drags, since jsdom has no layout for a resting pointer), Tab cancelling, ids such as `constructor`, and duplicate category names.
- Browser: `e2e/sidebar-drag.spec.ts` has 21 tests, run in Chromium against the production build:
  - keyboard drags with Space, arrows and Escape: within a category, into an empty category, onto a collapsed category (which opens), between categories, and a category
  - an Escape cancel leaves the saved order unchanged, and Tab cancels too (focus returns to the grip, and the next Tab moves on)
  - a pointer resting about 600 ms on a collapsed category opens it and it stays open after Escape; a quick pass leaves it shut
  - the Move menu (up, down, move to category, Escape) and its live-region text
  - an axe run (colour contrast on) with the grips shown and a Move menu open
  - one pointer drag with `page.mouse`
  - six pointer drags after auto-scroll at 390x900 (top and bottom half of the row, three heights), checking the saved move and the drop line
  - touch emulation: a swipe on a project name scrolls an overflowing list without starting a drag, and a touch drag on a grip moves a project
  - saved order is read from `localStorage` (`STORAGE_KEY`)
- The keyboard specs wait for the pick-up to settle and pause between arrow presses. Without that, Playwright's very fast keys were sometimes ignored. The settled specs passed 120 of 120 repeated runs, and the whole browser suite passed on every full run afterwards.

## Results

- `npx tsc --noEmit`: no errors.
- `npm run lint`: no errors or warnings.
- `npm test`: 18 files, 328 tests, all passing.
- `npm run build`: compiled, and `/`, `/_not-found` and `/icon.svg` are static.
- `npm run test:e2e`: 25 passed (4 existing smoke tests and 21 new).

## Caveats

- Tested in jsdom and Chromium only. No real iPhone, Android or Safari check, and no VoiceOver or other screen reader check. Touch is emulated in Chromium.
- React Strict Mode was checked by hand in dev (Chromium), not by an automated test, because Playwright runs a production build.
- CI has not run against the new lockfile (the Dependency audit job has not seen the dnd-kit packages).
- The local Node is v26.3.0, while `.nvmrc` says 22, so CI's Node 22 has not been exercised for this work.
- On a 390x700 phone viewport the sidebar leaves about 40 px of list height, so pointer drags there are fiddly. This already existed and is in the QA record for the design backlog. The Move menu is not affected.
- Dropping a project on a collapsed category also opens it. This goes beyond the original brief and needs the owner's confirmation.
- Known small items are in the QA record: stale `aria-expanded` during a category drag, the undo index and selection caveats, a very fast first arrow key being ignored, a release away from any target still moving the item to the nearest row, and the Move menu possibly clipping on a phone.
- Pointer drop logic relies on dnd-kit 6.3.1 internals. Upgrading dnd-kit or adding its modifiers needs a scrolled pointer drag re-tested in a browser.

## QA review

Reviews were run in fresh contexts on 2026-10-25, before staging:

- **Design record review:** a QA reviewer and a security analyst read ADR 0001 before any code was written. Their findings (reducer contract, viewed project handling, keyboard dragging across two levels, cancelling on another tab's change, namespaced ids, the missing osv-scanner step in CI, the exact pin of the transitive accessibility package) were folded into the ADR and the plan.
- **Per task:** each of the seven tasks had its own spec and quality review. Task 3 (Move menu focus handling) and Task 6 (scroll offset of the drop position, a missing test for a deleted drop target) each needed one fix round and a scoped re-review.
- **Whole branch:** the QA review found no critical issues and two important ones, both fixed: Tab committed a keyboard drag (it now cancels), and hover to open was untested inside the sidebar (jsdom and Playwright tests added). Minor fixes: duplicate category names in the Move menu, category ids such as constructor read as collapsed, smooth scrolling ignoring reduced motion, a touch test that could not fail, and several inaccurate documentation lines.
- **Security review:** go for staging, with no critical, high or medium findings. All conditions from the design record were checked in the code, including a fuzz run of the reducer with hostile ids and indexes. The two low findings (inherited property names read as collapsed, duplicate keys from duplicate names) are fixed.
- **Re-review:** a scoped re-review of the final fixes found all findings addressed and no new problems.

Accepted and recorded in `docs/qa/2026-10-24-2329-qa-review.md`: releasing a pointer drag away from any target still moves the item to the nearest row; the Move menu may clip on a phone with many categories and has not been checked by hand; dropping a project on a collapsed category opens it, which was added beyond the original brief and needs the owner's confirmation. Still pending: CI against the new lockfile, real iPhone and Android devices, and VoiceOver.
