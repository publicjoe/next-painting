# ADR 0001: Drag-and-drop reordering in the sidebar

- **Status:** Proposed. It becomes Accepted when the spike under "Validation before build" passes, because the keyboard criteria there could still overturn the library choice.
- **Date:** 2026-10-25
- **Deciders:** the project owner (feature scope, storage format, selection behaviour), solutions architect (mechanism and library)
- **Supersedes:** nothing. This is the first decision record in this repository.

## Context

Baseline: facts about this repository are `[HIGH - source code]`, read on 2026-10-25 at `main` plus the `feature/sidebar-drag-categories` branch.

PaintLog is a client-side Next.js 16.4.3 App Router app on React 19.3.1, with three runtime dependencies (`next`, `react`, `react-dom`). All data lives in `localStorage` under a versioned envelope (`STORAGE_VERSION = 1` in `lib/migrate.ts`).

The sidebar (`components/Sidebar.tsx`) lists categories. Each category has a collapsible nested list of its projects. Collapse state is local to the sidebar and is not persisted. Collapsed lists stay mounted with the `hidden` attribute. Projects are one flat array in `AppState.projects`, and the sidebar filters it by `categoryId`. There is no order field: categories and projects already appear in array order, and `strip()` in `lib/migrate.ts` and `isAppState()` in `lib/validate.ts` both preserve order and ignore it.

The sidebar is a scroll container. On mobile the `<aside>` is capped at `max-h-[40vh]` with `overflow-y-auto`, and the inner list also scrolls.

`PaintLogApp` renders a loading shell until `isLoaded` is true, so the sidebar is never server-rendered with data. Every edit goes through `reducer` in `lib/state.ts` and is saved after a 300 ms debounce. Other tabs receive the change through the `storage` event and apply it with `REPLACE_STATE`.

The owner has agreed the following feature:

- A six-dot grip handle to the left of each project name and each category name, which the user presses and drags.
- Projects can be reordered within a category and moved into another category. Categories can be reordered among themselves.
- A visible drop indicator shows where the item will land.
- The feature works with mouse, touch and keyboard, with screen-reader announcements, to WCAG 2.2 AA. That includes SC 2.5.7, Dragging Movements.
- Hovering a dragged project over a collapsed category for about 500 ms (tunable) opens it. Passing over without resting leaves it shut.
- Dropping into an empty category works.
- Order is stored as array order. The owner also made a decision on selection, recorded below.

CI blocks merges on a "Dependency audit" job that runs `npm ci` then `npm audit --audit-level=high` (checked in `.github/workflows/ci.yml` and the branch protection rules on 2026-10-25). This repository has no osv-scanner step, because the shared organisation workflow does not apply to a personal account. Only high and critical advisories block, nothing scans between pull requests, and Dependabot is off. The owner also wants few dependencies. Tests are Vitest with jsdom, Testing Library and axe, plus Playwright in Chromium only, run against a production build. The owner is learning Next.js from this project.

## Decision drivers

1. **Input coverage.** Mouse, touch and keyboard dragging, with screen-reader announcements, plus a single-pointer alternative for SC 2.5.7.
2. **Correct behaviour inside a scrolling sidebar.** This covers auto-scroll near the edges, and a touch drag that does not fight page scrolling.
3. **A two-level structure.** Categories are sortable, projects are sortable within and between categories, and the design adds two special drops: onto a collapsed category and into an empty one.
4. **React 19.3 and Next 16 compatibility, including dev-mode Strict Mode.** App Router turns Strict Mode on by default, so every effect runs twice in development.
5. **Maintenance state and release recency.**
6. **Dependency and audit exposure.** The fewer packages and transitive dependencies, the better.
7. **Bundle size.**
8. **Testability** in jsdom (Vitest) and in Playwright.
9. **Reversibility.** It should be cheap to replace the library later.

## Options considered

