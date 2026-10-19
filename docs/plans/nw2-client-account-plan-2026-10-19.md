# NW2 client account: rebook and favourites (TUL-65), 2026-10-19

## What exists on main
- `/account` renders `ClientAccountArea` (`web/src/components/client-account/ClientAccountArea.tsx`) on talent-site, agency, hub and app hosts, flag-gated. Tabs: Visits, Messages, Payments, Settings, Help.
- Visits tab groups rows (waiting, upcoming, past). Empty state is "No visits yet. Book your first visit" (TUL-776, #4001). The Past group had only a generic "Find someone to book" link to `/`.
- Visit detail (`/account/visits/[id]`) already loads `VisitDetail.offeringId` and `status`; the list rows (`MeItem`) do not carry an offering id.
- `public.clientAccountArea.bookAgain` ("Book again" / "Reservar de nuevo") already exists in en and es and had no caller.
- `/book` (public) had no URL param for a service. `BookPageClient` starts on `offerings[0]`.

## What #2818 intended
Closed Cursor PR "Sign in with Apple for /login + client popover (TUL-65)". It is only the Apple slice of the card (flag `AUTH_APPLE_PROVIDER_ENABLED`, `/auth/apple`, migration `20261231350656_client_auth_events_apple.sql`). It contains no favourites, reviews or rebook work. Apple sign-in, reviews and favourites remain open on TUL-65; this plan covers rebook (built) and favourites (plan only).

## Slice 1: REBOOK (built in this PR)
- Behaviour: on a completed visit's detail page, one primary action "Book again" (icon + label, 44px min height) linking to `/book?service=<offeringId>` on the same host. `/book` moves that service to the front of the public, already-loaded offerings; unknown or missing ids change nothing.
- Files: new `web/src/lib/client-account/book-again.ts` (+ test, enrolled in `lanes/storefront.txt`); edits to `ClientAccountArea.tsx` (one block) and `web/src/app/(public)/book/page.tsx` (reads `searchParams.service`).
- Data: none new. No migration, no payment path. Tenant and talent scoping is unchanged because `/book` filters offerings by the host before the reorder.
- i18n: reuses the existing `bookAgain` key; no es.json/en.json edit.
- Size: small (about 60 lines of code, 55 of test).
- Risks:
  1. PR #4045 changes `BookPageClient` to start on the first service that has times (`pickInitialOfferingId`). Because this PR reorders server-side, the requested service wins when it has times; when it has none, #4045 picks another service with times. After #4045 merges, a follow-up can pass an `initialOfferingId` prop so the requested service shows its request path instead. Not done here to avoid editing #4045's files.
  2. The service may have been unpublished since: the id is then unknown and /book opens normally.
  3. Past list rows have no offering id, so the button is on the detail page only. Follow-up: add the offering id to `loadVisitZones`-style batch read and show the button per row.
- Owner decisions: none blocking. Optional: should "Book again" also show for cancelled visits (this PR says no).

## Slice 2: FAVOURITES (plan only, nothing built)
Why not built: needs a new table (migration), a save control on talent/directory surfaces (several files in the public site renderer, outside this lane), and a signed-in client gate on those surfaces. That is not small or clean for this PR.
- Data: `client_favourites (id, client_user_id uuid not null, tenant_id uuid not null, talent_profile_id uuid not null, created_at, unique (client_user_id, tenant_id, talent_profile_id))`, RLS owner-only select/insert/delete, service-role reads through the existing tenant-scoped pattern in `area-data.server.ts`. Held file goes under `supabase/migrations/_pending_pm/`, applied by PM only. Scope by `talent_profile_id` (see incident: promos tenant-scoped on the shared hub).
- Code (3 pieces): server action `toggleFavourite` (client session only, `assertNotImpersonating`, rate limited); a heart toggle on the talent profile header for signed-in clients; a "Saved" section in `/account` (new tab or Visits sub-block) listing saved talent with a "Book" link. All reads must degrade to an empty list when the table is absent (check error code `42P01`, log once).
- Size: medium (about 8 files, 2 tests lanes, 1 migration, about 12 i18n keys: one contiguous block).
- Risks: i18n block collides with the P3 PR; hub talents shared across tenants; guests have no account (heart should open sign-in, not fail silently).
- Owner decisions: favourites per tenant host or global per client; whether signed-out guests can heart (recommend: no, sign-in prompt).

## Not in scope
Apple sign-in (flagged, needs Supabase Apple config and the held migration), reviews code, emails.
