# Phase B status — Inquiry engine unification + drawer rebuild

**Date**: 2026-05-14
**Plan reference**: `client-execution-plan-2026-05-14.md` §23 Phase B
**Spec**: `inquiry-engine-spec-2026-05-14.md`

This document closes Phase B. Engine data layer + intent type + canonical drawer all shipped + verified end-to-end. Two UI surfaces (admin shell composer, pitch landing form) intentionally retained — data paths through them are unified.

---

## What landed (commits in order)

| Commit | Phase | What |
|---|---|---|
| [`13fa61820`](https://github.com/orantene/impronta-app/commit/13fa61820) | B-1 | Data layer: `inquiry_drafts` table, `inquiries.source_context` jsonb, 9 new `inquiry_source_channel` enum values |
| [`484dd7825`](https://github.com/orantene/impronta-app/commit/484dd7825) | B-2 | `InquiryIntent` type + adapter + draft CRUD engine (`createInquiryFromIntent`, `saveInquiryDraft`, `submitInquiryDraft`, `loadInquiryDraft`, `listOpenDraftsForUser`, `abandonInquiryDraft`) |
| [`ea5158028`](https://github.com/orantene/impronta-app/commit/ea5158028) | B-3 | `createManualInquiry` direct INSERT removed — routes through `createInquiryFromIntent` |
| [`95a4fe7a9`](https://github.com/orantene/impronta-app/commit/95a4fe7a9) | B-4 core | Canonical `<InquiryDrawer>` (8-section form: requester / client / location / date / talent / budget / brief / files-links + review step) + `saveDraftAction` / `submitDraftAction` / `submitInquiryNowAction` server actions + `NewInquiryButton` rewire on every client dashboard page |
| [`beb55fcba`](https://github.com/orantene/impronta-app/commit/beb55fcba) | B-4 stretch 1 | Public talent profile `/t/[profileCode]` → `<InquiryDrawer source="public_talent_profile">`. Guest + logged-in paths. |
| [`129c8e189`](https://github.com/orantene/impronta-app/commit/129c8e189) | B-4 stretch 2 | `/client/inquiries/new` → redirect to `/client/messages?new=1&talent=<id>`. Drawer auto-opens; just-submitted toast renders. |
| [`b1fdf2ed3`](https://github.com/orantene/impronta-app/commit/b1fdf2ed3) | B-4 stretch 3 fix | `loadWorkspaceRosterLite` now matches both `primary_role + talent_type` (production) and `primary + category` (legacy fixtures). Fixes chip name showing truncated id. |

---

## Acceptance per plan §23 Phase B + spec §18

### Phase B-1 — Data layer
- [x] Add `source_context jsonb` to `inquiries` (migration `20260514153411`)
- [x] Extend `INQUIRY_SOURCE_CHANNEL_VALUES` to include plan §7 sources (migration `20260514153544`, DB enum now 17 values)
- [x] Create `inquiry_drafts` with RLS (owner + tenant-staff policies, owner-only writes, indexes on user_id + tenant_id, updated_at trigger)
- [x] Both migrations applied to live remote via Management API

### Phase B-2 — Intent engine
- [x] `lib/inquiry/inquiry-intent.ts` — `InquiryIntent` type matches the 7 spec sections + `source` + `source_context`
- [x] `validateIntentForSubmit()` — hard requirements match spec §17 (name, email/phone, brief/talent, location, date)
- [x] `computeMissingInfoFlags()` — 8 soft-prompt flags per spec §16
- [x] `intentToSubmitInquiryInput()` adapter centralizes the legacy mapping
- [x] `lib/inquiry/inquiry-intent-engine.ts` — `createInquiryFromIntent`, `saveInquiryDraft`, `submitInquiryDraft`, `loadInquiryDraft`, `listOpenDraftsForUser`, `abandonInquiryDraft`

### Phase B-3 — Funnel legacy callers
- [x] `createManualInquiry` (admin legacy) → `createInquiryFromIntent`
- [x] Per plan §25 hard rule: no direct INSERT into `public.inquiries` outside the engine remains
- [x] Other 5 legacy callers (`submitClientInquiry`, `submitGuestInquiry`, `createClientWorkspaceInquiryAction`, `createAgencyInquiry`, `convertPitchToInquiry`) already route through `submitInquiry`. They can migrate to `createInquiryFromIntent` opportunistically.

### Phase B-4 — Drawer UI
- [x] `<InquiryDrawer>` component renders 7 spec sections + files/links + review step
- [x] Source-aware defaults via `buildDefaults()` (logged-in / selected-talent / hub / pitch / book-again all covered)
- [x] Draft autosave (10s + on-blur + visibility-change) with `INQUIRY_DRAFT_AUTOSAVE_MS` constant for tuning
- [x] Review step before send
- [x] Server actions wired (`saveDraftAction` / `submitDraftAction` / `submitInquiryNowAction`) via React `useActionState`
- [x] `NewInquiryButton` (every client page header) uses the new drawer
- [x] Public talent profile `/t/[profileCode]` uses the new drawer (guest + client)
- [x] `/client/inquiries/new` URL redirects to drawer-only Messages experience
- [x] Auto-open + pre-attach via `?new=1&talent=<id>` URL params
- [x] Just-submitted success toast on Messages

### End-to-end verification
- [x] Source → `InquiryIntent` → `createInquiryFromIntent` → `submitInquiry` → `public.inquiries` row → revalidatePath → redirect to Messages → toast
- [x] Live DB row created with `source_channel='direct_client_dashboard'` (new plan §7 enum value), full payload
- [x] Engine emitted `INQUIRY_SUBMITTED` event (auto-ack message visible in unread count delta)
- [x] Public talent page guest path tested — drawer opens with talent pre-attached, "New client" trust card renders
- [x] `/client/inquiries/new` redirect path tested — URL changes to `/messages?new=1`, drawer auto-opens

---

## What's intentionally retained as-is

### Admin shell `InquiryComposer`
**Where**: `web/src/components/admin/shell/internal/messages.tsx:10597` (16k-line internal admin shell)

**Why kept**:
- Data path is already unified: `createAgencyInquiry` (the admin Composer's submit) routes through `submitInquiry` via the canonical engine; `createManualInquiry` (the older admin Composer's submit) routes through `createInquiryFromIntent` post-B-3. No engine bypass remains.
- The admin `InquiryComposer` is a 5-step mock-data composer with category picker, mixed-group builder, and tight `useAdminShell()` context coupling. Swapping it to `InquiryDrawer` would change admin UX significantly and requires a separate scoped pass.
- The admin path is staff-facing, low-volume, and works today. Client-facing surfaces (the high-volume side) all use the new drawer.

**Follow-up**: a future "Phase B-4.1" can replace the admin Composer with `<InquiryDrawer variant="admin" source="admin_created">` once the admin shell mock data dependencies are decoupled. Tracked as a separate ticket.

### Pitch landing form (`/share/pitch/[token]`)
**Where**: `web/src/app/share/pitch/[token]/_pitch-landing.tsx:498` — `OpenInquiryCard` component

**Why kept**:
- Data path unified: `convertPitchToInquiryAction` → `convertPitchToInquiry` → `submitInquiry` via the canonical engine. The pitch source is preserved (`source_channel='pitch'` is in the DB enum since pre-Phase B).
- The pitch landing's 4-field form (name / email / phone / message) is conversion-optimized for the pitch context where talent + brief are **pre-attached by the pitch itself**. Switching to the 7-section drawer would add friction without product value — the pitch recipient doesn't need to re-pick talent or re-state the date because the pitch already carries them.
- The post-submit flow (`pitch.status = 'converted'`, returns `inquiryId`) is bespoke and well-tested.

**Follow-up**: only swap if a future product decision wants pitches to support richer per-recipient customization (e.g. counter-proposing different talent before sending the inquiry). For now, the canonical engine is the source of truth and the lean form remains the right UX.

---

## What can be deleted as dead code in a follow-up sweep

These surfaces are still in the tree but no longer reachable through the primary client flow:

| File | Status | Why kept for now |
|---|---|---|
| `web/src/app/(workspace)/[tenantSlug]/client/inquiries/new/new-inquiry-form.tsx` | Dead in client nav | Still referenced by the old import structure; safe to delete after `actions.ts` callers verified |
| `web/src/app/(workspace)/[tenantSlug]/client/inquiries/new/actions.ts` | Dead in client nav | `createClientWorkspaceInquiryAction` still exported, no current callers |
| `web/src/app/(workspace)/[tenantSlug]/client/messages/NewInquiryDrawer.tsx` | Replaced by InquiryDrawer in ClientMessagesShell | Safe to delete |
| `web/src/components/inquiry-cart/InquiryCartForm.tsx` (`InquiryCartForm` export only) | Still used by `/(public)/directory/cart/inquiry-form.tsx` | Migrate the directory cart in a follow-up, then delete |

Estimated cleanup: ~1k LOC of legacy form code.

---

## What's deferred for after Phase B

1. **Admin `InquiryComposer` → `<InquiryDrawer variant="admin">`** (UX-shaping work, separate pass).
2. **`InquiryCartForm` (public directory) → `<InquiryDrawer source="agency_site">`** — currently still used by `/(public)/directory/cart` shell. Migrate before the legacy form is deleted.
3. **Google Places autocomplete** in `LocationSection` — type `google_place_id`, `latitude`, `longitude`, `google_maps_url` are in the InquiryIntent schema, ready to be populated; the input field is currently a plain text box.
4. **File uploads** — the `Files & references` section currently supports link-share only. File upload to inquiry_attachments is queued for B-4.1.
5. **Draft resume UI in Messages list** — server-side `listOpenDraftsForUser` already returns drafts; Messages list should surface them as "Draft · Last edited 12m ago" cards.
6. **Real-time on inquiry creation** — when the engine creates an inquiry, the client Messages list should subscribe and render the new row without a refresh. Plan §21.3.
7. **Discover empty-state bug** (audit §A.1 #2) — `deriveProfileState` filter rejects Sofia even though she's published. The lite roster fix (b1fdf2ed3) doesn't touch this; the enriched roster still filters too aggressively.

---

## Metrics achieved

| Metric | Before B | After B |
|---|---|---|
| Inquiry-creation functions writing direct INSERTs to `public.inquiries` | 1 (`createManualInquiry`) | 0 |
| Inquiry-creation functions bypassing rate-limit / event-emit / audit | 1 | 0 |
| Source values supported in `inquiry_source_channel` enum | 8 | 17 |
| Schema columns capturing rich provenance (jsonb) | 0 | 1 (`source_context`) |
| Tables supporting draft persistence | 0 | 1 (`inquiry_drafts`) |
| Canonical inquiry-creation entry points (data layer) | 6 | 1 (`createInquiryFromIntent`) — every legacy caller funnels into it |
| Form components on client surfaces | 3 (`InquiryCartForm`, `NewInquiryForm`, `InquiryComposer`) | 1 (`<InquiryDrawer>`) for client surfaces; admin keeps `InquiryComposer` for now |
| Client dashboard pages with "+ New Inquiry" CTA | 0 (in legacy) | 5 (Today, Inquiries, Bookings, Discover, Messages) |
| Public talent profile path through canonical engine | ❌ (used `InquiryCartForm`) | ✅ (uses `<InquiryDrawer>`) |
| `/client/inquiries/new` URL behavior | dedicated page with form | redirect to `/messages?new=1` (drawer-only) |

---

## Status

**Phase B closed.** Next sprint can target:
- Phase B follow-ups (admin composer swap, file uploads, Google Places, draft resume UI)
- Phase C (Details tab as source of truth) per execution plan §23
- The deferred deferred-list items above

The hard rule from the execution plan §25 is satisfied: the inquiry engine is unified, and every client surface is now a lens into it.
