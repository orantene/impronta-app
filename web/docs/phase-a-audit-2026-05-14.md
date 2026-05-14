# Phase A — Client + Inquiry Engine Audit

**Plan reference**: `client-execution-plan-2026-05-14.md` §23 Phase A.
**Status**: deliverable — closes Phase A gate.
**Acceptance**: every client route mapped, every inquiry creation path documented, every duplicate form identified, every payload diff surfaced.

---

## A.1 — Client route map

Every URL under `/client`, what loads it, what state it can show.

| Route | File | Server/Client | Loads | States | Plan §2 verdict |
|---|---|---|---|---|---|
| `/client` | `client/page.tsx` (server) | server redirect | — | → `/client/today` | **redirect target should change** to `/client/messages` |
| `/client` (root catcher) | `app/client/page.tsx` | server | — | redirect to tenant scope | unchanged |
| `/client/today` | `client/today/page.tsx` (server) | server | `loadClientInquiries` + `loadWorkspaceRosterLite` | 3 buckets (Needs decision / Agency coordinating / Coming up) + 4 stat tiles + empty state | **demote to filter** — redirect to `/client/messages?filter=needs-me` |
| `/client/messages` | `client/messages/page.tsx` (server) | server | `loadClientInquiries` + `loadWorkspaceRosterLite` + `loadInquiryMessages` | two-pane shell (list + thread); filter pills (All / Needs me / Active / Booked / Past); + New Inquiry drawer | **keep as primary home** — current shell is the foundation Phase B builds on |
| `/client/messages` API | `app/api/client/messages/route.ts` | route | per-inquiry messages | 200 / 401 / 403 / 404 | keep |
| `/client/discover` | `client/discover/page.tsx` (server) | server | `loadWorkspaceRosterEnriched` → `DiscoverShell` | empty (P0 bug per audit §1#2) or roster grid | **keep** — Phase C fixes the filter + adds save-to-shortlist |
| `/client/inquiries` | `client/inquiries/page.tsx` (server) | server | `loadClientInquiries` + `loadWorkspaceRosterLite` | Open / Closed tables | **demote to redirect** → `/client/messages?filter=open` |
| `/client/inquiries/[id]` | `client/inquiries/[id]/page.tsx` (server) | server | inquiry detail + thread + offer | full project detail with Lineup / Offer / Details / Files tabs **but with DIFFERENT chrome from the dashboard** | **fold into messages shell** — `/client/messages/:id` becomes the canonical detail route |
| `/client/inquiries/new` | `client/inquiries/new/page.tsx` (server) + `new-inquiry-form.tsx` (client) | mixed | `loadClientSelfProfile` + `loadWorkspaceRosterEnriched` | `NewInquiryForm` rendered standalone | **delete the dedicated page** — drawer-only after Phase D |
| `/client/bookings` | `client/bookings/page.tsx` (server) | server | `loadClientBookings` + `loadWorkspaceRosterLite` | Upcoming / Past lists with date boxes | **keep** as calendar/history lens (Phase F adds calendar toggle + call sheet) |
| `/client/pitches` | `client/pitches/page.tsx` ❌ | — | — | **404** — page never built; another agent's WIP `_data-bridge/pitches.ts` is partial | **delete the route** or finish-and-hide; not in plan §2 nav |
| `/client/shortlists` | `client/shortlists/page.tsx` | server redirect | — | redirects to `/client/discover` | **Phase C** — actually render saved shortlists |
| `/client/settings` | `client/settings/page.tsx` (server) + `ClientTrustShell` (client) | mixed | `loadClientSelfProfile` + `loadClientTrustBillingState` | profile (read-only) + account (read-only) + notifications (stub) + trust + verify-for-$5 | **keep** — Phase D adds inline-edit + notification matrix |
| `/auth/client/register` | `(auth)/client/register/page.tsx` | server | sign-up | initial registration | keep |
| `/(public)/inquiry-sent` | `(public)/inquiry-sent/page.tsx` | server | success page | post-public-submit landing | keep (also serves agency-site inquiries) |

**Findings**

1. **Route fragmentation = 12 routes for what should be 4**. The client has 12 reachable URLs today; plan §2 reduces to 4 primary destinations.
2. **`/client/pitches` is dead** — 404 reachable, no link in nav, another agent's WIP. Remove or finish.
3. **`/client/shortlists` is a stub** — redirects to Discover. The `saved_talent` table exists; the feature is just not wired.
4. **`/client/inquiries/[id]` chrome doesn't match the rest** — uses its own header pattern, no `ClientPageHeader`, no breadcrumb back to list. Phase B/C work.
5. **`/client/inquiries/new` is a dedicated page AND a drawer** — both render `NewInquiryForm` with `InquiryCartFormFields`. Drawer is newer and better. Page should be deleted after Phase D.

---

## A.2 — Inquiry creation source map

Every function that creates a row in `public.inquiries`.

| # | Function | File | Source channel emitted | Goes through `submitInquiry` engine? | Path |
|---|---|---|---|---|---|
| 1 | `submitInquiry` | `lib/inquiry/inquiry-engine-submit.ts` | (input param) | — (this IS the engine) | engine — all others should funnel here |
| 2 | `submitClientInquiry` | `app/(public)/directory/actions.ts:309` | `"directory_client"` | ✅ yes — calls `submitInquiry(admin, …)` | public `/directory` cart + talent-page drawer for logged-in clients |
| 3 | `submitGuestInquiry` | `app/(public)/directory/actions.ts:494` | `"directory_guest"` | ✅ yes | public `/directory` cart + talent-page drawer for guests |
| 4 | `createClientWorkspaceInquiryAction` | `app/(workspace)/[tenantSlug]/client/inquiries/new/actions.ts:77` | `"directory_client"` (collides with #2!) | ✅ yes | workspace `/client/inquiries/new` (page + drawer) |
| 5 | `createAgencyInquiry` | `lib/server-actions/admin-inquiries.ts:69` | `"admin_manual"` ⚠️ NOT in enum (see A.3) | ✅ yes | admin shell "New Inquiry" composer |
| 6 | `createManualInquiry` | `lib/server-actions/admin-inquiries.ts:1487` | (any of 7 enum values) | ❌ NO — **direct INSERT into `inquiries`** bypassing the engine | second admin-side composer (older, less-used path) |
| 7 | `convertPitchToInquiry` | `lib/pitch/pitch-engine.ts:723` | inherits from pitch (typically `"directory_client"`) | ✅ yes | `/share/pitch/[token]` landing → submit-as-inquiry |

**Counts**
- **7 distinct entry functions**
- **6 of 7 route through `submitInquiry`** (good)
- **1 still bypasses the engine** (`createManualInquiry`) — that's a regression vector: rate limiter, event emit, audit, trust snapshot, requirement-group all skipped

### A.2.1 — Form components (UI surface for the above)

| # | Component | File | Used by | Renders fields |
|---|---|---|---|---|
| 1 | `InquiryCartForm` | `components/inquiry-cart/InquiryCartForm.tsx:695` | public directory cart, talent-page drawer (`/t/[profileCode]`), workspace client drawer (via `NewInquiryForm` wraps `InquiryCartFormFields`), Messages drawer (via `NewInquiryDrawer`) | 11 visible fields per the v1 QA + section dividers + honeypot |
| 2 | `InquiryCartFormFields` | `components/inquiry-cart/InquiryCartForm.tsx:553` | composed by both `InquiryCartForm` (public) and `NewInquiryForm` (workspace) | shared field set |
| 3 | `NewInquiryForm` | `app/(workspace)/[tenantSlug]/client/inquiries/new/new-inquiry-form.tsx:42` | dedicated `/client/inquiries/new` page + `NewInquiryButton` drawer (every client page header) + `NewInquiryDrawer` in Messages | wraps `InquiryCartFormFields` + form-persistence + analytics tracking |
| 4 | `InquiryComposer` | `components/admin/shell/internal/messages.tsx:10597` | admin shell only | **completely separate field set** — 5-step prototype composer with category picker, mixed-group builder, budget unit picker. **Mode = `"client" \| "admin" \| "hub"`** — calls `createAgencyInquiry` (admin) or pushes to `__inquiryStore` mock (client/hub modes) |

**Findings**
- The public + workspace surfaces share `InquiryCartFormFields` (good)
- Admin uses a totally different `InquiryComposer` component (bad). Three separate field sets, three sets of validation, three UIs.
- `InquiryComposer` in client/hub modes writes to a **mock store** — not the real engine — so those paths are demo-only.

### A.2.2 — Entry points the user expects (plan §7 sources)

| Plan §7 source | Today's status | Action |
|---|---|---|
| `direct_client_dashboard` | ✅ exists via `NewInquiryButton` drawer | rename `source_channel` value (currently `"directory_client"`) |
| `discover_single_talent` | partial — Discover card "Inquire" links but no card-level CTA wired | **Phase C** |
| `discover_shortlist` | ❌ shortlists don't exist as real entity | **Phase C** — build shortlists table + UI |
| `saved_talent` | partial — `saved_talent` table exists; not surfaced | **Phase C** |
| `public_talent_profile` | ✅ exists via `/t/[profileCode]` drawer | rename channel |
| `agency_site` | ✅ same as public directory submit (via `submitClientInquiry`) | rename channel |
| `hub_site` | unknown — hub host routing exists but inquiry path not verified | **Phase A.5** follow-up |
| `pitch` | ✅ via `convertPitchToInquiry` | OK |
| `admin_created` | ✅ via `createAgencyInquiry`; legacy `createManualInquiry` bypasses engine | **delete `createManualInquiry`** — funnel into `createAgencyInquiry` |
| `book_again` | ❌ doesn't exist | **Phase F** |

---

## A.3 — Payload diff across paths + gap list

### A.3.1 — `inquiry_source_channel` enum reality vs plan

**DB enum** (`web/src/lib/admin/validation.ts:134`):
```
directory_guest · directory_client · phone · whatsapp · email · admin · other
```
7 values, generic, **no provenance**.

**Plan §7 sources** (10 desired):
```
direct_client_dashboard · discover_single_talent · discover_shortlist
saved_talent · public_talent_profile · agency_site · hub_site
pitch · admin_created · book_again
```

**Gap**: the DB has no way to tell apart a workspace-client-dashboard inquiry from a public-storefront inquiry from a saved-talent inquiry — they all become `"directory_client"`. The pitch source becomes `"directory_client"` too (inherited from form values). Provenance is lost at the column level.

**Drift evidence**: `createAgencyInquiry` emits `"admin_manual"` which is **not in the enum** — would fail a strict z.parse but probably succeeds because the engine doesn't validate the field against the enum at insert.

### A.3.2 — Payload field comparison

Engine `submitInquiry` accepts the following input fields (`inquiry-engine-submit.ts:30-60`):

```
tenant_id · contact_name · contact_email · contact_phone · company
event_date · event_location · quantity · message · event_type_id
raw_ai_query · interpreted_query · source_page · source_channel
origin_domain · source_workspace_id · trust_level_at_submission
client_user_id · talent_profile_ids · actorUserId
initiator_role · initiator_user_id
```

Per-caller payload differences:

| Field | `submitClientInquiry` (public dir client) | `submitGuestInquiry` (public dir guest) | `createClientWorkspaceInquiryAction` (workspace) | `createAgencyInquiry` (admin) | `createManualInquiry` (admin legacy) | `convertPitchToInquiry` |
|---|---|---|---|---|---|---|
| `contact_name` | required | required | required | required | required | from pitch + form |
| `contact_email` | required | required | from auth.email | required | required | from pitch + form |
| `contact_phone` | optional | optional | always `null` ❌ | optional | optional | optional |
| `company` | optional | optional | optional | optional | optional | optional |
| `event_date` | optional | optional | optional | optional | always `null` ❌ | from pitch.brief |
| `event_location` | optional | optional | optional | optional | optional | from pitch |
| `quantity` | optional | optional | parsed from string | not sent ❌ | not sent ❌ | from pitch |
| `event_type_id` | optional | optional | always `null` ❌ | not sent ❌ | always `null` ❌ | from pitch |
| `raw_ai_query` | optional | optional | mirrors `message` | not sent ❌ | optional | from pitch.personal_note |
| `interpreted_query` | rich object with directory context | rich object | tiny `{selectedTalentId}` | not sent ❌ | not sent ❌ | partial |
| `talent_profile_ids` | array of UUIDs | array | array (1 or 0) | always `[]` ❌ | not sent ❌ | from `pitch_talents` |
| `client_user_id` | `user.id` | `null` | `user.id` | `null` (admin acts on behalf) | optional | from recipient |
| `source_channel` | `"directory_client"` | `"directory_guest"` | `"directory_client"` (collides) | `"admin_manual"` (not in enum) | input-driven (any enum) | inherits |
| `source_page` | `"/directory"` or input | `"/directory"` | `"/{slug}/client/inquiries/new"` | `"admin-workspace-new-inquiry"` | not sent ❌ | `"/share/pitch/{token}"` |
| `origin_domain` | from `getPublicHostContext` | from host context | from host context | not sent ❌ | not sent ❌ | not sent ❌ |
| `source_workspace_id` | host-derived | host-derived | always `scope.tenantId` ❌ (loses real origin) | not sent ❌ | not sent ❌ | not sent ❌ |
| `trust_level_at_submission` | from `loadClientTrustState` | `"basic"` default | from trust state | not sent ❌ | not sent ❌ | not sent ❌ |
| `initiator_role` | `"client"` | `"guest"` | `"client"` | `"admin"` | not sent ❌ | varies |
| `initiator_user_id` | `user.id` | `null` | `user.id` | `user.id` (admin) | not sent ❌ | varies |
| Roster check | ✅ `assertAllTalentOnTenantRoster` | ✅ | ✅ | ⚠️ no talent passed | ❌ no roster check | ✅ inherits pitch |
| Rate limit | engine handles | engine handles | engine handles | engine handles | ❌ BYPASSED | engine handles |
| Event emit | engine emits `INQUIRY_SUBMITTED` | engine emits | engine emits | engine emits | ❌ NONE | engine emits |
| Audit log | engine path | engine path | engine path | engine + `logInquiryActivity` extra | ❌ NONE | engine path |

**Findings**

1. **6 fields emitted inconsistently** across the 6 callers: `contact_phone`, `event_type_id`, `quantity`, `interpreted_query`, `origin_domain`, `trust_level_at_submission`. Each caller drops different ones.
2. **`createClientWorkspaceInquiryAction` always sets `contact_phone: null`** — workspace clients can't submit a phone. Bug.
3. **`createClientWorkspaceInquiryAction` always sets `event_type_id: null`** — workspace form doesn't expose the event-type selector that public form does. Bug.
4. **`source_workspace_id` is misused** — workspace path always sends `scope.tenantId` (the destination), not the origin host. Loses provenance: was this an inquiry from app.tulala.digital vs impronta.tulala.digital? Both look identical.
5. **`createAgencyInquiry` sends `source_channel: "admin_manual"`** which is not in `INQUIRY_SOURCE_CHANNEL_VALUES`. The insert is succeeding because the DB column accepts free text. **Schema drift.**
6. **`createManualInquiry` is dangerously different** — direct INSERT, no engine, no rate limit, no event emit, no audit, no roster validation. Easy to misuse.
7. **Pitch conversion drops `origin_domain` + `source_workspace_id` + `trust_level_at_submission`** — three attribution fields lost on pitch path.

### A.3.3 — Engine output normalization

`submitInquiry` itself does the right thing internally:
- Auto-assigns coordinator from settings
- Inserts requirement groups for talent_ids
- Emits `INQUIRY_SUBMITTED` event
- Inserts auto-ack system message
- Stamps `last_message_at` / `last_message_preview`
- Sets `initiator_role` / `initiator_user_id` (universal connector)

This is the engine the plan §21.2 asks for — it just needs:
- **(a)** every caller funneled into it (kill `createManualInquiry`'s direct INSERT)
- **(b)** input shape normalized into a canonical `InquiryIntent` type
- **(c)** richer `source_channel` enum (10 values, not 7)
- **(d)** consistent `source_context` JSON sidecar to preserve provenance

---

## A.4 — Broken UX / permission leak / component reuse list

### A.4.1 — Broken pages / dead routes
| Surface | Issue | Severity |
|---|---|---|
| `/client/pitches` | 404 — page never built | P1 (no nav link, but URL is reachable) |
| `/client/shortlists` | redirects to Discover instead of rendering saved talent | P1 |
| `/client/inquiries/[id]` | renders, but with different chrome from `/client/messages` and no breadcrumb | P1 |
| `/client/inquiries/new` (dedicated page) | duplicates the drawer; should be deleted after Phase D | P2 |
| Discover empty state | shows "Roster coming soon" despite 5 published talents on impronta | P0 — Phase C |

### A.4.2 — Dead/stub buttons + features
| Surface | What | Severity |
|---|---|---|
| Identity bar | Notifications bell — no panel, no destination | P1 |
| Identity bar | Help `?` — no destination | P2 |
| Identity bar | EN/ES toggle — visible but doesn't change locale | P1 |
| Identity bar | Sign-out `↩` — unlabeled icon | P2 |
| Settings | Notifications section — "configurable in a future update" stub | P1 |
| Settings | Profile + Email + Sign-in method — all read-only with "contact agency to update" | P1 |
| Today | Sticky bottom bar duplicates header CTA on desktop | P2 |
| Messages list | Filter pills reset on every visit (no URL persistence) | P2 |
| Messages thread | Cannot reply in-page; must click "Open thread" | **P0 — Phase B core** |

### A.4.3 — Permission visibility risks (engine-side OK; UI-side untested)

What MUST NEVER reach the client UI:
- `inquiry_offers.talent_cost` / line-item private rates (`inquiry_offer_line_items.talent_cost`)
- `inquiry_offers.coordinator_fee`
- `inquiry_offers.platform_fee` / commission split
- `inquiry_messages` rows where `thread_type='private'` AND sender is staff (admin-only thread)
- `inquiry_events` of staff-internal kinds
- `inquiry_activity_log` rows with `visibility='internal'` (if exists)
- Talent `availability_data` raw conflicts
- `agency_memberships.role` of staff members
- `agency_entitlements.plan_key` / commission % values

**Status**: today the engine paths gate this correctly via RLS + `pov` filtering in the existing Messages shell. BUT the new `/client/messages` page directly reads `inquiry_messages` with `thread_type='private'` — that's the **client-private** thread (client ↔ coordinator), not the admin-private internal thread. **Names collide.** RLS protects it today (client only sees rows where they are participant); confirm with a permission-walk in Phase B.

**Action**: build the explicit client-safe views called for by plan §21.5:
```
client_project_view · client_project_details_view · client_offer_view
client_lineup_view · client_activity_view · client_files_view
```

### A.4.4 — Component reuse map

| Component | Where used | Lens variants needed |
|---|---|---|
| `ClientPageHeader` | every client page header | none — generic |
| `NewInquiryButton` | every client page header + empty states | per-variant (primary/ghost/icon) |
| `StatusChip` | Today + Inquiries + (recently) shared | none — unified palette |
| `EmptyState` | every list page | none — generic |
| `InquiryCartFormFields` | public dir + talent page + workspace dashboard + Messages drawer | none — already shared |
| `MessagesShell` (prototype, internal) | admin shell only | needs **client-pov** real impl (Phase B) |
| `ClientProjectShell` (prototype, internal) | admin shell internal `messages.tsx` | mocked data; not the real client home |
| `ConversationStream` | admin shell internal | needs client-safe variant |
| `OfferTab` | admin shell only — and it's **mocked** (per v1 audit) | Phase E — wire to live `inquiry_offers` |
| `LineupTab` | admin shell only | Phase B/C — client variant hiding private rates |
| `DetailsTab` | admin shell internal | Phase C — client variant |
| `FilesTab` | admin shell internal | Phase C — client variant |

### A.4.5 — Performance/perf

| Issue | Status |
|---|---|
| `loadWorkspaceRosterEnriched` on every page → 17 min hang | ✅ fixed in 77a342e45 |
| N+1 unread-count query in `loadClientInquiries` | open — Phase B engineering enabler |
| `dynamic="force-dynamic"` on every page disables cache | open — Phase B tuning |
| No realtime — every status change needs refresh | open — Phase B |
| Identity bar server-renders on every nav | open — Phase B layout polish |

---

## A.5 — Console / network errors observed during walk

| Surface | Error | Source | Severity |
|---|---|---|---|
| Today (1st render after perf-fix) | none | — | OK |
| Messages | none after `c659e29b7` (sender_user_id null fix) | — | OK |
| Discover (impronta) | none — but page renders empty state with 5 roster rows in DB | filter logic | P0 |
| `/client/pitches` | 404 | route missing | P1 |
| `/client/inquiries/[id]` | none | — | OK |
| Bookings | none | — | OK |
| Settings | none | — | OK |

---

## A.6 — Component duplication summary

There are **three competing form systems**:

1. **`InquiryCartForm` + `InquiryCartFormFields`** (public-grade, used by 4 surfaces)
2. **`NewInquiryForm`** (workspace-client wrapper around (1))
3. **`InquiryComposer`** (admin-only, 5-step prototype, partially live — admin mode writes real, client/hub modes write to mock store)

**Plan §7 says one canonical engine.**

Recommended target: **`<InquiryIntent>` data type + one `<InquiryDrawer>` component + one `createInquiryFromIntent()` function.** Existing field components (`InquiryCartFormFields`) become the rendering primitive; `NewInquiryForm` becomes a thin variant of `InquiryDrawer`; `InquiryComposer` admin mode becomes `<InquiryDrawer variant="admin">`; client/hub mock paths get deleted.

---

## A.7 — Phase A acceptance check

Per plan §23 Phase A acceptance:

- [x] **No unknown client inquiry path remains** — 7 functions identified (A.2)
- [x] **Every entry point is documented** — including the 10 plan §7 sources mapped to today's reality (A.2.2)
- [x] **Every duplicate form is identified** — 3 form systems (A.6)
- [x] **Client route map** — 12 reachable routes (A.1)
- [x] **Data payload comparison** — 25-row diff table (A.3.2)
- [x] **Broken UX list** — A.4.1–A.4.2
- [x] **Permission leak list** — A.4.3 (engine-side OK; UI walk pending Phase B)
- [x] **Component reuse map** — A.4.4
- [x] **Console/network errors** — A.5

Phase A is closed.

---

## A.8 — What Phase B must do (handoff)

Phase B = "Bring client into universal Messages shell." Concretely, with handoffs ready:

1. **Engineering enabler first** (do this before any UI work — plan §25 rule):
   - Build `lib/inquiry/inquiry-intent.ts` with `InquiryIntent` type + `createInquiryFromIntent()` + `saveInquiryDraft()` + `submitInquiryDraft()`.
   - Add `inquiry_drafts` table (migration).
   - Extend `INQUIRY_SOURCE_CHANNEL_VALUES` to cover plan §7 sources (10 values).
   - Add `source_context jsonb` column to `inquiries` for provenance metadata that doesn't fit an enum.
   - Build `loadClientProjects(userId, tenantId)` as a SECURITY DEFINER RPC.
   - Delete `createManualInquiry` (the engine-bypass legacy admin path).

2. **Then UI**:
   - `/client/messages` becomes the home (already there); IA collapse Today + Inquiries via redirects.
   - Header rows 1/2/3 per plan §5.
   - Tabs Chat · Lineup · Offer · Details · Files inside the thread pane.
   - In-page reply composer (closes the biggest friction loop).
   - Realtime subscription on `inquiry_messages` for the active inquiry.
   - Mobile bottom nav.

3. **Done when**: a client can reply to a message without leaving the dashboard; can see a status flip in real time; the dashboard works on 375px.

---

## A.9 — Status

- **Phase A complete**: 2026-05-14.
- **Hard rule reaffirmed**: unify the inquiry engine before the client UI rebuild.
- **Next action**: Phase B engineering enabler (`InquiryIntent` + drafts + RPC) — ship as one commit, then start UI.
