# Inquiry funnel — execution plan (2026-05-13)

Companion to `inquiry-funnel-audit-2026-05-13.md`. The audit is the
binding spec. This doc is how we ship it: agent assignments, model
picks, effort sizing, parallelization graph.

## TLDR

```
Critical path:  0 → 2 → 1 → 3 → 4   (foundation + form parity, sequential)
Fan-out wave 1: 5, 8, 10, 11        (start in parallel after step 0 lands)
Fan-out wave 2: 7                   (starts after step 3 lands)
Fan-out wave 3: 6, 9                (start after step 4 lands)
```

Realistic time-to-business-unlock if we run agents in parallel where the
plan allows: **~6–8 hours of agent compute** for steps 0–4 + the early
parallel fan-out, then **~6–8 more hours** for 6, 7, 9. Step 8 is a
parallel marathon by itself (~8–12 hours).

## Reordering decision (vs the audit §9c)

Audit had `0 → 1 → 2 → 3 → 4`. **Swapping 1 and 2** is more efficient:
hoist the shared `<InquiryCartForm>` FIRST, then wire saved_talent into
that single component. Otherwise step 1 ships dashboard saved_talent on
the old form, then step 2 has to redo the wiring on the new shared form.

Final order: `0 → 2 → 1 → 3 → 4 → 7 → 6/9 → 8 → 10/11`.

## Step-by-step plan

### Step 0 — Foundation: engine convergence + universal-connector schema + stage machine + spam protection (EXPANDED 2026-05-13)

**Goal**: make `submitInquiry` the universal connect-two-parties primitive
that EVERY initiation surface (client / admin / talent / hub / free
agent) flows through. Today 5 server actions insert into `inquiries`;
3 of them bypass the engine. Plus the schema conflates "the client"
with "who initiated" — both need fixing in the same step.

**Scope (two parts):**

**Part A — Schema additions** (one migration):

```sql
ALTER TABLE public.inquiries
  ADD COLUMN initiator_role text
    CHECK (initiator_role IN ('client', 'admin', 'talent', 'hub', 'free_agent')),
  ADD COLUMN initiator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill existing rows: rows where client_user_id IS NOT NULL get
-- initiator_role='client' + initiator_user_id=client_user_id. Rows from
-- the admin manual path get initiator_role='admin' + initiator_user_id
-- pulled from the audit log if present, NULL otherwise.
UPDATE public.inquiries
  SET initiator_role = CASE
    WHEN client_user_id IS NOT NULL THEN 'client'
    WHEN source_channel = 'pitch' THEN 'admin'
    WHEN source_page LIKE 'admin-workspace%' THEN 'admin'
    ELSE 'client'  -- conservative default for legacy rows
  END,
  initiator_user_id = COALESCE(client_user_id, NULL);
```

After backfill, make `initiator_role` NOT NULL (separate migration once
all paths are writing it).

**Part B — Engine + path convergence:**

