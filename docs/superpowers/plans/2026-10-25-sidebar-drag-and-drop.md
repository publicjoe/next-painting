# Sidebar Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner reorder projects within a category, move them between categories, and reorder categories, by drag handle (mouse, touch, keyboard) or by an always-visible Move menu.

**Architecture:** Two library-independent reducer actions (`MOVE_CATEGORY`, `MOVE_PROJECT`) do all the data changes. The sidebar computes a target, shows a drop indicator while dragging, and dispatches one action on drop. dnd-kit (classic API) only works out the target. Order is array order, so no storage change.

**Tech Stack:** Next.js 16.4.3, React 19.3.1, Tailwind, Vitest + Testing Library + axe (jsdom), Playwright (Chromium), `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2.

**Spec:** `docs/decisions/0001-sidebar-drag-and-drop.md` (the ADR is the design document; read all of it, especially "Conditions from the reviews" and "Decisions recorded").

## Global Constraints

- Order is array order. `STORAGE_VERSION` stays 1. `lib/migrate.ts` does not change.
- Dependencies are exact pins, no carets: `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2, plus `"overrides": { "@dnd-kit/accessibility": "3.1.1" }` in `package.json`. `skipLibCheck` stays `true` in `tsconfig.json`.
- `HOVER_OPEN_MS = 500`, an exported constant.
- dnd-kit ids are namespaced: `cat:<id>`, `proj:<id>`, `list:<id>`, `hdr:<id>`. Parse by splitting on the first colon only (real ids may contain colons or be `__proto__`). Raw ids are never spoken: pass custom `announcements` and `screenReaderInstructions` built from names looked up in current state.
- Dispatch one `MOVE_*` action on drop. Escape and cancelled drags dispatch nothing. No `dangerouslySetInnerHTML` anywhere in the feature.
- Grip handles and the Move button are at least 24 by 24 CSS px, `touch-action: none` on the grip only, and the Move button is never hover-only.
- Selection (ADR decision 2): after any move, the project the user was viewing stays shown, and the selected category becomes that project's category, which also expands in the sidebar. Use the shown project (`selectedProject?.id`), not `selectedProjectId`.
- Hover-opened categories stay open after drop or cancel. A project dropped into an empty category is appended to the end of `projects`. Moves have no undo toast.
- Repo rules (`CLAUDE.md`): UK English, no en or em dashes, no AI attribution lines, Claude never commits. Add a change note `docs/changes/YYYY-MM-DD-HHMM-short-slug.md` before the owner commits, and run a `qa-reviewer` review of the uncommitted changes before staging.
- Implementation tasks go to `frontend-engineer` (model `"sonnet"`), the CI task to `devops-engineer` (`"sonnet"`), reviews to `qa-reviewer` (`"sonnet"`). Include `~/.claude/references/nextjs-pitfalls.md` in every dispatch brief.

## Review Focus