Unless a claim carries its own tag, every version, date and dependency below is `[HIGH - tool output]`, verified on 2026-10-25 with `npm view`, the GitHub API (`gh`) and the OSV API (`api.osv.dev/v1/query`). OSV reported no known vulnerabilities for any package version named in this section. **Scope:** that check covers advisories published in OSV for these exact versions only. It does not cover unpublished vulnerabilities, code review of the packages, or the result of the repository's own osv-scanner run once a lockfile exists.

### A. `@dnd-kit/core` 6.3.1 with `@dnd-kit/sortable` 10.0.0 (the classic dnd-kit API)

- **What it is.** A React-specific toolkit. Its runtime dependencies are `tslib`, `@dnd-kit/accessibility` 3.1.1 and `@dnd-kit/utilities` 3.2.2. The peer range is `react >=16.8.0`.
- **Size.** About 22 kB gzipped for core and about 5 kB for sortable. Both figures come from gzipping the unminified ESM bundles in the published tarballs, so the minified size will be smaller.
- **Input and accessibility.** It ships pointer, mouse, touch and keyboard sensors. It also ships screen-reader instructions and live-region announcements, auto-scroll of scrollable ancestors, and multiple sortable containers, including empty ones. `[DATED]`: this description of behaviour comes from prior knowledge of the library, not from a test this session.
- **Maintenance.**
  - The last release was on 2024-12-05.
  - These packages are no longer in the repository's `packages/` directory.
  - The maintainer is closing classic-API issues and pointing people to the rewrite. For example, issue #1511 ("Support React 19 & Nextjs 15") was closed on 2026-02-16.
  - **In practice the API is frozen and unsupported upstream. If a bug or advisory appears, nobody upstream will fix it.**
- **React 19 typings.** The published `.d.ts` files use the global `JSX.Element`, which the repository's `@types/react` 19.3.0 no longer declares.
  - `[HIGH - tool output]`: a sample using `DndContext`, `SortableContext`, `useSortable` and `DragOverlay` type-checks cleanly under this repository's settings (`strict`, `skipLibCheck: true`). It produces seven "Cannot find namespace 'JSX'" errors once `skipLibCheck` is turned off.
  - Those component return types therefore degrade to `any`. This is harmless, but it ties the decision to `skipLibCheck` staying on.
- **Strict Mode.** Its providers use ordinary effects with cleanups. `[LOW]`: I inferred that it behaves correctly under double-invoked effects from wide production use. I have not tested it on React 19.3.
- **Testing.** Pointer and keyboard drags can be driven in Playwright. In jsdom every rectangle is zero, so collision detection means nothing there.

### B. `@dnd-kit/react` 0.5.1 (the rewritten dnd-kit API)

- **What it is.** The active line of the same project. It was released on 2026-10-15, and the repository was last pushed on 2026-10-22. The peer range is `react ^18 || ^19`. It pulls in `@dnd-kit/dom`, `abstract`, `state` (which depends on `@preact/signals-core`), `geometry` and `collision`.
- **Input and accessibility.** It has the same built-in pointer and keyboard sensors and accessibility support as the classic line.
- **Release churn.** It is still 0.x, and minor releases carry breaking changes. Version 0.4.0 redesigned the event types, for example.
- **Strict Mode bug.** Issue #2116 (2026-07-31) is open and labelled a bug by the maintainer: under React 19 Strict Mode, `DragDropProvider` destroys its manager during effect replay, so drags can fail in development. The fix, PR #2117, is open and not merged.
- **Other open issues** touch on this design directly:
  - #2008: nested droppable sortables stop working.
  - #1940: `removeChild` errors with multiple sortable lists.
  - #1992: slow auto-scroll on mobile.
- **Verdict.** This is the right long-term destination, but not yet. A learner would hit a dev-only failure on day one, and could not tell it apart from their own bug.

### C. `@atlaskit/pragmatic-drag-and-drop` 4.0.0, with `-hitbox` 3.0.0 and `-auto-scroll` 3.2.1