- Extend `SubmitInquiryInput` with `initiator_role` (required) + `initiator_user_id` (defaults to `actorUserId`).
- `submitGuestInquiry` — keep guest-session resolution + `ensureGuestClientByEmail`, but call `submitInquiry` with `initiator_role: 'client'` + `client_user_id: <guest's provisioned id>` instead of doing a direct insert.
- `convertPitchToInquiry` — add `origin_domain` + `source_workspace_id` to the submitInquiry call (from the pitch's tenant + share URL host). Set `initiator_role: 'admin'` (pitch is admin-initiated) + `initiator_user_id: <pitch creator>`.
- `createAgencyInquiry` (admin manual) — rewrite to call `submitInquiry` with `source_channel: 'admin_manual'`, `initiator_role: 'admin'`, `actorUserId: <staff user>`, `client_user_id: null` (admin can create on behalf of unregistered clients; the merge layer links them later by email/phone).

**Files**:
- New migration in `supabase/migrations/`
- `lib/inquiry/inquiry-engine-submit.ts` (signature update + insert column)
- `(public)/directory/actions.ts` (`submitGuestInquiry`)
- `lib/pitch/pitch-engine.ts` (`convertPitchToInquiry`)
- `lib/server-actions/admin-inquiries.ts` (`createAgencyInquiry`)
- `app/(workspace)/[tenantSlug]/client/inquiries/new/actions.ts` (pass `initiator_role: 'client'`)

**Part C — Stage machine formalization** (PO-locked addition):

```ts
// lib/inquiry/inquiry-lifecycle.ts — make the table source-of-truth
const STAGE_TRANSITIONS: Record<InquiryStage, InquiryStage[]> = {
  submitted:    ['coordination', 'rejected', 'expired'],
  coordination: ['offer_sent', 'rejected', 'expired'],
  offer_sent:   ['approved', 'coordination' /* counter */, 'rejected', 'expired'],
  approved:     ['booked', 'cancelled'],
  booked:       ['wrapped', 'cancelled'],
  wrapped:      ['archived'],
  // etc.
};
```

Today stage names are scattered across server actions; the lifecycle
helper exists but is permissive. Tighten it: every state-change goes
through `canTransition(currentStage, targetStage)` + a paired
`onTransition` hook that emits the audit row + notification.

**Part D — Spam protection on guest path** (PO-locked addition):

- Add per-IP rate limit (`x-forwarded-for` header, fallback to `x-real-ip`) — 3 guest inquiries/hour/IP.
- Honeypot field on the guest form (`<input name="website" tabindex="-1" autocomplete="off">`); reject if filled.
- Per-tenant throttle (50 inquiries/hour/tenant) alongside the existing per-user (5/hour) — prevents one bad actor across multiple guest sessions hammering one agency.
- Optional captcha placeholder (hCaptcha integration stub) — not enabled by default, settings-driven per tenant.

**Files**:
- New migration in `supabase/migrations/`
- `lib/inquiry/inquiry-engine-submit.ts` (signature update + insert column)
- `lib/inquiry/inquiry-lifecycle.ts` (stage machine)
- `lib/inquiry/inquiry-rate-limiter.ts` (per-IP + per-tenant gates)
- `(public)/directory/actions.ts` (`submitGuestInquiry` + honeypot check)
- `lib/pitch/pitch-engine.ts` (`convertPitchToInquiry`)
- `lib/server-actions/admin-inquiries.ts` (`createAgencyInquiry`)
- `app/(workspace)/[tenantSlug]/client/inquiries/new/actions.ts` (pass `initiator_role: 'client'`)

**Effort**: L (7–10h). Critical correctness across architecture + schema
+ stage machine + abuse protection — all the pieces every later step
depends on. Worth the extra 3-4h vs M+ to pay the foundation tax once.

**Model**: **Opus** (me, foreground). Multi-file architectural change,
schema design, downstream effects on every later step.

**Deliverable**: 5 paths → 1 engine call. Initiator role visible in
every inquiry row. Stage machine source-of-truth. Guest path
abuse-protected. Test by submitting one inquiry through each surface
and verifying `initiator_role` + `initiator_user_id` are populated
correctly, stage transitions are gated, and guest spam attempts are
rate-limited.

**Blocks**: 1, 2, 3, 4, 5, 7, 9, 12, 13, 14, 15. Unblocks the "any role
can initiate" expansion (future talent-initiated + hub-matchmaker
flows) without schema changes downstream.

---

### Step 2 — Hoist `<InquiryCartForm>` to shared component

**Goal**: extract the form from `(public)/directory/cart/inquiry-form.tsx` into `components/inquiry-cart/InquiryCartForm.tsx`. Both `/directory/cart` and `/[tenantSlug]/client/inquiries/new` render the same component with different props.

**Effort**: M (4–6h). Mechanical extraction + prop interface design + verifying public + dashboard both render unchanged.

**Model**: **Sonnet** (agent). Clear spec, contained file moves, no architectural decisions.

**Agent prompt outline**:
- Extract InquiryForm/ClientInquiryForm/GuestInquiryForm to `components/inquiry-cart/`
- Props: `{ pov: "client" | "guest", tenantId, sourceWorkspaceId, originDomain, prefilledTalentIds, prefilledClient, planTier }`
- Update both call sites to render the shared component
- TS + lint clean, no behavioral change

**Blocks**: 1, 3, 4 (all subsequent form work goes into the shared component).

---

### Step 1 — Dashboard pulls `saved_talent`

**Goal**: client's saved talent appears as chips at the top of the dashboard `/new` form. Click a chip → adds to `talentIds[]`. Submit clears those rows from `saved_talent`.

**Effort**: S (1–2h). Reads from `saved_talent` table; existing query patterns from `(public)/directory/actions.ts`.

**Model**: **Sonnet** (agent).