- Moving the project that is only implicitly shown (the category's first project, with `selectedProjectId` null or stale) must keep it shown. Test in Task 2.
- An id containing a colon, or equal to `__proto__`, must round-trip through the dnd-kit id helpers and the reducer. Tests in Tasks 1 and 5.
- A drag whose target category or item disappears (another tab calls `REPLACE_STATE`, a delete, or undo) must cancel without orphaning a project. Tests in Tasks 1 and 5.
- Dropping into an empty category, and onto a collapsed and empty category header, must work. Tests in Tasks 1 and 6.
- Passing quickly over a collapsed category must not open it, and the timer must clear on cancel and on unmount (React Strict Mode runs effects twice in dev). Tests in Task 5.

---

### Task 1: Reducer actions

**Files:**
- Modify: `lib/state.ts` (the `Action` union and `reducer`)
- Test: `lib/state.test.ts`

**Interfaces:**
- Produces: `{ type: 'MOVE_CATEGORY'; payload: { id: string; toIndex: number } }` and `{ type: 'MOVE_PROJECT'; payload: { id: string; toCategoryId: string; toIndexInCategory: number } }` added to `Action`.

- [ ] **Step 1: Write failing tests** in `lib/state.test.ts`, one `it` per rule, using the existing fixtures style:
  - `MOVE_CATEGORY` moves A,B,C to B,C,A with `toIndex: 2` for A (index counted after removal), and to C,A,B with `toIndex: 0` for C.
  - `MOVE_PROJECT` within a category maps the category-relative index onto the flat array (other categories' projects keep their positions).
  - `MOVE_PROJECT` to another category changes `categoryId` and inserts before the project currently at that position, after the last project when index equals the category's length, and appends to the end of the array when the target category is empty.
  - Unknown `id` or unknown `toCategoryId` returns the identical state object (`toBe`).
  - `NaN`, negative, fractional and over-length indexes clamp into `0..length` (assert the resulting order, never an exception).
  - A move to the same place returns the identical state object.
  - Ids `'a:b'` and `'__proto__'` move correctly.
  - Property-style loop over every valid `(id, toCategoryId, index)` for a small state: `isAppState(reducer(s, move))` is true (import `isAppState` from `lib/validate`) and `models` is unchanged.
  - Round trip: reorder, `JSON.parse(JSON.stringify(...))`, `migrateWithReport`, order unchanged.
- [ ] **Step 2: Run** `npx vitest run lib/state.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the two cases in `reducer`. Clamp with `Number.isInteger` (fall back to the end for non-integers) then `Math.min(Math.max(i, 0), length)`; never pass a raw index to `splice`. Return `state` unchanged for no-ops.
- [ ] **Step 4: Run** `npx vitest run lib/state.test.ts`. Expected: PASS.

### Task 2: Selection handling in PaintLogApp

**Files:**
- Modify: `components/PaintLogApp.tsx`
- Test: `components/PaintLogApp.test.tsx`

**Interfaces:**
- Consumes: Task 1 actions.
- Produces: `handleMoveProject(id: string, toCategoryId: string, toIndexInCategory: number): void` and `handleMoveCategory(id: string, toIndex: number): void`, passed to `Sidebar` as `onMoveProject` and `onMoveCategory`. Also a prop `expandCategoryId: string | null` on `Sidebar` that tells it to expand that category (cleared by a callback `onExpanded: () => void`).

- [ ] **Step 1: Write failing tests** in `PaintLogApp.test.tsx` (render with seeded storage as the existing tests do; trigger moves through the Move menu once Task 3 exists, or by calling the handlers via a test seam if the tests are written first, in which case mark them to be re-pointed in Task 3):
  - Moving the explicitly viewed project to another category keeps it shown, and the main heading becomes the new category's name.
  - Moving a different project to the top of the viewed category does not change the shown project.
  - Moving the implicitly shown project (nothing selected) keeps it shown.
  - Moving a category changes nothing that is shown.
- [ ] **Step 2: Run** `npx vitest run components/PaintLogApp.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** both handlers. Before dispatching, pin the selection: `setSelectedProjectId(selectedProject?.id ?? null)`; if the moved project is the shown one, also `setSelectedCategoryId(toCategoryId)` and set `expandCategoryId`. This keeps the existing first-project fallback but stops a move from changing what is shown. Do not reuse `handleSelectCategory`.
- [ ] **Step 4: Run** the same command. Expected: PASS.

### Task 3: Move menu, live region and sidebar row layout

**Files:**
- Create: `components/MoveMenu.tsx`, `components/MoveMenu.test.tsx`
- Modify: `components/Sidebar.tsx`, `components/Sidebar.test.tsx`, `components/icons.tsx` (add `GripIcon`)

**Interfaces:**
- Consumes: Task 2 handlers via new `Sidebar` props `onMoveProject`, `onMoveCategory`.
- Produces: `MoveMenu` with props `{ label: string; options: { label: string; onSelect: () => void; disabled?: boolean }[] }` (a button with `aria-haspopup="menu"` and `aria-expanded`, a list of menu buttons, Escape closes and returns focus to the trigger). `Sidebar` gains a visually hidden `role="status"` live region that announces each move, for example `Moved project "Intercessors" to category "Space Marines", position 2 of 5.`

- [ ] **Step 1: Write failing tests**: menu opens and closes with click and Escape and returns focus; "Move up" is disabled for the first item and "Move down" for the last; a project's menu lists "Move to <category>" for every other category and calls `onMoveProject(id, categoryId, <that category's project count>)`; selecting an option announces the result in the live region; axe passes for the sidebar with menus open and closed (`lib/test-axe.ts`).
- [ ] **Step 2: Run** `npx vitest run components/MoveMenu.test.tsx components/Sidebar.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `MoveMenu`, then change `Sidebar`: category rows get a grip placeholder (inert until Task 5), name button and the Move button beside rename and delete (always visible, not in the hover-only group); project rows become siblings (grip placeholder, name button with the existing `aria-current` and progress text, Move button) instead of one full-width button. Keep every existing accessible name so existing tests still pass. Tailwind classes follow the surrounding rows.
- [ ] **Step 4: Run** the sidebar, PaintLogApp and MoveMenu tests. Expected: PASS, including the Task 2 tests now driven through the menu.

### Task 4: Dependencies and scheduled audit

**Files:**
- Modify: `package.json`, `package-lock.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: the three dnd-kit packages importable from the app.

- [ ] **Step 1:** Run `npm install --save-exact @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2`. Add `"overrides": { "@dnd-kit/accessibility": "3.1.1" }` to `package.json` and run `npm install` again.
- [ ] **Step 2:** In `ci.yml` add a weekly trigger under `on:` (for example `schedule: - cron: '17 6 * * 1'`) and add `if: github.event_name != 'schedule'` to the `lint-and-types`, `unit-tests`, `build` and `e2e` jobs, so only `audit` runs on the schedule. Keep every pinned action SHA unchanged.
- [ ] **Step 3: Verify** `npm ci`, `npm audit --audit-level=high`, `npx next typegen && npx tsc --noEmit`, `npm run lint`, `npm test` all succeed and `git diff package-lock.json` shows only `@dnd-kit/*` and `tslib`-level changes. Expected: all exit 0. Report the lockfile diff summary to the owner.

### Task 5: Drag helpers and hover-open hook

**Files:**
- Create: `lib/dnd-ids.ts`, `lib/dnd-ids.test.ts`, `lib/drop-target.ts`, `lib/drop-target.test.ts`, `hooks/useHoverOpen.ts`, `hooks/useHoverOpen.test.ts`

**Interfaces:**
- Produces:
  - `type DndKind = 'cat' | 'proj' | 'list' | 'hdr'`; `dndId(kind: DndKind, id: string): string`; `parseDndId(value: unknown): { kind: DndKind; id: string } | null` (null for non-strings, unknown prefixes, empty ids).
  - `resolveProjectDrop(projects: Project[], activeId: string, over: { kind: DndKind; id: string }, after: boolean): { toCategoryId: string; toIndexInCategory: number } | null`: over a project means before it (or after it when `after`); over a `list` or `hdr` means the end of that category; null when the active project or the over target does not exist, or when the result would not move anything.
  - `resolveCategoryDrop(categories: Category[], activeId: string, overId: string, after: boolean): number | null`.
  - `const HOVER_OPEN_MS = 500` and `useHoverOpen(options: { overId: string | null; isOpenable: (id: string) => boolean; onOpen: (id: string) => void; delayMs?: number }): void`. It starts a timer when `overId` becomes an openable target, clears it when `overId` changes, and on unmount.
- [ ] **Step 1: Write failing tests**: ids with colons and `'__proto__'` round-trip; `parseDndId` rejects `'x:1'`, `''`, `'cat:'`, `42`; drop resolution for before, after, end of a non-empty category, empty category, same-place (null) and missing ids (null); the hook with fake timers: opens after 500 ms of resting, does not open when `overId` changes at 499 ms, clears on unmount, does not call `onOpen` twice for the same rest, and a double mount-unmount-mount (Strict Mode) leaves exactly one live timer.
- [ ] **Step 2: Run** `npx vitest run lib/dnd-ids.test.ts lib/drop-target.test.ts hooks/useHoverOpen.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the modules. Pure functions in `lib`, hook with `useEffect` and cleanup.
- [ ] **Step 4: Run** the same command. Expected: PASS.

### Task 6: Drag layer in the sidebar

**Files:**
- Modify: `components/Sidebar.tsx`, `components/Sidebar.test.tsx`, `components/icons.tsx` if the grip needs variants
- Create: `components/DragHandle.tsx`

**Interfaces:**
- Consumes: Task 3 props and live region, Task 4 packages, Task 5 helpers.
- Produces: `DragHandle` (props `{ label: string; attributes; listeners; setActivatorNodeRef }` rendering the six-dot button with `touch-action: none`, minimum 24 by 24 px, `aria-label="Drag <name>"`).

- [ ] **Step 1: Write failing tests** (jsdom cannot measure rectangles, so test behaviour that does not need them): grips render with names and are keyboard focusable; the project items of a collapsed category are not in the DOM while the list element and its `aria-controls` id remain; the empty category list renders a drop zone with a minimum height; announcements text for start, over, end and cancel uses names and never raw ids (call the exported announcements builder directly); a drag in progress is cancelled when the dragged item disappears from props; Escape dispatches no move.
- [ ] **Step 2: Run** `npx vitest run components/Sidebar.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `DndContext` with a `PointerSensor` (small `distance` activation constraint) and a `KeyboardSensor` with a custom coordinate getter, one `SortableContext` for categories and one per expanded category for projects, a `DragOverlay`, collision detection filtered by the active item's kind (category hits only categories; project hits projects, `list` droppables and collapsed `hdr` droppables), `MeasuringStrategy.Always`, a line-shaped drop indicator at the resolved position, `useHoverOpen` for collapsed headers while a project is dragged, a visual collapse of project lists while a category is dragged, and a single `onMoveProject` or `onMoveCategory` call from `onDragEnd` via the Task 5 resolvers. Cancel on `onDragCancel`, Escape, or when the active item no longer exists. If the stock keyboard coordinates cannot reach empty or collapsed categories, write the custom getter; if that cannot be made to work, stop and report to the owner, because the ADR names `@atlaskit/pragmatic-drag-and-drop` as the fallback.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS. Then manually in `npm run dev` (Strict Mode on) check: drag within a category, into another category, onto a collapsed category (rest 500 ms opens it, a quick pass does not), into an empty category, reorder categories, all again with the keyboard. Report what was observed.

### Task 7: Browser tests, QA record, change note and review

**Files:**
- Create: `e2e/sidebar-drag.spec.ts`, `docs/changes/<timestamp>-sidebar-drag-and-drop.md`
- Modify: `docs/qa/2026-10-24-2329-qa-review.md`, `README.md` (one short paragraph on reordering and the order-is-array-order note if the README documents the data format)

- [ ] **Step 1: Write Playwright specs** (Chromium, production build): keyboard drag with Space, arrows and Escape for a project within a category, into an empty category, onto a collapsed category and between categories, and for a category; a pointer drag using `page.mouse.down`, several `page.mouse.move` steps past the activation distance and `page.mouse.up`; Escape cancel leaves order unchanged; the Move menu works; axe passes with the grips and menus (this covers contrast, which jsdom axe skips); touch emulation (`hasTouch`) does not scroll-jank the grip.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: PASS. If a pointer drag is flaky, prefer the keyboard path for assertions and keep one pointer smoke test.
- [ ] **Step 3: Update docs.** In the QA record add: undo index caveat for categories, projects and delete-then-move-then-restore; selection after undo can show the wrong heading; iOS Safari and Android touch unverified until tested by hand on a real device; Strict Mode covered only by the manual dev check; frozen upstream dnd-kit. Write the change note per `CLAUDE.md` (title, date and time, summary, changes by area with paths, tests added and the results of `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build`, caveats).
- [ ] **Step 4: Verify** `npx next typegen && npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` all pass.
- [ ] **Step 5: Dispatch `qa-reviewer`** (fresh context, `model: "sonnet"`) on the uncommitted changes and a `security-analyst` (`"opus"`) check of the new code against ADR conditions. Fix or report findings, record the review in the change note, and tell the owner. Do not commit or stage.