- **What it is.**
  - A thin wrapper over the browser's native HTML5 drag and drop. It is maintained by Atlassian under the Apache-2.0 licence.
  - Release 4.0.0 came out on 2026-09-24. The core dependencies are `raf-schd`, `@babel/runtime` and `bind-event-listener`.
  - The README claims "~4.7kB core" and full support on iOS and Android.
- **Strengths.** It has no provider, and the hitbox package handles closest-edge detection well for tree-shaped drops.
- **Keyboard and screen readers.** There is no keyboard dragging. Atlassian's guidance is an action-menu alternative. Its React accessibility package pulls in Emotion and Atlassian design-system packages, so we would hand-write that path instead.
- **Native drag limits.** The browser controls the drag preview, and touch drags start with a long press.
- **Touch is unverified.** `[LOW]`: I could not confirm from a primary source this session how native drag on iOS Safari behaves inside an overflow container with a 40vh cap. The README claims support, and community reports are older and mixed.
- **Testing.** jsdom has no real `DataTransfer`. Playwright's `dragTo` covers native drag in Chromium, but this repository has no WebKit or mobile project.
- **Fit to the requirements.** It meets most of them, but it does not meet "keyboard dragging with screen-reader announcements" as written.

### D. `react-aria` 3.53.1 / `@react-aria/dnd` 3.12.1

- **Strengths.** It is active, supports React 19, and has strong accessibility built in.
- **Weaknesses.** Its drag and drop is built around its own collection components (`useDraggableCollection`, `GridList`, `Tree`). The sidebar would have to be rebuilt as a react-aria collection. It also pulls in a large tree: `react-stately`, `@internationalized/*`, `@swc/helpers`, `aria-hidden` and others.
- **Verdict.** Too much restructuring and too much dependency surface for one feature.

### E. Hand-rolled pointer events with no library

- **Strength.** It adds no dependencies.
- **Weakness.** We would own every hard part: nested hit testing, auto-scroll inside two nested scroll containers, pointer capture on iOS, cancel and restore, keyboard mode, and announcements. Each one is a source of bugs that never ends, and none of them would get upstream fixes. That is the wrong scope for a learning project.

### F. Native HTML5 drag and drop with no library

- **Verdict.** It has no keyboard path, it has the same touch uncertainty as C, and the cross-browser quirks that C exists to absorb would land on us. It is dominated by C.

### How the choice was made

This was a genuine multi-option decision, so it went to the `llm-council` skill, with five advisors and anonymised peer review.

- The advisors split three to two for C over A.
- All five peer reviewers named the case for A as the strongest. They gave two reasons: A meets every stated requirement as written, and the case for C quietly drops keyboard dragging and leaves the riskiest unknown, touch in a scrolling container on iOS, unverified and untestable in this repository's CI.
- The chairman recommended A, with a spike first and C as the fallback.
- After the council, I checked the OSV results and the type-check result myself (see A). Both support A.

## Decision

1. **Library.** Use the classic dnd-kit API, pinned to exact versions in `dependencies`, with no caret ranges, to match how `next` and `react` are pinned:
   - `@dnd-kit/core` 6.3.1
   - `@dnd-kit/sortable` 10.0.0
   - `@dnd-kit/utilities` 3.2.2

   `@dnd-kit/utilities` is only needed if the code imports `CSS` from it directly. `tslib` and `@dnd-kit/accessibility` 3.1.1 come in transitively.
2. **The reorder is a pure reducer action, independent of any library.**
   - Add `MOVE_CATEGORY { id, toIndex }` and `MOVE_PROJECT { id, toCategoryId, toIndexInCategory }` to `lib/state.ts`.
   - Unit-test both in Vitest.
   - The library only works out the target. It never touches `AppState`. This is what keeps option A replaceable.
3. **Dispatch once, on drop.**
   - During a drag, the sidebar shows a local preview of the order, or an indicator line, from its own drag state.
   - It dispatches a single `MOVE_*` action when the item is dropped.
   - Escape, or a cancelled drag, dispatches nothing.

   This avoids a debounced save and a cross-tab `storage` event on every `dragOver`, and it keeps cancellation trivial.