**Agent prompt outline**:
- Add `loadClientSavedTalent(userId, tenantId)` to the dashboard page server load
- Pass to `<InquiryCartForm>` as `prefilledTalentIds`
- Render as a "Your saved" section at the top of the form
- On submit success, the existing `delete from saved_talent` in the directory action already handles cleanup — make sure the dashboard action mirrors it

**Blocks**: 3 (multi-mode form needs this baseline first).

---

### Step 3 — Category mode + `requirement_groups` multi-insert (BIG)

**Goal**: top of the form has a 2-way toggle: **"Pick specific"** vs **"Request by category"**. Category mode renders a role-quantity matrix that fans out into N `inquiry_requirement_groups` rows on submit.

**Effort**: M (4–6h). New UI surface + schema-aware form + engine signature change (engine currently creates ONE default group; needs to accept N).

**Model**: **Opus** (agent or me). Engine signature change is the risky part — needs to read the audit's §9b expansion + the existing `inquiry-engine-submit.ts` insert pattern + ensure backward compat for the "Pick specific" mode (which sends an empty `requirement_groups[]` and the engine falls back to the legacy default-group behavior).

**Agent prompt outline**:
- Extend `SubmitInquiryInput` with `requirement_groups?: { role_key, quantity_required, notes }[]`
- If provided, insert N groups; if empty, keep existing default-group behavior
- Add the mode toggle to `<InquiryCartForm>` — when "Request by category", swap the talent picker for a `RequirementGroupBuilder` component
- Wire the new fields through the form action → engine call

**Schema**: no new tables — `inquiry_requirement_groups` already has `role_key, quantity_required, sort_order, notes`. Just need a way to look up `role_key` enum values (taxonomy).

**Blocks**: 4, 7, 9.

---

### Step 4 — Budget block

**Goal**: add `budget_amount_cents`, `budget_currency`, `budget_unit`, `budget_notes` columns to `inquiries`. Form has a "Budget" section with the unit dropdown (per_hour / per_day / per_event / per_project / total / agency_decides).

**Effort**: S (1–2h). One migration + 4 new fields in the form + pass through the engine.

**Model**: **Sonnet** (agent).

**Agent prompt outline**:
- Migration: add 4 columns to `inquiries` (all nullable)
- Extend `SubmitInquiryInput` + the form
- "Budget" section in `<InquiryCartForm>` with toggle "I have a budget" / "Let the agency suggest"
- When a specific talent is picked, prefill the unit + amount from the talent's profile rate if set

**Blocks**: 9 (hub cart routing needs structured budget for triage).

---

### Step 5 — `saved_talent.in_cart` column (parallel)

**Goal**: distinguish "saved for later" (browsing) from "queued for this inquiry" (cart). Cart UI reads `WHERE in_cart = true`.

**Effort**: S (1–2h). One migration + update the few callers.

**Model**: **Haiku** (agent). Pure mechanical work.

**Independent of**: everything past step 0. Can ship in parallel with steps 1–4.

---

### Step 6 — Plan-tier-aware form shaping

**Goal**: `<InquiryCartForm planTier={tier}>` toggles which sections render. Free = minimal, studio = + brief, agency = + cart, hub = + agency selector.

**Effort**: M (4–6h). Logic per tier + UI conditionals + read `loadTenantPlanTier()`.

**Model**: **Sonnet** (agent).

**Depends on**: step 4 (so the full field set exists before we start hiding pieces).

---

### Step 7 — Admin "Suggested talent" chat card

**Goal**: in the Client thread, the admin can attach a talent suggestion to a message. The card has a "Add to lineup" button → calls `addTalentToInquiry` → posts a notice → updates the requirement_groups breakdown in real time.

**Effort**: M (4–6h). New chat-card kind (`admin_suggested_talent`) + render switch update + action wiring + RLS-aware engine path.

**Model**: **Opus** (agent). Touches messages.tsx render switch + engine path + chat-card schema; cross-system.

**Agent prompt outline**:
- New `inquiry_message_kind` enum value `'admin_suggested_talent'` (migration)
- `card_payload` shape: `{ talent_profile_id, talent_name, rate_label, requirement_group_id, status: 'pending'|'added'|'dismissed' }`
- Render switch in messages.tsx: chip + "Add to lineup" button
- "Add to lineup" → `addTalentToInquiry` engine call (already wired)
- Update card_payload.status to 'added' after success

**Depends on**: step 3 (requirement_groups must be queryable to know what slots exist).

