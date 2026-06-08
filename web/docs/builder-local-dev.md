# Builder local dev — quick QA

Use this when you need the in-place page builder (`?edit=1`) on localhost.

## Start the stack

From the repo root:

```bash
./scripts/dev.sh
```

Or directly in `web/`:

```bash
cd web && PORT=3000 npm run dev
```

First compile after a cold start can take ~10s; warmed routes are usually ~2–3s.

If every route returns **404** (including `/api/dev/signin`), run `npm install` in `web/` — a partial `node_modules` tree breaks middleware imports.

## Sign in as staff

Dev sign-in (local only):

```
http://localhost:3000/api/dev/signin?email=qa-admin@impronta.test&next=/impronta?edit=1
```

Replace the `next=` path with whichever page you are editing. The email must exist in your local Supabase seed.

## Open the builder

Homepage example:

```
http://localhost:3000/impronta?edit=1
```

Tenant host routing: raw `localhost:3000` works for Impronta QA paths. For agency-specific hosts, use the local host proxy described in [`dev-qa-3-surfaces.md`](./dev-qa-3-surfaces.md).

## Wait for chrome to hydrate

`EditShell` loads client-side after the storefront paints. For ~2–3s you may see only a loading skeleton (topbar strip + dock ghost) or the bare page.

**Before judging pass/fail**, wait until one of these is visible:

- `[data-edit-topbar]` with real controls (Publish, Save, device switcher)
- `navigation[name="Builder tools"]` in the accessibility tree
- The command dock **Add** button (purple FAB)

Browser automation should poll for `[data-edit-topbar]` (not the loading skeleton alone) before screenshots.

## What to verify after changes

1. Editor chrome loads after hydration (topbar, **command dock**, inspector on selection, Publish).
2. **Structure** dock item opens the Page Structure panel (Layers / Outline / Classes tabs).
3. Section select shows the light floating toolbar (**Edit Content** / **Design**).
4. Section variant chips update the canvas without a full reload (client canvas flag on).
5. Linked style classes survive **Save draft** and a browser refresh (stored in draft revision snapshots).
6. Custom breakpoints: **Breakpoints** button beside the device switcher in the topbar.
7. Desktop canvas shows a light gray workspace behind the page (not full-bleed dark storefront).

## Pre-commit gate (builder work)

```bash
cd web && npm run typecheck && npm run lint
```

Run `npm run ci` only when tenant / RLS / middleware changed.
