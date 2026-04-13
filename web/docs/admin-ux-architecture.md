# Admin UX architecture

Context-preserving, panel-first admin navigation. **Primary shell:** `DashboardEditPanel` ([`src/components/dashboard/dashboard-edit-panel.tsx`](../src/components/dashboard/dashboard-edit-panel.tsx)).

## Core rules

1. **Primary record workspace = full page** — Deep, multi-section work (talent hub, booking detail, inquiry detail, client profile, taxonomy/locations editors, settings).
2. **List row primary click = full page** — Unless the module is explicitly preview-first.
3. **Row secondary action = drawer or peek** — Preview, open editor, quick edit, quick metadata, quick approve.
4. **Cross-cutting dashboard edits = drawer** — Translations, moderation, review queues, status work; do not redirect away for tasks that fit a panel.
5. **Create flows** — Drawer when short and self-contained; full page when large or multi-step.
6. **One major drawer at a time** — No stacking until a formal stack model exists.
7. **URL represents panel state** — Use `apanel` + `aid` for shareability, refresh, and back-button sanity.
8. **Closing a panel clears panel URL params** — URL and UI must not drift.
9. **Save refreshes context** — `router.refresh()` and/or `revalidatePath`; user stays on the list/dashboard.
10. **Reuse `DashboardEditPanel`** — Do not introduce a second drawer system.

## Surface classification

| Surface | Use for |
|--------|---------|
| **Full page** | Hubs, multi-tab workspaces, heavy forms |
| **Drawer (`DashboardEditPanel`)** | Focused edit, previews, quick updates, short creates |
| **Modal / Radix Dialog** | Confirmations, destructive actions, very short isolated forms |
| **Popover** | Row menus, tiny settings, filters, toggles |

## URL contract (`apanel` / `aid`)

- **`apanel`** — Panel kind (string enum per route; see allowlist below).
- **`aid`** — Entity UUID (or route-defined id) the panel targets.

**Open:** `router.replace(path + query, { scroll: false })` with `apanel` and `aid` set; preserve existing filter/sort params.

**Close:** `router.replace` with **`apanel` and `aid` removed**; preserve other params.

**Helpers:** [`src/lib/admin/admin-panel-search-params.ts`](../src/lib/admin/admin-panel-search-params.ts), optional [`src/hooks/use-admin-panel-state.ts`](../src/hooks/use-admin-panel-state.ts).

## Allowed `apanel` values (versioned)

| Route | `apanel` | Meaning |
|-------|----------|---------|
| `/admin/translations` | `bio` | Talent bio ES editor |
| `/admin/translations` | `taxonomy_term` | Taxonomy term ES label (narrow) |
| `/admin/translations` | `location` | Location ES display name (narrow) |
| `/admin/bookings` | `peek` | Booking preview / quick update (`ADMIN_APANEL_PEEK`) |
| `/admin/inquiries` | `peek` | Inquiry preview / assign (`ADMIN_APANEL_PEEK`) |
| `/admin/users/admins` | `user` | Staff account edit sheet (`ADMIN_APANEL_USER`, `urlSync` on button) |
| `/admin/clients` | `user` | Same sheet from the clients queue (`urlSync`) |
| `/admin/clients/[id]` | `user` | Same sheet on client detail (`urlSync` with that path) |
| `/admin/users/search` | `user` | Same sheet from global user search (`urlSync`) |
| `/admin/fields` | *(legacy `edit`)* | Field definition editor — closing clears `edit` via `router.replace` |

## Drawer width tokens

Pass as `className` on `DashboardEditPanel` ([`src/lib/admin/admin-drawer-classes.ts`](../src/lib/admin/admin-drawer-classes.ts)):

- **Narrow** — `lg:max-w-md` (simple forms)
- **Medium** — `lg:max-w-xl` (default-like, cockpit panels)
- **Wide** — `lg:max-w-2xl` (bio translation, richer content)
- **Extra** — `max-w-[720px]` or wider for rare wide forms (e.g. manual booking)

## Data loading

- **Default:** fetch-on-open for drawer-only fields; keep list queries lean.
- **Loading UI:** Spinner or skeleton inside the panel body (not a new `DashboardEditPanel` API).

## Refresh contract

- After successful mutation: existing server actions + **`revalidatePath`** where present + **`router.refresh()`** when the UI is driven by a server-rendered parent list.

## Prefetch

- **Hover / focus** on controls that open a panel or full page: `router.prefetch(...)` where it improves perceived speed without obvious overfetch.

## `DashboardEditPanel` usage audit

| Location | Purpose |
|----------|---------|
| `admin/talent/[id]/admin-talent-cockpit-client.tsx` | Profile / workflow / taxonomy / field values sheets |
| `admin/fields/admin-field-definition-edit-sheet.tsx` | Edit field definition |
| `components/admin/admin-booking-peek-sheet.tsx` | Booking preview |
| `components/admin/admin-inquiry-peek-sheet.tsx` | Inquiry preview |
| `components/admin/create-client-contact-sheet.tsx` | Create contact |
| `components/admin/create-client-account-sheet.tsx` | Create account sheets |
| `components/admin/admin-new-inquiry-sheet.tsx` | New inquiry |
| `components/admin/admin-commercial-list-intake.tsx` | Manual booking panel |
| `components/admin/admin-commercial-reassign.tsx` | Reassign flows |
| `admin/users/admin-user-edit-sheet.tsx` | User / account edit |
| `components/admin/admin-list-row-tools.tsx` | Account row tools |
| `components/admin/admin-client-inquiries-panel.tsx` | Client inquiries |
| `admin/clients/admin-new-client-sheet.tsx` | New client |
| `admin/translations/translations-bio-workflow.tsx` | Bio translation drawer (`apanel=bio`) |
| `admin/translations/translations-tax-loc-workflow.tsx` | Taxonomy + location ES drawers |

## PR review checklist

- [ ] Is this interaction a **page**, **drawer**, **modal**, or **popover** per the rules above?
- [ ] If a drawer: does **`apanel`/`aid` (or legacy documented param)** reflect open state?
- [ ] Does **close** remove panel params from the URL?
- [ ] Does **save** keep the user in context and **refresh** list data?
- [ ] No second drawer system — use **`DashboardEditPanel`**.
- [ ] **One drawer** open at a time on the same view.
- [ ] Loading state inside panel for fetch-on-open flows.

## Future (optional)

Parallel routes / intercepting routes — only if product needs modal URLs over distinct routes; not required for `searchParams`-driven panels.
