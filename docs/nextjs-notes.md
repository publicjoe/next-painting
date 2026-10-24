# Next.js notes for this project

## Server vs client components

In the App Router every component is a **Server Component** by default. It runs
on the server (at build time here), can be `async`, can read databases or
secrets, and sends no JavaScript for itself to the browser. It cannot use
`useState`, `useEffect`, event handlers or browser APIs.

A **Client Component** opts in with `'use client'` at the top of the file. It can
use state, effects and browser APIs. Client components are still rendered to HTML
on the server first, then "hydrated" in the browser so they become interactive.

Here: `app/layout.tsx` and `app/page.tsx` are Server Components.
`components/PaintLogApp.tsx` is a Client Component, because the app needs
`useReducer`, `localStorage`, click handlers, file download and the modal confirmation dialog.

## The `'use client'` boundary

The directive marks a boundary in the import graph, not just one file. Everything
`PaintLogApp.tsx` imports (Sidebar, ProjectList, ModelTable, the hook) becomes part
of the client bundle, so those files do not need their own `'use client'`. A server
component can render a client component (`page.tsx` does), but a client component
cannot import a server component. Keep the boundary as low as practical; here the
whole app is interactive, so one boundary at the top is the honest answer.

## The hydration issue

Hydration is React attaching to the server-rendered HTML in the browser. The first
browser render must produce exactly the same markup as the server did. The server
has no `localStorage`. If the first render read saved data, the browser would
render categories where the server rendered none, and React would report a
hydration mismatch.

The fix in `hooks/usePaintingLog.ts`:

1. First render (server and browser) uses the empty `initialState`, and the UI
   shows a neutral "Loading PaintLog..." state.
2. A `useEffect` runs only in the browser, reads and validates `localStorage`,
   dispatches `REPLACE_STATE`, then sets `isLoaded`.
3. The save effect does nothing until `isLoaded` is true. Without that guard it
   would overwrite the stored data with the empty initial state before it was read.

The cost is a brief loading flash. The alternative is `useSyncExternalStore`, or an
inline script that runs before first paint (see
`node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`).

## File-based routing

Folders and special files under `app/` define the routes.

- `app/layout.tsx` wraps every page. The root layout must render `<html>` and
  `<body>`. Its `metadata` export sets the page title and description.
- `app/page.tsx` is the UI for the route `/`. Adding `app/about/page.tsx` would
  create `/about`.
- `app/icon.svg` is a metadata file convention: Next.js turns it into the favicon
  `<link>` tag automatically.

## Where a database or API would slot in later

- **Route Handler**: `app/api/projects/route.ts` exporting `GET`/`POST` functions
  gives you an HTTP endpoint. The client component would `fetch('/api/projects')`
  instead of using `localStorage`.
- **Server Component reading data directly**: `app/page.tsx` could become `async`,
  query the database, and pass the result to `PaintLogApp` as props. That also
  removes the hydration workaround, since the server would supply the real initial
  state.
- **Server Actions**: functions marked `'use server'` can replace the reducer's
  `dispatch` calls for writes (add category, toggle status) and be called from
  forms or handlers.

The reducer and `isAppState` validation would carry over: validate data at the
boundary (including on the server) regardless of where it is stored.
