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

### Step 0 — Engine convergence + universal-connector schema (foundation)

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

**Effort**: M+ (5–7h). Critical correctness — every initiation path
gets re-routed through one engine call AND the schema gains the
universal-connector fields the rest of the plan depends on.

**Model**: **Opus** (me, foreground). Multi-file architectural change,
schema design, downstream effects on every later step.

**Deliverable**: 5 paths → 1 engine call. Initiator role visible in
every inquiry row. Test by submitting one inquiry through each surface
and verifying `initiator_role` + `initiator_user_id` are populated
correctly.

**Blocks**: 1, 2, 3, 4, 5, 7, 9. Unblocks the "any role can initiate"
expansion (future talent-initiated + hub-matchmaker flows) without
schema changes downstream.

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

## Parallelization graph

```
                                                  ┌─→ [5] in_cart column
                                                  │
                                                  ├─→ [10] free-tenant CTA  (after 2)
                                                  │
[0] engine convergence ──→ [2] hoist form ──┐    ├─→ [11] TTL cleanup
                                            │    │
                                            ├──→ [1] saved_talent ──→ [3] category ──→ [4] budget ──┐
                                            │                              │                          │
                                            │                              └──→ [7] suggested-talent ←┤
                                            │                                                          │
                                            │                                                          ├─→ [6] plan-tier shaping
                                            │                                                          │
                                            │                                                          └─→ [9] hub routing
                                            │
                                            └──→ [8] pitch v2  (parallel marathon)
```

## Recommended agent dispatch sequence

**Foreground (me, Opus):**
1. Step 0 first, alone, in foreground. ~M effort. Lands the foundation.

**Background wave 1** (fire after step 0 lands):
- Sonnet agent: Step 2 — hoist `<InquiryCartForm>`
- Opus agent: Step 8 — pitch v2 (marathon, kicks off early so it runs in parallel)
- Haiku agent: Step 5 — `in_cart` column
- Haiku agent: Step 11 — TTL cleanup

**Foreground (me, Opus)** after step 2 lands:
- Step 1 — saved_talent into the shared form. ~S.
- Step 3 — category mode + multi-group. ~M. This is the business-unlock step.

**Background wave 2** (fire after step 3 lands):
- Opus agent: Step 7 — admin suggested-talent chat card
- Sonnet agent: Step 10 — free-tenant CTA

**Foreground or Sonnet agent** (after step 4 lands):
- Step 4 — budget block
- Step 6 — plan-tier shaping
- Step 9 — hub routing (Opus agent, marathon)

## Why this ordering wins

1. **One engine convergence first** → every later step automatically applies to all 5 entry points. No "fix it in N places" tax.
2. **Hoist before wire** → `saved_talent` lands in the shared component, not the legacy dashboard form that gets thrown away next step.
3. **Category mode early** → the actual business unlock (admin-curated chat-driven lineup) ships before the polish.
4. **Pitch v2 parallel** → marathon work that doesn't touch the form runs alongside the form sprint.
5. **Hub routing last** → it's the biggest cross-tenant lift and depends on everything else being stable.

## Effort total

| Wave | Steps | Effort sum | Time-to-ship (parallel agents) |
|---|---|---|---|
| Critical foundation | 0 | M (4–6h) | 4–6h |
| Critical form sprint | 2, 1, 3, 4 | M+S+M+S = ~12–16h | 12–16h |
| Wave 1 parallel | 5, 8, 10, 11 | S+L+S+S = ~12–18h | ~L = 8–12h (gated by step 8) |
| Wave 2 parallel | 7 | M (4–6h) | 4–6h |
| Wave 3 parallel | 6, 9 | M+L = ~12–18h | ~L = 8–12h |

**Total wall-clock if agents run in parallel**: ~30–45 hours of agent compute, **~20–28 hours of sequential time** (because of the critical path).

## What I need from you

1. **Sign off on the reordering** (1↔2 swap).
2. **Confirm I can spend Opus tokens on steps 0, 3, 7, 8, 9** (these are the high-judgment ones) and **Sonnet tokens on the rest**.
3. **Permission to fire background agents** — wave 1 alone is 4 parallel agents post step-0.
4. After step 4 ships, we resume the QA marathon on add/remove talent + coord + message flow. (Documented in §10 of the audit.)

Once you sign off, I start step 0 in this turn.