4. **A single-pointer, non-drag path is mandatory, and it is built first.**
   - Each project row and category row gets a "Move" control: Move up, Move down, and for projects, Move to a chosen category.
   - The control calls the same reducer actions and announces the result through a live region.
   - This is what satisfies SC 2.5.7. Keyboard dragging does not, because 2.5.7 asks for a single-pointer alternative. The control also works without a drag library, so it can ship and be tested independently.
5. **The drag UI** is built with dnd-kit as follows:
   - **Grip handle.**
     - The handle is the drag activator (`setActivatorNodeRef`), sized to at least 24 by 24 CSS px for SC 2.5.8, and it has `touch-action: none`.
     - Only the handle captures touch, so the rest of the sidebar scrolls normally.
     - Use a `PointerSensor` with a small distance constraint, so a click on the handle is not treated as a drag.
     - Use a `KeyboardSensor` for keyboard dragging, with custom announcements that use category and project names, not ids.
   - **Drop indicator.** A line at the computed insertion point, not dnd-kit's default shuffle transforms, because the owner asked for an indicator.
   - **Collapsed categories.**
     - Each collapsed category header is a droppable. While a project is over it, a timer opens the category after `HOVER_OPEN_MS = 500`, an exported constant.
     - The timer is cleared whenever `over` changes, and when the drag ends or is cancelled.
     - Projects inside a collapsed category register no sortables. A `hidden` element measures as a zero-size rectangle at the origin, which would corrupt collision detection.
   - **Empty categories.** Each category's project list is a droppable even when it is empty. The "No projects" row is the drop zone.
   - **Measuring.** Use `MeasuringStrategy.Always` (or `WhileDragging`), so lists that open in the middle of a drag are measured.
   - **Collision filtering.** Collision detection is filtered by the type of the active item. A dragged category only ever collides with categories. A dragged project collides with projects, category lists and collapsed category headers.

## Storage version: no bump needed

`[HIGH - source code]`: storing order as array order changes no field, no type and no meaning in the stored shape. `isAppState` does not depend on order. `strip()` uses `map`, so order is preserved. Export writes `JSON.stringify(state)`, which preserves array order. Import and load run `migrateWithReport`, which preserves it too.

**`STORAGE_VERSION` stays at 1, and `lib/migrate.ts` does not change.**

Data written by the new build is valid for older builds and for `main`. An older build shows the user's new order, because it already renders in array order. The README rule ("any change to the stored shape must bump `STORAGE_VERSION`") does not apply, because the shape is unchanged. The only change is the meaning users attach to the order, and every build already honours that order.

If an explicit `order` field is ever added, that would change the shape and would need a bump.

## Consequences

### Positive

- One library covers mouse, touch, keyboard dragging, announcements and auto-scroll for both levels of the tree.
- The dependency footprint is small: five packages including transitive ones, all MIT-licensed, with no advisories in OSV as of 2026-10-25.
- The reducer actions and the Move control carry the accessible core of the feature and can be tested in jsdom with axe. The library is a thin layer that can be replaced.
- The sidebar never server-renders with data, because `PaintLogApp` gates on `isLoaded`. That avoids dnd-kit's known hydration mismatch on its generated `aria-describedby` ids. `[LOW]`: I inferred this from the gating, and it was not observed.

### Negative, accepted

- **The library is frozen upstream.** If it develops an advisory, breaks on React 20 or meets a browser regression, we either patch it locally or migrate. A high or critical advisory would fail the `npm audit --audit-level=high` job and block merges. Moderate and low advisories would not, and nothing scans between pull requests, so the conditions below add a scheduled audit.
- **The type check depends on `skipLibCheck: true`.** If someone turns it off, seven lib errors appear. Do not turn it off without first replacing the library.
- **Bundle cost.** The client bundle grows by roughly 25 kB gzipped or less after minification. That is acceptable for a single-page tool.
- **Drag interactions cannot be meaningfully unit-tested in jsdom,** because every rectangle is zero. Drag behaviour is covered by Playwright in Chromium only. Touch behaviour is a manual check on real devices, and iOS Safari is unverified until it is tested by hand.
- **Undo positions.** `RESTORE_ITEMS` re-inserts at the absolute array index captured at delete time. If items are reordered between a delete and its undo, the restored item lands at that index. Within its category, that may not be exactly where it was. Accept and note this in the QA record, in the same way as the existing "Selection fallback after undo" trade-off.

