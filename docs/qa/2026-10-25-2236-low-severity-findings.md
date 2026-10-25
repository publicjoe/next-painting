# Low severity QA findings from PRs #20 and #21

Date: 2026-10-25 22:36
Reviewed: `feature/drag-units` (merged as PR #20) and `feature/unique-names` (merged as PR #21), Next.js 16.4.3
Reviewers: `qa-reviewer` agent, fresh context, read-only. One review per PR.

## How to use this file

These are the Low findings from the two reviews that were left open when the PRs were merged. Neither review found a Critical or High issue, and the Medium findings were fixed before merge. The main record, `docs/qa/2026-10-24-2329-qa-review.md`, holds accepted trade-offs and unverified areas. Remove an entry here once it is fixed, and note the fix in `docs/changes/`.

Items marked "not reproduced" were reasoned from the code and need checking by hand in a browser first.

## Open findings

### Unit drag and drop (PR #20)

1. **Focus can jump after a pointer drop that changes nothing.** `focusAfterMove` in `components/ModelTable.tsx` is set on every unit drag end. It is used on the next render, but only if focus is on `<body>`. Safari and some Firefox setups do not focus a button on mouse down, so after a pointer drag dropped back in place, focus may move to that row's Move button. Harmless and one-shot. Not reproduced.
2. **A repeated Move menu announcement is not spoken again.** The status text in `components/ModelTable.tsx` is plain state. If the same string is set twice, the region does not change and a screen reader stays silent. Hard to reach, because the position in the text usually changes. The sidebar status region has the same pattern. A fix is to clear the text and then set it.
3. **The fixed Move menu can close at once on a narrow screen.** In `components/MoveMenu.tsx` the `fixed` menu closes on any scroll outside it. If focusing the first item scrolls the table's horizontal scroll box, the menu is dismissed straight away. Its `right` offset also uses `window.innerWidth`, which includes the scrollbar width, so it can be a few pixels off. Not reproduced.
4. **Cancel on external change only checks that items still exist.** In `components/PaintDndProvider.tsx`, if another tab moves the dragged unit to a different project mid-drag, the drag carries on and drops against the new state. No data is corrupted, but the unit may land somewhere slightly different from what was shown. The same limit is already accepted for projects.
5. **Test gaps.** There is no jsdom test for the focus fallback when a project is left empty (the new-unit field gets focus); only Playwright covers it. Several assertions use `toBeTruthy()` on `getByText` where `toBeInTheDocument()` would read better.

### Unique names (PR #21)

6. **The undo error outlives its toast.** `undoError` in `components/PaintLogApp.tsx` is only cleared by a successful undo, the Dismiss button or an import. If the toast expires after 8 seconds, the alert stays and still says to try Undo again. A second identical refusal does not re-announce, because the alert node is unchanged.
7. **A refused drop is spoken twice.** The announcer's drop text (`lib/sidebar-dnd.ts`) goes to the drag live region, and nearly the same reason goes to the sidebar `role="alert"`. A screen reader reads both. Fix by making the alert the only source on drop, or by shortening the announcer text.
8. **Starting a drag clears a pending refused category rename message.** In `components/Sidebar.tsx`, the message goes but the field still holds the rejected text and `refusedRename.current` stays true, so the next blur or commit acts on stale state. A rare edge case.
9. **The sidebar alert is shared by three sources, and category add has no field wiring.** Category add or rename, Move menu refusal and drop refusal all use one alert. The category add input has no `aria-invalid` or `aria-describedby`, while the project forms in `components/ProjectList.tsx` do.
10. **The refused rename refocus guard is untested.** The 0 ms refocus in `components/ProjectList.tsx` now checks `isConnected`, but the test added for it would pass without the guard, because the field is keyed by project id. Whether focus can land in another project's field is not reproduced.
11. **Test gaps.** No test that the undo alert clears when its toast expires, and no component test that a refused drop does not double-announce.

## Suggested grouping

- **Screen reader announcements:** 2, 6, 7, 9.
- **Focus handling:** 1, 8, 10.
- **Small behaviour gaps:** 3, 4.
- **Tests only:** 5, 11.