---

### Step 8 — Pitch v2 (parallel marathon)

**Goal**: 3-outcome pitch lifecycle + recipient identity options + pitch history surface.

**Effort**: L (8–12h). Multi-file, multi-surface:
- Migration: add `'approved'` to `pitches.status` enum; add `pitches.approved_at`
- `/share/pitch/[token]` landing: add "Register account" + "Continue as guest" + "Decline" + "Approve" buttons (4-way)
- New surface `/[tenantSlug]/client/pitches` — history list with status filter
- Engine: `approvePitch(pitchId, recipientUserId)` server action
- `convertPitchToInquiry` already exists; called from "Submit as inquiry" CTA on an approved pitch

**Model**: **Opus** (agent). Auth-state branching + new UI surface + status lifecycle.

**Independent of**: steps 1–4 (it's a different surface). Can ship in parallel with the form work.

---

### Step 9 — Hub cart routing

**Goal**: hub-site cart with talent from multiple agencies. At submit, force the client to pick one agency OR split the cart into N inquiries.

**Effort**: L (8–12h). Cross-tenant logic + new triage queue + split-cart UX.

**Model**: **Opus** (agent). Cross-tenant data model touches.

**Depends on**: steps 0–4. Holds until those land — too much overlap.

---

### Step 10 — Free-tenant talent-page direct CTA (parallel)

**Goal**: every public talent page has an "Inquire" button. Click → inline mini-cart with just that talent pre-selected → guest-first form.

**Effort**: S (1–2h). Add the button + open the existing `<InquiryCartForm>` in a modal with `prefilledTalentIds=[talentId]`.

**Model**: **Sonnet** (agent).

**Depends on**: step 2 (needs the shared form).

---

### Step 11 — Guest TTL cleanup (parallel)

**Goal**: a cron-style job deletes `saved_talent` rows older than 30 days where `client_user_id IS NULL`.

**Effort**: S (1–2h). One scheduled function (Supabase cron) or a Vercel cron route.

**Model**: **Haiku** (agent).

**Independent of**: everything.

---

### Step 12 — Analytics + funnel telemetry (PO-locked 2026-05-13)

**Goal**: every step of the inquiry funnel emits a structured analytics
event so we can measure conversion. Without this we cannot tell if the
new form converts better than the old one.

**Events to instrument**:
- `inquiry_form_started` — page mount
- `talent_added_to_cart` (with talent_profile_id + source surface)
- `category_added` (with role_key + quantity)
- `budget_set` (with unit)
- `inquiry_submitted` (with mode: 'pick' | 'category', talent_count, has_budget, source_channel)
- `inquiry_abandoned` (form unmount without submit)

**Files**: hook into every form in `<InquiryCartForm>` + every server
action's success path. Reuse existing `logAnalyticsEventServer` +
`PRODUCT_ANALYTICS_EVENTS`.

**Effort**: S (1-2h).
**Model**: **Sonnet** (agent).
**Depends on**: step 0 (single engine path → one place to instrument
submit events).

---

### Step 13 — Notifications baseline + workspace auto-ack (PO-locked 2026-05-13)

**Goal**: every inquiry event that should notify a human, does.

**Email triggers (baseline)**:
- Client submits → client receives confirmation ("we got your inquiry, expect a response within Xh")
- Coordinator auto-assigned → coordinator receives "you've been assigned to inquiry X" with deep link
- Talent invited → talent receives "you've been invited to inquire about X" with deep link

**Workspace auto-ack** (folded in from tier-2):
- Setting on each tenant: "Auto-reply with this message when an inquiry is submitted" (default: "Thanks — we'll get back to you within 4 hours")
- On `INQUIRY_SUBMITTED` event, post the auto-ack message into the Client thread via `insertSystemMessage` with `system_event_type: 'workspace_auto_ack'`
- Settings UI: agency Settings → Workspace → Auto-acknowledgement (toggle + textarea)

**Files**:
- New `lib/email/inquiry-notifications.ts` — transport wrappers around existing email provider (Resend/Postmark/whatever is already wired; check `lib/email/`)
- New migration: `agencies.auto_ack_message text` + `agencies.auto_ack_enabled boolean default true`
- New row in `inquiry_message_kind` enum: `'workspace_auto_ack'` (already exists as 'system_event'; reuse or extend)
- Hook into `submitInquiry` engine on success: fire all 3 emails + auto-ack message insert

**Effort**: M (4-6h) — most of the time is in email transport plumbing
if it's not already wired; check first.
**Model**: **Sonnet** (agent).
**Depends on**: step 0 (single engine path; one place to fire from).

---

### Step 14 — Inquiry attachments (PO-locked 2026-05-13)

**Goal**: client (or admin) can attach files to an inquiry — mood
boards, contracts, reference shots. Without this the first message in
every Client thread is "can you email me the brief."

**Schema**:
```sql
CREATE TABLE public.inquiry_attachments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  tenant_id uuid not null references public.agencies(id) on delete cascade,
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  filename text not null,
  bucket_id text not null,
  storage_path text not null,
  byte_size bigint not null,
  content_type text,
  created_at timestamptz not null default now()
);

-- RLS: inquiry participants + agency staff can read; uploader OR staff can delete.
```

**UI**:
- Drag-drop zone in `<InquiryCartForm>` ("Attach mood board, contract, references")
- File chips below the form with remove buttons
- Admin shell Files tab already exists — just hook into `inquiry_attachments`

**Files**:
- New migration
- New component `components/inquiry-cart/InquiryAttachmentsUploader.tsx`
- Storage: reuse the existing `media-public` / `media-originals` buckets with `purpose: 'inquiry_attachment'`
- Wire to admin shell Files tab (already exists)

**Effort**: M (4-6h) — schema + RLS + upload UI + read surface.
**Model**: **Opus** (agent). Cross-system (schema + storage + RLS + UI).
**Depends on**: step 2 (shared form scaffold).

---

### Step 15 — i18n: form copy through translation keys (PO-locked 2026-05-13)

**Goal**: every string in the inquiry form (placeholders, labels,
errors, helper text, CTAs) goes through translation keys. Spanish
translations baked in from day 1.

**Files**:
- Extract all hardcoded strings from `<InquiryCartForm>` and its
  children into `public.forms.inquiry.*` translation keys (i18n
  framework already exists; see `createTranslator` + `getRequestLocale`)
- Add ES translations for all keys
- Tenant locale OR user locale drives which strings render

**Effort**: S (2-3h) — straightforward mechanical pass.
**Model**: **Sonnet** (agent).
**Depends on**: step 2 (string surfaces stabilized in the shared component).

---

## Parallelization graph (POST-EXPANSION 2026-05-13)

```
                                                  ┌─→ [5]  in_cart column        (Haiku)
                                                  ├─→ [11] TTL cleanup           (Haiku)
                                                  ├─→ [12] analytics             (Sonnet)
                                                  ├─→ [13] notifications + ack   (Sonnet)
                                                  ├─→ [8]  pitch v2              (Opus marathon)
                                                  │
[0] FOUNDATION (Opus, foreground) ──→ [2] hoist form ──┤
  • engine convergence                            │    ├─→ [14] attachments      (Opus)
  • universal-connector schema                    │    ├─→ [10] free-tenant CTA  (Sonnet)
  • stage machine                                 │    └─→ [15] i18n             (Sonnet)
  • spam protection                               │
                                            ├──→ [1] saved_talent ──→ [3] category ──→ [4] budget ──┐
                                            │                              │                          │
                                            │                              └──→ [7] suggested-talent ←┤
                                            │                                                          │
                                            │                                                          ├─→ [6] plan-tier shaping
                                            │                                                          │
                                            │                                                          └─→ [9] hub routing
```

Step 0 unblocks **8 parallel agents simultaneously** (5, 11, 12, 13, 8,
14, 10, 15) — only 2 (10, 15) wait on step 2 landing, the rest fire
immediately.

## Recommended agent dispatch sequence (POST-EXPANSION)

**Foreground (me, Opus) — Wave 0**:
1. **Step 0 — Foundation**. L effort. Lands engine convergence + universal-connector schema + stage machine + spam protection. Alone, in foreground.

**Background wave 1** — fire **6 agents** the moment step 0 lands:
- **Opus marathon**: Step 8 — pitch v2 (status enum + landing + history page)
- **Opus marathon**: Step 14 — attachments (schema + storage + RLS + form UI; waits on step 2 only for the UI hookup but can start the schema+RLS in parallel)
- **Sonnet**: Step 2 — hoist `<InquiryCartForm>` (blocks 1, 10, 15)
- **Sonnet**: Step 12 — analytics events on every form + every server action
- **Sonnet**: Step 13 — notifications baseline + workspace auto-ack
- **Haiku**: Step 5 — `saved_talent.in_cart` column
- **Haiku**: Step 11 — guest TTL cleanup cron

**Wave 1.5** — fire **2 more** the moment step 2 lands:
- **Sonnet**: Step 10 — free-tenant talent-page CTA
- **Sonnet**: Step 15 — i18n on inquiry form copy

**Foreground (me, Opus)** — Critical path continues:
- Step 1 — saved_talent into shared form. S effort.
- Step 3 — category mode + multi-`requirement_groups`. M effort. **Biggest business unlock.**
- Step 4 — budget block. S effort.

**Background wave 2** — fire after step 3 lands:
- **Opus**: Step 7 — admin suggested-talent chat card

**Background wave 3** — fire after step 4 lands:
- **Sonnet**: Step 6 — plan-tier shaping

**Sprint 2** (separate marathon, after sprint 1 finishes):
- **Opus**: Step 9 — hub cart routing

### Agent count summary

- Wave 0 (foreground): 1 (me)
- Wave 1 (post step 0): **7 background agents simultaneously** + me on critical path
- Wave 1.5 (post step 2): +2 background = up to 9 in flight at peak
- Wave 2 (post step 3): +1
- Wave 3 (post step 4): +1
- Sprint 2: 1 marathon

**Peak parallelism: ~9 background agents + foreground.** This is the
"all agents ready" maximum the PO authorized.

## Why this ordering wins

1. **One engine convergence first** → every later step automatically applies to all 5 entry points. No "fix it in N places" tax.
2. **Hoist before wire** → `saved_talent` lands in the shared component, not the legacy dashboard form that gets thrown away next step.
3. **Category mode early** → the actual business unlock (admin-curated chat-driven lineup) ships before the polish.
4. **Pitch v2 parallel** → marathon work that doesn't touch the form runs alongside the form sprint.
5. **Hub routing last** → it's the biggest cross-tenant lift and depends on everything else being stable.

## Effort total (POST-EXPANSION)

| Wave | Steps | Effort sum | Time-to-ship (parallel agents) |
|---|---|---|---|
| Foundation | 0 (L) | 7–10h | 7–10h |
| Critical form sprint | 2, 1, 3, 4 | M+S+M+S = ~12–16h | 12–16h sequential, but 2 runs in parallel with wave 1 agents |
| Wave 1 parallel | 5, 8, 11, 12, 13, 14 | S+L+S+S+M+M = ~22–32h | ~L = 8–12h (gated by step 8) |
| Wave 1.5 parallel | 10, 15 | S+S = ~4–6h | ~3h |
| Wave 2 parallel | 7 | M (4–6h) | 4–6h |
| Wave 3 parallel | 6 | M (4–6h) | 4–6h |
| Sprint 2 | 9 | L (8–12h) | 8–12h |

**Total compute**: ~70–95h of agent work.
**Sequential wall-clock with all agents firing**: **~25–35h** (because parallelization compresses everything except step 0 and the form sprint).
**Time to "real product" baseline** (step 0–4 + 12/13/14/15): **~20–25h** of wall-clock.

## Product-owner decisions (locked 2026-05-13)

All four questions from the original draft were resolved by the PO:

1. ✅ **Step 0 expanded** (M+ → L) — stage machine + spam protection folded in. Foundation pays once instead of three times.
2. ✅ **Tier-1 additions all in** — steps 12 (analytics), 13 (notifications + auto-ack), 14 (attachments), 15 (i18n) are real numbered steps in this plan. Each is foundational (analytics so we can measure, notifications so users aren't pinging the app, attachments so briefs aren't broken, i18n so half the user base isn't locked out).
3. ✅ **Tier-2: only auto-ack** — folded into step 13. Templates / clone / talent-init / free-agent / forwarding all PARK until v2 (engine-ready, UI on demand).
4. ✅ **Max parallelism authorized** — up to ~9 background agents in flight at peak.

## Execution starts now

I start step 0 in foreground immediately after committing this plan
update. Step 0 lands → 7 background agents fire simultaneously → I
continue the critical path (1 → 3 → 4) while they run.

QA marathon (talent/coord add-remove + message flow) resumes after
step 4 + the form-touching wave 1 agents (12, 13, 14, 15) land — that's
when the form is parity-complete and the funnel telemetry is live to
actually measure things.