### What would cause a revisit

- `@dnd-kit/react` reaches 1.0 with #2116 fixed and the nested-sortable issues closed. Migrate then. Only the sidebar's drag layer changes.
- An OSV advisory against any of the pinned packages.
- React 20, or any React or `@types/react` release that breaks the classic packages at runtime or under `skipLibCheck`.
- The spike below fails.

## Validation before build

Run a spike of about an hour on a throwaway branch before the dependency lands on the feature branch. The fallback if it fails is option C: `@atlaskit/pragmatic-drag-and-drop` 4.0.0 with `-hitbox` 3.0.0 and `-auto-scroll` 3.2.1, plus the same Move control and a hand-written live region.

1. Run `npm install --save-exact` for the three packages, then `npx tsc --noEmit`, `npm run lint` and `next build`.
2. In `next dev`, where Strict Mode is on, drag a project:
   - within a category,
   - into another category,
   - onto a collapsed category, both with a 500 ms rest and with a quick pass that should leave it shut,
   - into an empty category.
3. Reorder the categories.
4. Repeat the moves with the keyboard and with VoiceOver, and confirm the announcements.
5. Repeat the moves on a real phone inside the 40vh sidebar, on iOS Safari and on Android Chrome, while also scrolling the sidebar.
6. Push the branch and confirm the CI Dependency audit job passes against the new lockfile. Until that has run, the dependency is not cleared.
7. Keyboard pass criteria, each of which must work with the keyboard alone: move a project into an empty category, onto a collapsed category, and between two categories, and reorder a category. dnd-kit's stock keyboard coordinates probably cannot do the first three, so a custom coordinate getter may be needed. If it cannot be done in the hour, option A has not met "every stated requirement" and the fallback applies.

The reducer actions and the Move control do not depend on this spike, so they can proceed in parallel.

## Conditions from the reviews

Two fresh agents reviewed this record on 2026-10-25, a QA reviewer and a security analyst. Their findings that change the design are binding on the plan.

**Before the dependency lands**
- Add a weekly `schedule:` trigger to the Dependency audit job, or turn on Dependabot alerts without pull requests, so a new advisory surfaces between PRs. Optionally add an osv-scanner step against `package-lock.json`.
- Pin the transitive package with `"overrides": { "@dnd-kit/accessibility": "3.1.1" }` in `package.json`, because the top-level exact pins do not cover the caret ranges beneath them. Review any lockfile diff that touches `@dnd-kit/*` as if it were code.

**Reducer contract** (`lib/state.ts`, unit-tested in Vitest before any UI)
- `MOVE_CATEGORY { id, toIndex }`: `toIndex` is the position in the categories array after the item has been removed. `MOVE_PROJECT { id, toCategoryId, toIndexInCategory }`: `toIndexInCategory` is the position among that category's projects after the item has been removed. The reducer maps it onto the flat array by inserting immediately before the project currently at that position in the target category, or immediately after the last project of that category when the index equals its length. If the target category has no projects, append to the end of the array.
- Unknown `id` or unknown `toCategoryId`: return the same state object. Non-integer, negative or `NaN` indexes are clamped to the range 0 to length, never passed raw to `splice`. A move to the same place returns the same state object, so no save or cross-tab write happens.
- Moving a project into its own category is a pure reorder.
- Tests: one per rule above, plus a property-style test that `isAppState(reducer(state, anyMove))` always holds for a valid state, plus a round trip (reorder, then export and import through `migrateWithReport`, order unchanged).

