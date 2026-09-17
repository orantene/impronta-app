# Event Schedule Items ("Program / Lineup / Agenda") — audit and proposal

Date: 2026-09-17 · Author: Impronta LUMINA session · Status: PROPOSAL, nothing built.

## 1. What Events supports today (audited on origin/main)

| Concern | Today | Evidence |
|---|---|---|
| Timed things inside an event | **Nothing.** The only timed granularity is `sessions.starts_at/ends_at` (a sellable night) and `events.doors_offset_minutes`. | `supabase/migrations/20261229000361_events.sql`, `…214_sessions_and_series.sql` |
| "Lineup" | Not a model. A lineup entry is an **inquiry with `event_id`**; the engine page shows the *names* of booked acts, alphabetically, only when there are two or more. `lib/events/lineup.ts` declares `role`, `setStartsAt`, `setEndsAt`, `sortOrder`, `setTimesPublic` but **no column exists** for any of them; only `resolveLineupState` is used in production. | `web/src/lib/events/lineup.ts:80-97`, `app/(public)/events/[slug]/page.tsx:160-175` |
| LUMINA "El programa" | Eight hand-typed heading/paragraph nodes in the Launch party design. Not data. | `builder-node/page-designs/event-launch.ts:120-178, 360-384` |
| Admin | Tabs overview/schedule/tickets/venue/orders/guests/day/page/money/settings. No lineup or program tab. | `page-modules/events/events-model.ts:20` |
| Where | `venues` (address, tz) and `spaces` with kinds incl. **`stage`, `room`, `area`, `booth`, `court`** in a tree. | `…221_spaces.sql:66-104` |
| Who | `talent_profiles` (public `/t/<code>`, hero/card media via `resolveTalentMediaForHub`, socials as field values), `agency_talent_roster`. Sessions carry `instructor_user_id` (a staff user, not a talent). The "three hats" People model is spec only. | `lib/media/talent-media-for-hub.ts`, `docs/plans/program/specs/people.md` |
| Media | `media_assets` + the `cover_media_id` pattern (events, now tiers), `MediaField` inspector, public URL resolver. | `inspectors/kit/media-field.tsx`, `lib/media/library-query.ts:274` |
| Builder data blocks | Two binding styles: server-resolved arrays (`featured_talent`, `directory`, `menu_board`) and **self-fetching islands** given `tenantId` + an id (`session_picker`, `ticket_picker`; CEO ruling). Strings localise through `node.i18n`. Static timeline-shaped presets exist (`process-steps`, curated `timeline`, `event_listing`) but hold no live data. | `builder-node/render.tsx:5674-5760`, `sections/section-live-data.ts` |
| Calendar | Unions inquiries, bookings, holds and **sessions**. | `_data-bridge/calendar.ts:60-100` |
| Notifications | Dispatcher with email / in-app / push (Web Push, **user-scoped only**) / WhatsApp; a day-before session reminder cron exists (`session-reminders`, idempotent per admission). Guests have no user, so push cannot reach ticket holders today. | `lib/notifications/dispatcher.ts`, `lib/sessions/reminder-window.ts` |
| Registration with a seat limit | A `sessions` row with its own `offering_id`, `session_tier` pool and `session_picker` block. Constraint: `sessions_event_night_uniq (event_id, starts_at, venue_id)` forbids two event sessions at the same instant in one venue, and `loadTicketPicker` treats every event session as a "night". | `…714_sessions_event_night_uniq.sql`, `_events/ticket-picker-actions.ts:158` |

Conclusion: there is no reusable program model. Sessions must **not** be overloaded as program items (they are sellable capacity units with a uniqueness rule that forbids parallel stages), and the inquiry-based lineup is a *booking state*, not a public schedule. The two designs to reuse are the `cover_media_id`/`MediaField` media pattern and the self-fetching island block pattern.

## 2. Naming and architecture decision

Internal model: **`event_schedule_items`** (generic, one row per timed thing). "Program", "Lineup", "Agenda", "Schedule", "What's on", "Sessions", "Performers" are **public presentations** of the same rows, chosen per block. Reasons: a DJ set, a panel, a food service period and a break differ only by `kind`; grouping by night / stage / day is a query, not a schema; the word "program" is wrong for a conference and "lineup" is wrong for a wedding.

Four concepts stay separate and connect by foreign key only:

| Concept | Owns | Connects to schedule items by |
|---|---|---|
| Event | identity, policy, page | `event_id` (required) |
| Session (night) | sellable capacity, tickets, door | `session_id` (optional: which night an item belongs to; drives multi-day grouping) |
| Reservation / class session | seats, sign-up | `registration_session_id` (optional, later): a workshop that needs sign-up points at a class-style session |
| Schedule item | what happens when, where, who, how it looks | — |

