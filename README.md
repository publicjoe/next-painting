# PaintLog

A tracker for tabletop miniature painting projects. Organise models into
categories and projects, then tick off built, primed, painted and based. Data
lives in your browser's `localStorage`, so there is no backend or database. You
can export and import everything as JSON.

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, ESLint,
Vitest with Testing Library and axe-core, and Playwright for browser smoke tests.

## Getting started

Node 22 or later (see `.nvmrc`; CI uses the same version).

```bash
npm ci
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:3000 |
| `npm run build` | Production build (also type-checks) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest: reducer, validation, migration, hook and component (axe) tests |
| `npm run test:e2e` | Playwright smoke tests in Chromium against a production build (focus handling and colour contrast). Run `npx playwright install chromium` once first |

CI also runs `npx next typegen && npx tsc --noEmit` before the tests.

## Project layout

| Path | Role |
| --- | --- |
| `app/` | Routes. `layout.tsx` and `page.tsx` are Server Components, `error.tsx` is the error boundary, `icon.svg` is the favicon |
| `components/` | `PaintLogApp.tsx` is the single `'use client'` boundary; `Sidebar`, `ProjectList`, `ModelTable` and `InlineEditText` sit beneath it, with `ConfirmDialog` (native `<dialog>`), `UndoToasts` (delete undo) and `icons.tsx` shared between them |
| `hooks/` | `usePaintingLog.ts`: reducer plus persistence (debounced saves, multi-tab sync) |
| `lib/` | Pure logic: `state.ts` (reducer), `validate.ts` (`isAppState`), `migrate.ts` (storage versions), `progress.ts` (a model is "completed" once built, primed, painted and based are all ticked), `backup.ts` (never-overwrite backups), `id.ts` |
| `types/` | Shared TypeScript types |
| `e2e/` | Playwright smoke tests |
| `docs/` | [nextjs-notes.md](docs/nextjs-notes.md): server vs client components, hydration, routing |

Unit and component tests sit beside the code they cover (`*.test.ts`, `*.test.tsx`).

## Data format and versioning

State is stored under the `painting-log-state` key as a versioned envelope:

```json
{
  "version": 1,
  "state": {
    "categories": [{ "id": "…", "name": "Warhammer 40k" }],
    "projects": [{ "id": "…", "categoryId": "…", "name": "Space Marines" }],
    "models": [{
      "id": "…", "projectId": "…", "name": "Captain", "count": 1,
      "built": false, "primed": false, "painted": false, "based": false
    }]
  }
}
```

- `lib/migrate.ts` reads the current envelope and the legacy unversioned shape
  (a bare `state` object), which is re-saved as v1. Unknown versions are
  rejected rather than guessed at.
- `lib/validate.ts` checks every item and its references (unique ids, no
  orphaned projects or models) before data is accepted from storage, another tab
  or an imported file.
- Unreadable stored data is copied to `painting-log-state.bak` (or `.bak.2` and so on, so an earlier copy is never overwritten) and the stored data is left alone until you confirm "Start fresh".
- Edits are saved after a 300 ms pause, and immediately on `pagehide` or unmount.
  If storage is full or blocked, a banner asks you to export your data.
- Changes made in another tab are picked up through the `storage` event; invalid
  external writes are ignored.
- Export writes the plain `state` object. Import accepts that or a v1 envelope,
  and shows an inline error for anything else.