**Interruptions**
- If another tab replaces the data (`REPLACE_STATE`), or the dragged item or target no longer exists, cancel the drag. The reducer checks above are the backstop, since an orphaned project would make the whole stored state fail `isAppState` on the next load.

**Ids and announcements**
- Give dnd-kit namespaced ids (`cat:`, `proj:`, `list:`, `hdr:` plus the real id) and parse them in one function that rejects unknown prefixes. dnd-kit needs ids unique across every draggable and droppable in a context, and the import check only enforces uniqueness within each type.
- Pass a full custom `announcements` object and custom `screenReaderInstructions`, with names looked up from current state, so raw ids are never spoken. Never use `dangerouslySetInnerHTML` in the indicator, Move menu or overlay.

**Selection, concretely** (decision 2)
- "The viewed project" means the project actually shown, `selectedProject?.id` in `PaintLogApp`, which may be the implicit first project of the category. It does not mean `selectedProjectId`, which can be null or stale.
- A new handler sets both the selected project and the selected category when the viewed project moves. It must not reuse `handleSelectCategory`, which clears the selected project. The sidebar expands the new category through a new prop or callback, because its collapse state is private.
- Undo after delete can restore a selection to a project that has since moved, leaving the heading wrong. Record this in the QA file alongside the existing selection-fallback-after-undo entry.

**Layout of the drag**
- Use a `DragOverlay`, because the sidebar has two nested scroll containers that would clip an in-place preview.
- While a category is dragged, its project list collapses visually, so collisions are not ambiguous.
- The "No projects" row is too small as a drop zone. Give the empty list a taller drop area, and make the category header the drop target when a category is collapsed and empty. Dropping on a category header appends to the end of that category.
- Items in a collapsed category must be unmounted, not just hidden, to register no sortables. The list element and its `aria-controls` id stay.

**Undo scope.** The `RESTORE_ITEMS` index caveat applies to categories as well as projects, and to a project deleted before a move and restored after. Record all three in the QA file.

**Test plan**
- Vitest and jsdom: the reducer, the Move control, live-region text, axe, and the hover-open timer extracted into a small hook tested with fake timers (cleared when the hovered target changes, and on drop or cancel).
- Playwright in Chromium: keyboard drags (Space, arrows, Escape), which are far more stable than pointer drags, plus pointer drags driven with `page.mouse.down` and several `move` steps past the activation distance, not `dragTo`. Touch can be partly covered with touch emulation.
- Playwright runs against a production build, where Strict Mode does not apply, so Strict Mode is covered only by the manual dev-mode spike. Grip and indicator contrast needs the Playwright axe run, because jsdom axe has contrast checking switched off.
- iOS Safari and Android Chrome touch stay a manual check on real devices.
- Pointer versus touch sensor: use a `PointerSensor` with a distance constraint on the handle, with `touch-action: none` on the handle only. If the spike shows accidental drags while scrolling on a phone, switch to a `TouchSensor` with a press delay.

## Decisions recorded

