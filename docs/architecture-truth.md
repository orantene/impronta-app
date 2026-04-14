# Architecture truth — Impronta

Single source of truth for **talent**, **directory**, **admin**, **inquiries**, and **enums** as implemented in this repo (migrations under `supabase/migrations/`). If UI or docs disagree with this file, **fix the UI/docs or log a forward migration** in `docs/decision-log.md`.

## Operational vs CMS boundary

**Operational** (product matching, directory, inquiries, bookings, talent data): `talent_profiles`, taxonomy used for filters, `field_values`, `media_assets`, `inquiries`, etc.

**CMS / Site Settings** (future): editorial pages, nav, redirects, global copy — must **not** be the source of truth for who appears in directory or how rows rank. See phased plan for Phase 8.5+.

---

## Enums (PostgreSQL)

| Enum | Values (current) |
|------|------------------|
| `app_role` | `super_admin`, `agency_staff`, `talent`, `client` |
| `profile_workflow_status` | `draft`, `submitted`, `under_review`, `approved`, `hidden`, `archived` |
| `visibility` | `public`, `hidden`, `private` |
| `inquiry_status` | `new`, `reviewing`, `waiting_for_client`, `talent_suggested`, `in_progress`, `closed`, `archived`, plus **`qualified`**, **`converted`**, **`closed_lost`** (commercial extension) |
| `media_approval_state` | `pending`, `approved`, `rejected` |
| `revision_status` | `pending`, `approved`, `rejected` |
| `taxonomy_kind` | `talent_type`, `tag`, `skill`, `event_type`, `industry`, `fit_label`, `language` |

**Note:** `draft` and `archived` are **real** workflow states (admin tabs, lifecycle); do not omit them from docs or filters.

---

## Public directory eligibility (RLS + RPCs)

Anonymous (and authenticated) directory listing uses predicates equivalent to:

- `talent_profiles.deleted_at IS NULL`
- `workflow_status = 'approved'`
- `visibility = 'public'`

**Media** visible on public cards: `approval_state = 'approved'`, `variant_kind <> 'original'` (see `media_assets` RLS in init migration).

---

## Directory data path

| Layer | Location |
|-------|----------|
| HTTP API | `web/src/app/api/directory/route.ts` — `GET`, query params: `cursor`, `limit`, `q`, `location`, `tax`, `sort`, `hmin`/`hmax`, `locale` |
| Aggregation | `web/src/lib/directory/fetch-directory-page.ts` |
| Card DTO | `web/src/lib/directory/types.ts` — `DirectoryCardDTO` |
| RPC → row mapping | `web/src/lib/directory/talent-card-dto.ts` — `mapApiDirectoryRpcRowToDirectoryCardDTO` |
| Search (ids) | RPC `directory_search_public_talent_ids(p_query text)` — FTS / ILIKE / similarity (`20260414120000_directory_performance_search.sql`). Fallback: `directory-search-legacy.ts` if RPC missing / env force. |
| Listing RPC | `api_directory_cards(...)` — signature evolved in `20260408110000_public_directory_discovery_contract.sql` and `20260409240000_directory_rpc_canonical_residence_location.sql` |

**Location:** Filter uses **`locations.id`** with `residence_city_id` **or** legacy `location_id` (see `orResidenceOrLegacyLocation*` in `fetch-directory-page.ts`). Canonical display: **`city_slug`** on `locations`, not a generic `slug` column.

**Sort:** `recommended` \| `featured` \| `recent` \| `updated` — must match server `applySort` (see `types.ts`).

---

## Public profile path

| Layer | Location |
|-------|----------|
| Page | `web/src/app/t/[profileCode]/page.tsx` |
| Loader | `fetchTalentProfile` — `talent_profiles` by `profile_code`; public uses anon client; **preview** uses owner session (`user_id = auth.uid()`). |
| Fields | `short_bio`, `bio_en`, `bio_es`, taxonomy embed, `height_cm`, `residence_city` / `legacy_location` / `origin_city` via FK aliases to `locations`. |
| Dynamic fields | `field_values` + `field_definitions` joins; visibility via `getPublicProfileFieldVisibility` / ordering helpers. |

**Types:** Local `TalentProfile`, `PublicFieldValueRow` in page file — must stay aligned with selected columns.

---

## Admin talent / workflow

| Area | Typical paths |
|------|----------------|
| Talent list | `web/src/app/(dashboard)/admin/talent/page.tsx` — tabs map to `workflow_status` filters (`applyStatusFilter`: e.g. Pending = `submitted` + `under_review`). |
| Cockpit | `web/src/app/(dashboard)/admin/talent/[id]/admin-talent-cockpit-client.tsx` |

Staff roles: `super_admin`, `agency_staff` (`is_agency_staff()` in DB).

---

## Inquiries

| Table | Role |
|-------|------|
| `inquiries` | Parent row: contact, event fields, `interpreted_query` JSONB, `status`, guest or client attribution. |
| `inquiry_talent` | Junction `(inquiry_id, talent_profile_id)` — **many-to-many**. |

**Public flow:** `guest_submit_inquiry` RPC from `web/src/app/(public)/directory/actions.ts`; context builder `web/src/lib/inquiries.ts` (`buildInquiryContext`, status labels include extended enum values).

---

## Field system

| Table | Role |
|-------|------|
| `field_groups` | Grouping for admin + profile. |
| `field_definitions` | `key`, flags: `public_visible`, `internal_only`, `card_visible`, `profile_visible`, `filterable`, `searchable`, `ai_visible`, etc. |
| `field_values` | Typed values per `talent_profile_id` + `field_definition_id`. |

RLS: public reads constrained by talent visibility and field rules (`field_catalog_talent_select_rls` et seq.).

---

## Settings

`public.settings` (`key` TEXT PK, `value` JSONB). **Anon/authenticated** may `SELECT` only keys whitelisted in `settings_public_select_frontend` (e.g. `directory_public`, `inquiries_open`) — see `20260408110100_inquiry_client_flow_completion.sql`.

**AI feature flags** (`ai_search_enabled`, …) are **not** in that list; read them only on the **server** with a **service-role** client or staff session (`web/src/lib/settings/ai-feature-flags.ts`).

---

## Auth routing (summary)

| Role | Post-login home (default) |
|------|---------------------------|
| `super_admin` / `agency_staff` | `/admin` |
| `talent` | `/talent` |
| `client` | `/client` |

Implementation: `web/src/lib/auth-flow.ts`, `web/src/lib/auth-routing.ts`, `web/src/lib/supabase/middleware.ts`. **Visitor** = unauthenticated; public directory and `/t/[code]` do not require login.

See **`docs/auth-flow.md`** for detail.

---

## Change control

Any change to **response shapes** (directory API, profile read, inquiry write), **enums**, or **RLS** behavior that affects discovery must be recorded in **`docs/decision-log.md`** and reflected here in the same PR when possible.