## 3. Data architecture (MVP columns)

`public.event_schedule_items`
- `id uuid pk`, `tenant_id` (RLS like `sessions`), `event_id` → events (cascade), `session_id` → sessions (set null), `space_id` → spaces (set null; stage/room/area)
- `kind text` with CHECK in: `set, performance, talk, panel, workshop, class, ceremony, presentation, service, break, competition, meet_greet, afterparty, doors, close, other`
- `title text not null`, `subtitle text` (e.g. "Deep house · 90 min"), `description text` (short, ≤ 600)
- `starts_at timestamptz` (nullable when `time_tba`), `ends_at timestamptz` (nullable = "until the next item"), `time_tba bool default false`
- `performer_talent_profile_id` → talent_profiles (set null), `performer_name text` (used when no profile, or to override), `performer_tba bool`
- `cover_media_id uuid` (falls back to the talent's hero when a profile is linked), `media jsonb default '{}'` → `{ gallery_media_ids?: uuid[≤6], video_url?: string }`
- `links jsonb default '{}'` → `{ href?, label?, instagram?, website? }` (talent profile socials win when linked)
- `sponsor jsonb default '{}'` → `{ name?, logo_media_id?, url? }` (fields only, no sponsor system)
- `tags text[] default '{}'`
- `visibility text` in (`public`, `staff`) — staff-only rows are the run of show (soundcheck, changeover)
- `status text` in (`draft`, `published`)
- `sort_order int` (manual order within the same start instant; time is the primary order)
- `i18n jsonb default '{}'` → `{ es: { title, subtitle, description } }` (same overlay shape the builder uses)
- `created_at, updated_at`
- Indexes: `(tenant_id, event_id, starts_at)`, `(event_id, session_id)`, `(event_id, space_id)`.
- **No uniqueness on time**: simultaneous items are legal. Overlaps in the *same space* are a warning in the UI, never a constraint.

On `events`: `program jsonb default '{}'` → `{ enabled: bool, heading: string, heading_i18n?: {es: …}, set_times_public: bool, group_by: 'day'|'stage'|'none' }`. `set_times_public=false` publishes the lineup without times (the existing `lineup.ts` intent, finally with a home).

Not a table: performers. Linking `talent_profiles` covers Tulala talent; a free-text name + photo covers guests. A "reusable external performer" record is a later feature once two events share the same outside act.

## 4. Workspace UX

- Event → new tab **Programa** (label follows the chosen public heading). First state: one switch "Este evento tiene programa" (writes `program.enabled`); off = tab shows only the switch and the block does not render.
- On: a **run-of-show list grouped by night** (one group per session; single-night events show no group header). Each row: time badge, title, kind chip, performer (avatar when a profile is linked), space chip, visibility eye, status dot; row menu Edit / Duplicate / Hide / Delete; drag to reorder inside a time; "Añadir" opens a sheet.
- Add/edit sheet (mobile first, same sheet on desktop): Title · Kind · Night (only when >1) · Start · End (optional, "hasta el siguiente") · TBA switches (time / performer) · Performer (search roster and talent → chip; or free text) · Place (spaces of the venue with kinds stage/room/area first) · Cover image (MediaField, prefilled from the talent hero) · Short description · Link · Advanced (gallery ≤6, video URL, sponsor, tags, staff-only).
- Grouping toggle in the tab header: by night (default) / by place. Conflicts: an amber "Se solapa con X en Main Stage" note on the row, never blocking.
- "Añadir desde el cartel": one-click import of booked inquiry acts (`resolveLineupState === "booked"`) as `set` items with the talent linked and time TBA. This is the one bridge between the booking spine and the public schedule; state stays on the inquiry.
- Event Day tab gains a "Run of show" strip reading the same rows including `staff` items.

## 5. Media

One cover per item, optional gallery (≤6) and one video URL (YouTube/Vimeo allowlist, same as the `embed` block). Linked talent supplies photo, bio and socials automatically; the organiser can override the photo. Public rendering: card shows cover + title + time + one-line subtitle; tapping opens a **drawer** (mobile bottom sheet / desktop side panel, the same shell as the ticket checkout) with the gallery/video, description, socials, "Ver perfil" when a profile exists, and the item's link. No media → clean text card (same rule the tier cards now follow).

## 6. Time: overnight, multi-day, stages, simultaneity

- Store instants (`timestamptz`); render in the venue zone. Group by the **night = session**, never by calendar date, so an item at 01:30 on Sunday sits under "Sábado 21 nov" with the time shown as `1:30 am` and a small `+1` when the date differs from the night's date. This is the `nightLabelWithCity` family already used by tickets.
- Multi-day = several sessions → day tabs (labels from each session's local date). Items without a session render in a first "General" group (rare; the editor defaults `session_id` to the only night).
- Stages = `space_id`; the block can group or tab by space. Parallel items are plain rows with the same start; the schedule-list style shows them side by side on desktop and stacked on phones.
- Sorting: `starts_at`, then `sort_order`, TBA items last within their group.

## 7. Page builder

New block `event_program` (self-fetching island, the `ticket_picker` class):
- `eventId` optional: when the page is linked from an event (`events.page_id`, shipped in #2039) the block binds to that event automatically; the inspector shows the event select only for unlinked pages.
- Props: `heading` (localizable; default from `events.program.heading`), `style`: `timeline` · `schedule` · `cards` · `lineup` (image-heavy grid) · `compact`; `groupBy`: `auto` (night when >1, place when >1 space, else none) · `night` · `place` · `none`; `showTimes`, `showImages`, `showDescriptions`, `openDrawer`; `filterKinds` (e.g. performers only for a "Lineup" block); `limit`; `style` tokens as every block. Multi-day and stage groupings render as tabs on phones (horizontal chips) and side rails on desktop.
- Data flow: item saved in admin → published rows read by the island on request (event pages are `force-dynamic`; a cache tag `event-program:<eventId>` is added if the page ever moves to ISR). Nothing is rebuilt in the builder.
- Copy: item text is localised through the row's `i18n` overlay; block chrome ("Programa", "Ver más") through the block's own overlay.
- The Launch party design swaps its eight static slots for one `event_program` block (`style: timeline`, `heading: "El programa"`).

## 8. Connections

Recommended: **Talent** (reference by profile id; never a second performer record) · **Spaces** (`space_id`, stage/room/area) · **Sessions** (night grouping only) · **Roster** (the performer picker searches the roster first, then all talent; a booked inquiry can be imported) · **Tickets: information only** (`requires_variant_ids` later, rendered as "Solo Mesa VIP" chips; never a gate at the door, the door gates on admissions) · **Reservations (later)**: a workshop that needs sign-up links to a class session with seats, and the item's card shows "Reservar lugar" with the existing session picker · **Structured data**: `Event.subEvent` / `performer` JSON-LD from the same rows (free SEO win).

Not recommended now: items in the workspace **Calendar** (they are internal to the parent event; the run of show lives on the Event Day tab; an ICS export of the program can come later) · per-item **ticketing** (a sellable thing is a session or a tier, not a schedule row) · a **performers table** · **attendee push notifications** (guests have no user; e-mail/WhatsApp reminders need a policy first; staff run-of-show reminders can reuse the session-reminder cron later) · a **sponsor system** (three fields suffice) · **Spaces layouts** (seating is a ticket concern).

## 9. Mobile

Sticky day/stage chips; time column narrow (`64px`, the LUMINA hour badge); cards one column; drawer instead of navigation; "Now" marker during the event (client clock in the venue zone) with "En curso" state; tap targets 44px; no horizontal timeline on phones (vertical only), horizontal is a desktop-only style.

## 10. Edge cases

Item longer than the night; item with no end; two nights in two venues; venue timezone missing (refuse to publish times, like sessions do); DST (America/Cancun has none; store instants anyway); event cancelled (hide block); session cancelled (its items hide); talent profile unpublished after linking (fall back to the stored name/photo); item time before doors; "Doors" and "Close" as kinds so the timeline has bookends; hidden tier note; translation coverage (the translation panel must list item strings, which the `i18n` overlay on rows makes possible if the panel gains a data-row source).

## 11. MVP vs later

MVP (one PR set): table + RLS + migration · Programa tab with switch, list by night, add/edit/duplicate/hide/delete/reorder, TBA, talent link, space, cover image, link, staff visibility · `event_program` block with `timeline`, `cards`, `compact` styles and night grouping · row `i18n` overlay · LUMINA migrated from static slots to data · JSON-LD `subEvent`.

Later: gallery/video drawer · stage tabs and `lineup` image grid · conflict warnings · "Add from lineup" import · `requires_variant_ids` chips · registration link to class sessions · staff run-of-show reminders · program ICS/PDF · reusable external performers · AI "paste your schedule" import.

## 12. Stronger ideas found while auditing

- Because `events.page_id` now exists, the block can bind to "this page's event" with zero configuration; the same trick should apply to `ticket_picker` (drop the manual event select for linked pages).
- The Event Day tab is the natural home of the staff run of show; the door screen can show "Now: DJ Sofia · Main Stage" from the same rows.
- The ticket e-mail and PDF can print the three next items after doors ("18:00 Doors · 21:00 Desfile · 23:00 Apertura") from the same data.
- `lineup.ts`'s dead fields (`setStartsAt`, `role`, `setTimesPublic`) should be deleted when this lands, so the code stops describing a model that never existed.