1. **Order is stored as array order** (owner's decision). There is no order field. Categories are ordered by their position in `categories`. Projects stay in the single flat `projects` array, and a project's position within its category is its position among that category's projects in the array. Moving a project to another category changes its `categoryId` and its array position in one reducer action. No storage version bump is needed (see above).
2. **Dragging does not change what the user is viewing** (owner's decision, 2026-10-25; the owner may revisit it after trying the feature).
   - If the dragged project is the one shown in the main area, it stays shown even though its category has changed. The main area does not jump to a different project.
   - The main area heading, and the category that "Add project" adds to, follow the project to its new category (owner's decision). The view of the project is unchanged; only the category it belongs to, and therefore the heading, changes.
   - Dragging a category, or a project that is not being viewed, does not change what is shown.
   - Implementation note: `PaintLogApp` currently derives the shown project from the selected category's projects, falling back to that category's first project. That logic would make the main area jump when the viewed project leaves its category, so it must change to honour this decision. The selected category must be updated to the viewed project's new category when it moves.
   - Open for the design: selecting the new category also highlights it in the sidebar and expands it, which is the intended result of "the heading follows".
3. **Hover to open** (owner's decision, with the 500 ms figure and the stay-open behaviour as the architect's calls). A collapsed category opens only after a dragged project rests over it for `HOVER_OPEN_MS` (500 ms, tunable in one constant). A pass without resting leaves it shut. A category opened this way stays open after the drop and also if the drag is cancelled.
4. **Keyboard and touch are required, not optional.**
   - Every move is possible with mouse, touch and keyboard.
   - Screen-reader announcements name the item and its destination.
   - A single-pointer "Move" control satisfies WCAG 2.2 SC 2.5.7.
   - Grip handles meet SC 2.5.8 (at least 24 by 24 CSS px).
   - Escape cancels a drag with no change to the data.
5. **Smaller calls made by the architect, not yet confirmed by the owner.**
   - A project dropped into an empty category is appended to the end of the `projects` array.
   - Moves have no undo toast for now.
   - The Move control is a small always-visible menu button on each row, to keep rows uncramped on phones. Project rows in the sidebar have no rename or delete buttons today (those live in the main area), so the project row needs a new layout: grip, name button, then the Move button, as siblings rather than nested inside the existing full-width button. Category rows already hide rename and delete until hover on desktop, but the Move button must not be hover-only, because it is the accessible alternative to dragging.
   - The Move control follows decision 2 exactly as dragging does.
6. **Mechanism.** The drag mechanism is the classic dnd-kit API (`@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2), pinned to exact versions, behind library-independent reducer actions. The planned exit is `@dnd-kit/react` once it is stable.

## Spike results and implementation notes

Date: 2026-10-25. Status stays Proposed: the real-device checks below are still outstanding.

- **Keyboard criteria met.** Keyboard dragging into an empty category, onto a collapsed category, between categories, and reordering categories all work in Chromium, in dev (React Strict Mode on) and in a production build. dnd-kit's stock keyboard coordinates cannot reach empty or collapsed categories, so the sidebar uses a custom keyboard slot stepper: the Up and Down arrows step through every insertion point in visual order (`lib/sidebar-dnd.ts`), and collision detection returns exactly the chosen slot.
- **Scroll bug found and fixed.** A before and after check in a short, scrolling sidebar found that the before or after half was wrong after auto-scroll: 3 of 6 releases landed on the wrong side of the row under the cursor. The cause was using dnd-kit's scroll-adjusted `delta` against rectangles that are already in the live viewport frame. `pointerDrop()` now decides from the pointer in the viewport and never uses `delta`. It relies on dnd-kit 6.3.1 internals, so a library upgrade needs a scrolled pointer drag re-tested in a browser.
- **Drop onto a collapsed category also opens it.** This goes beyond the original brief. It matches the Move menu, which already opens the target category. The owner is to confirm it.
- **Cancel on data change uses a synthetic Escape.** dnd-kit 6 has no public cancel call, so when the dragged item or its target disappears (for example after another tab's `REPLACE_STATE`), the sidebar dispatches an Escape `keydown` on `document`, which both sensors treat as cancel. An `isCancelled` flag also blocks the drop in case that event is missed.
- **The cancel on data change is narrower than the Interruptions condition.** The condition says to cancel when another tab replaces the data (`REPLACE_STATE`). The sidebar cancels only when the dragged item or its drop target disappears. A pure reorder from another tab is safe: the drop is resolved against the new order at release, and the reducer checks reject anything that no longer exists, so cancelling every replace would only interrupt the user for no benefit.
- **Tab cancels a keyboard drag.** dnd-kit's default keys also drop on Tab, which would commit a move as the user tries to leave. The keyboard sensor is given `cancel: ['Escape', 'Tab']`, and the screen-reader instructions say so. dnd-kit then returns focus to the grip, and the next Tab moves on.
- **Still pending.** Real iPhone, real Android and VoiceOver checks have not been done. Touch has been emulated in Chromium only.
