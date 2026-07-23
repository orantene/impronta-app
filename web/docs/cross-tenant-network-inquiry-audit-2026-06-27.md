# Cross-tenant Tulala network — inquiry, coordination & commission audit

**Date:** 2026-06-27
**Author:** automated architectural audit (5 parallel code-mapping lanes + live-DB verification against prod `pluhdapdnuiulvxmyspd`)
**Scope:** the end-to-end flow when a client contacts a talent on a free Tulala hub and that talent is exclusive to an agency. Audit + gap analysis + phased plan. **No code or schema was changed.**

> Sensitivity note: this touches the money + coordination spine. Nothing here was modified. `inquiry-permissions.ts`, the commission resolver, and RLS are untouched and must stay that way until the owner signs off on a plan.

---

## 0. The vision (restated, to audit against)

> A talent who is **exclusive** with an agency should get **all** their inquiries — from anywhere in the Tulala network — routed to the **agency that manages them**, with the originating **channel** attributed. Example: a client contacts "More" on tulala.digital; "More" is exclusive to improntamodels; the client is connected to improntamodels' coordinator, the lead is attributed to the tulala.digital channel, and improntamodels manages the inquiry, booking, and commission. The talent is encouraged to be everywhere because it all funnels home.

That sentence contains **four distinct claims** the system must satisfy. The audit verdict in one line for each:

| Claim | Verdict |
|---|---|
| The lead **routes to the managing agency** (resolution) | ✅ **CONFIRMED** — owning-party freeze is correct |
| The agency **sees and manages** the inquiry (delivery) | ❌ **MISSING** — it lands in the *hub's* inbox, not the agency's |
| The lead is **attributed to the originating channel** (tulala.digital) | 🟡 **PARTIAL/dead** — schema exists, never populated, never reported |
| The agency **owns the booking + commission**; talent funnels home | 🟡 **PARTIAL** — commission *math* is right; the booking *record* and the *charge* still sit on the hub; the hub earns nothing |

**Bottom line:** the hard, clever foundation (exclusivity invariant, per-row owning-party freeze, per-participant commission) is genuinely built and largely shipped. The **last mile — delivering the lead into the agency's working surfaces, capturing the channel, and homing the booking/charge** — is where it breaks. This is a "finish it," not a "rebuild it."

---

## 1. The two-tenant model you actually have (the key mental model)

Every cross-network inquiry has **two** tenant identities that the current code conflates in some places and separates in others:

1. **Host / channel tenant** — *where the lead came from.* For a hub lead this is **Tulala** (`40081ec3-5ca8-43a0-b50b-31c927b2716b`, `kind=hub`, `plan_tier=network`). Resolved from the request host by `getPublicHostContext` (`web/src/lib/saas/scope.ts:440-468`).
2. **Owning / managing tenant** — *the exclusive agency that manages the talent.* Resolved per talent row and **frozen** at submit.

The system **freezes the owning party correctly** but **files the records under the host tenant**, and then most working surfaces (inbox, RLS, Stripe destination) key off the *record's* tenant. So today: **the agency owns the talent's commission but does not own the inquiry/booking record.** That single seam is the source of three of the four gaps.

```
            CLIENT on tulala.digital
                    │
                    ▼
       inquiries.tenant_id = HUB (Tulala)          ← host/channel tenant  (record home)
                    │
       inquiry_participants[talent].owning_party    ← managing tenant (frozen, per row)
            = ('agency', improntamodels)            ← CORRECT
                    │
        ┌───────────┴────────────────────────────────────┐
        ▼                                                 ▼
  COMMISSION reads owning_party → agency economics   INBOX/RLS/CHARGE read record.tenant_id → HUB
  (correct: agency's plan + Connect payout)          (wrong: agency never sees it; charge routes to hub)
```

---

## 2. Current flow, mapped end-to-end (with evidence)

### 2.1 Owning-party resolution — ✅ CONFIRMED correct

`web/src/lib/inquiry/owning-party-resolver.ts` runs one query against `agency_talent_roster` joined to `agencies(plan_tier)`, filtered to `status IN ('active','pending')`, and resolves per talent (`resolveOwningPartiesForTalents`, lines 212-303):

- **Exclusive agency wins first, source-independent** (lines 270-277). `rowIsExclusive(is_primary, exclusivity_status, plan_tier)` requires `is_primary = TRUE` **and** plan_tier ∈ `{studio, agency, network, hub-network}` (`EXCLUSIVE_PLAN_TIERS`, line 64) **and** `exclusivity_status ∉ {declined, notice_period}`.
- Hub-sourced + non-exclusive → `('talent', talentId)` (self-coordinate), lines 282-285.
- Non-exclusive + known inquiry tenant → `('workspace', inquiryTenantId)`, else `('talent', …)`, lines 288-296.

Result is frozen onto `inquiry_participants.owning_party_type/_id` at insert (`inquiry-engine-submit.ts:533-538`). This is **immutable by design** — changing exclusivity after submit does not re-route an existing inquiry (resolver header lines 37-40).

**Live verification:** the Tulala hub auto-enroll row is inserted with `is_primary=false` (`supabase/migrations/20261020000000_auto_enroll_talent_into_platform_hub.sql:44-46`), so the hub never satisfies `rowIsExclusive` even though it is `plan_tier=network`. The exclusive agency row therefore wins. Locked by a test: `owning-party-resolver.test.ts:218-236` ("EXCLUSIVE talent via HUB still routes to the agency"). **Prod data:** 2 talents have an exclusive (primary) agency, both on non-hub tenants; the hub holds 120 active roster rows, all `is_primary=false`.

### 2.2 Coordinator assignment — ✅ mostly CONFIRMED, one promotion gap

`resolveInquiryCoordination()` (`coordinator-assignment.ts`) branches on whether the talent self-coordinates:

- **talent-direct** (owning party = talent): talent becomes coordinator of record; platform officer seated as a secondary `coordinator` participant; `source_type='hub'` (lines 133-142).
- **agency-owned** (owning party = agency/workspace): agency coordinates, no platform officer, `source_type='agency'` (lines 144-148).

For a hub-filed exclusive inquiry, the agency coordinator is seeded **after** the first pass by `seedOwningAgencyCoordinators()` (`inquiry-engine-submit.ts:572-578` → `coordinator-assignment.ts:169-220`): it finds owning agencies `!= inquiryTenantId`, resolves each agency's default coordinator, and inserts them as a `coordinator` participant.

**🟡 Gap:** that function promotes the agency coordinator to `inquiries.coordinator_id` **only when `coordinator_id` is still null** (`.is("coordinator_id", null)`, line 212). If the hub's first pass already set a coordinator (hub has a `default_coordinator_user_id` or owner), the **hub's coordinator stays coordinator-of-record** and the agency coordinator is a mere `invited` secondary — so the agency does not lead its own exclusive lead. The never-orphaned fallback chain itself is solid (agency `default_coordinator_user_id` → workspace owner → global `settings.default_coordinator_user_id`, lines 81-113).

### 2.3 Inbox delivery — ❌ MISSING (the crux gap)

The agency's two working surfaces both filter strictly on `inquiries.tenant_id`:

- **Messages inbox:** `loadInquiriesForMessages()` — `web/src/app/(workspace)/[tenantSlug]/_data-bridge/inquiries-messages.ts:255-267`, `.eq("tenant_id", tenantId)` is the only tenant gate. The `inquiry_participants` fetch at line 342 only enriches the lineup of inquiries already returned by the tenant-filtered list — it cannot add a hub-filed inquiry.
- **Work / triage pipeline:** `loadWorkspaceInquiries()` — `inquiries-workspace.ts:69-80`, `.eq("tenant_id", tenantId)` only.
- **RLS** matches: the canonical policy is `inquiries_tenant_staff = is_staff_of_tenant(tenant_id)`. There is **no** `inquiries`-table policy scoping by `owning_party_id`.

The D5 migration (`20260515180511_d5_cross_tenant_participant_rls.sql`) re-scoped **`inquiry_participants`** rows by `owning_party_id` (so an agency *could* read the participant row), and shipped helpers `is_cross_tenant_inquiry` / `owning_parties_for_inquiry`. But **no inbox/pipeline loader starts from `inquiry_participants`** — they all start from `inquiries` filtered by `tenant_id`. The helpers are consumed only for badge rendering on an inquiry the admin **already opened** (`cross-tenant-context.ts`). D5 closed the participant-row *leak* but never built cross-tenant *inbox visibility*.

**Net:** for a hub lead on an exclusive talent, `inquiries.tenant_id = HUB`, so **agency X is not `is_staff_of_tenant(HUB)` and never sees the lead in Messages or Work.** It sits in the hub's inbox.

**Live verification:** exactly **1** talent participant in prod has `owning_party_type='agency'` with `owning_party_id != inquiries.tenant_id` — inquiry `8e4f582a…`, filed under the seed hub `…0002`, owned by seed agency `…0001` (improntamodels), `status='submitted'`, **`coordinator_id` is NULL**, 0 bookings. It is seed/test data (the legacy `…0001/0002` tenants, not the real Tulala+improntamodels), but it is a faithful live instance of the gap: a cross-tenant exclusive lead, uncoordinated, parked on the wrong tenant.

### 2.4 Channel attribution — 🟡 PARTIAL (schema exists, wiring is dead)

The schema is **well designed for exactly this vision.** On `inquiries`:

| Column | Created | Purpose |
|---|---|---|
| `source_channel` (enum, 18 values) | `20260514153544_inquiry_source_channel_expand.sql` | surface: `hub_site`, `agency_site`, `public_talent_profile`, `discover_single_talent`, `discover_shortlist`, `directory_*`, `pitch`, … |
| `source_workspace_id` (→ `agencies`) | `20260901140000_inquiries_source_attribution.sql:18-22` | **purpose-built**: "the agency whose storefront (or the **hub**) the inquiry was submitted from… for a hub-originated submission it equals the hub agency tenant_id (which differs from `tenant_id`, the receiving agency)" |
| `origin_domain` (text) | `20260901140000` | exact hostname (`"tulala.digital"`) |
| `source_context` (jsonb), `source_page`, `source_pitch_id` | various | extra provenance |

The **intent is exactly right**: `source_workspace_id` was meant to name the originating hub *distinctly* from the managing tenant. Two analytics indexes were even created for it. **But it is never populated that way:**

- **Live verification:** of 48 inquiries, `source_workspace_id` differs from `tenant_id` in **0**; `origin_domain` is set in 12 (Discover only); `source_workspace_id` set in 9 (always == tenant_id).
- `getPublicHostContext` resolves a hub host to the hub's own `tenant_id` (`scope.ts:453-459`) and produces no separate "receiving agency" id; the guest/intent paths never set `source_workspace_id`, so it lands null (or is defaulted to `tenant_id`).
- **Attribution dies at the inquiry row.** The conversion RPC `engine_convert_to_booking` copies only `source_inquiry_id` + `source_type_snapshot` onto `agency_bookings` (`20260533000000_…sql:224-232`); `booking_commission_snapshot` carries **zero** channel columns; the billing aggregation layer (`lib/billing/platform-revenue.ts`, `snapshot-aggregations.ts`) never groups by channel. `source_workspace_id` and `origin_domain` have **no read sites** outside their own writes — write-only dead columns today.
- The `/admin/discover-performance` page counts *inquiries* by `discover_*` channel but never joins bookings/commission — so there is no revenue-by-channel anywhere.

### 2.5 Commission + booking — 🟡 PARTIAL (math correct & live; record home + charge wrong; repo drift landmine)

**This section corrects a severe but inaccurate claim from the commission lane of the audit.** The claim was that a later migration silently reverted the per-participant commission RPC to a single-tenant shape, making cross-tenant booking conversion fatally roll back. **Live DB refutes the "currently broken" framing** — but uncovers a real drift landmine instead.

What is **true and verified live**:

- **The resolver is correct.** `resolveBookingCommissions` (`commission.ts:212`) is pure; `owning_party_type='agency'` ⇒ `sellerOfRecord='workspace'`, so the agency bears the platform fee and owns the workspace lane.
- **The live RPC is per-participant.** Prod `engine_load_commission_context(uuid)` reads `inquiry_participants` and `owning_party` (verified via `pg_get_functiondef`: body contains `participants`, `jsonb_agg`, `inquiry_participants`, `owning_party`; 6245 chars). So cross-tenant commission math uses the **owning agency's** plan_tier + override, **not** the hub's.
- **It works in prod.** 7 `booking_commission_snapshot` rows across 6 `agency_bookings` exist — impossible if conversion fatally rolled back (the snapshot persist **is** fatal: `inquiry-engine-booking.ts:296-379` deletes the booking and restores the inquiry on `!ok`).
- **Payout fan-out honors the agency.** `transfers.ts:194-196,319` routes the workspace leg to `resolveWorkspaceAccount(snap.owning_party_id)` = agency X's Connect account; talent leg paid in full.
- **Wired path:** the admin "Convert to booking" button → `convertInquiryToBookingAction` (`_pipeline-actions.ts:96-147`) → `convertToBooking` (engine). The function the commission lane cited as "sidesteps the engine," `admin-bookings.ts:91 convertInquiryToBooking(formData)`, has **zero importers** — it is dead code.

What is **genuinely wrong / risky**:

- **🟡 Booking record homes on the hub.** `engine_convert_to_booking` creates the `agency_bookings` row with `tenant_id = inquiries.tenant_id` (the hub). So even with correct commission math, the **booking record lives under the hub tenant** → same inbox-visibility problem as §2.3, now for bookings.
- **🟡 Initial charge routes through the hub.** The checkout Direct Charge destination + `application_fee_amount` resolve from the **booking's** tenant Connect account (`client-pipeline.ts:245-253`, `getConnectedAccountSnapshotById(ctx.tenantId)`). For a hub-homed booking that is the **hub's** Connect account, not agency X's. Open risk: a free hub may not even have an onboarded Connect account, which would block the charge. Post-payment transfers then correctly fan out to agency X — but the *capture* sat on the hub.
- **❌ Repo↔prod migration drift (latent landmine).** The **last committed migration** that defines the RPC is `20260926000000_fix_commission_context_rpc_columns.sql`, whose body is **single-tenant** (returns `tenant_id/workspace_plan/platform_config/tenant_override/offer_line_items`, **no `participants`**) — its own header says it is "byte-identical to 20260513075408" with only column-name fixes. The live per-participant body was applied **out of band (manual MCP), unversioned**. A `supabase db reset` / rebuild-from-migrations would install the single-tenant RPC, and because the engine expects `ctx.participants` (`commission-engine.ts:140`) and the snapshot persist is fatal, **every booking conversion would then roll back** (not just cross-tenant). This is exactly the inverse of the CLAUDE.md "schema + code shipping protocol" failure mode — here the live DB is *ahead* of the committed migrations. **Fix:** re-commit the live per-participant body as a new migration timestamped `> 20260926000000`.

### 2.6 Exclusivity invariant — ✅ CONFIRMED (strongest pillar)

- **No `agency_talent_relationships` table exists** (the spec name is aspirational). Exclusivity is folded into **`agency_talent_roster`**: `is_primary` (`20260601100500_…roster.sql:32`) + plan_tier + `exclusivity_status` enum `{confirmed, auto_assigned, declined, notice_period}` (`20260515195642_…sql:44-49`).
- **"One exclusive agency per talent" is DB-enforced.** Partial unique index, **verified live**: `agency_talent_roster_talent_primary_uniq ON (talent_profile_id) WHERE is_primary=true AND status IN ('pending','active')`. Two agencies cannot both be primary.
- **Auto-exclusive on admin add is wired** (`exclusivity-resolver.ts:59-125`) at every roster-add entry (`admin-talent.ts:750`, `roster-import.ts:294`, `roster/registration/actions.ts:289`).
- **Exclusive overrides hub** for both routing (§2.1) and commission (§2.5, frozen `owning_party`).
- **Minor gaps:** the "already exclusive elsewhere" pre-check is a non-atomic app read (`exclusivity-resolver.ts:85-113`); a true race is caught by the DB index but the losing admin gets a generic error rather than a clean "already exclusive" message. `exclusivity_status='notice_period'` has **no producer** (decline is wired; talent-initiated notice is not).

---

## 3. Gap list vs the vision

| # | Capability | Status | Evidence | Severity |
|---|---|---|---|---|
| G1 | Exclusive agency wins ownership over hub | ✅ CONFIRMED | `owning-party-resolver.ts:270-277`; partial unique index; test :218-236 | — |
| G2 | One-exclusive-per-talent enforced | ✅ CONFIRMED (DB index, live) | `agency_talent_roster_talent_primary_uniq` | — |
| G3 | Commission math uses the agency's economics cross-tenant | ✅ CONFIRMED (live RPC per-participant) | `pg_get_functiondef`; 7 snapshots/6 bookings | — |
| G4 | Payout workspace-leg routes to the agency's Connect account | ✅ CONFIRMED | `transfers.ts:194-196,319` | — |
| G5 | Client is global identity, contactable cross-tenant | ✅ CONFIRMED | `client_profiles` global + `agency_client_relationships` overlay; `.tulala.digital` SSO cookie | — |
| G6 | Cross-tenant Discover surface (grid/filters/map/shortlists/fan-out) | ✅ CONFIRMED shipped | `client/discover/*`, `_data-bridge/discover.ts`, `talent_discover_index` matview, `/api/discover/inquiry` | — |
| **G7** | **Agency sees a hub-filed exclusive inquiry in its inbox** | ❌ **MISSING** | `inquiries-messages.ts:255-267` + `inquiries-workspace.ts:69-80` filter `tenant_id` only; no owning_party RLS | **P0** for the headline scenario |
| **G8** | **Booking record + checkout charge home on the managing agency** | 🟡 **PARTIAL** | booking `tenant_id = inquiry.tenant_id` (hub); `client-pipeline.ts:245` charges hub Connect | **P1** |
| **G9** | **Originating channel (tulala.digital) captured distinctly + reported** | 🟡 **PARTIAL/dead** | `source_workspace_id` differs from `tenant_id` in 0/48; no booking/commission channel columns; no channel revenue report | **P1** |
| G10 | Agency coordinator leads its own exclusive lead (not just secondary) | 🟡 PARTIAL | `seedOwningAgencyCoordinators` promotes only if `coordinator_id` null (`:212`) | P2 |
| **G11** | **Hub earns from leads it funnels to agencies (referral/channel lane)** | ❌ **MISSING** | commission model has 3 lanes (platform/workspace/talent); **no channel/referral lane** | product decision |
| G12 | Premium client tier is a real gate | ❌ MISSING (vaporware) | Pro multi-talent send blocked only by client `alert()` (`ShortlistsShell.tsx:270`); `/api/discover/inquiry` has no tier check; no Stripe client checkout | P1 (monetization) |
| G13 | Trust-access gate ("no trust → no inquire") | ❌ MISSING | Discover passes `trust_level_at_submission:null` → evaluated as basic; no verification-required-to-contact gate | P2 |
| G14 | Independent (no-roster) talent inquiry fan-out | 🟡 PARTIAL (skipped) | `/api/discover/inquiry/route.ts:130-131` `reason:"no_roster"` | P2 |
| G15 | Commission RPC reproducible from committed migrations | ❌ MISSING (drift) | live per-participant body is unversioned; last migration `20260926000000` is single-tenant | P2 hygiene/landmine |
| G16 | Talent-initiated exclusivity notice period | 🟡 PARTIAL (cosmetic) | `notice_period` status has no producer | P3 |

---

## 4. Phased plan to close the gaps

Ordered to match the requested sequence (channel attribution → routing → commission → client access tier), but resequenced where a dependency demands it. Each phase is independently shippable.

### Phase A — Channel attribution (capture the truth first) — closes G9
*Why first: every later phase wants to know "hub vs storefront vs agency-site," and you cannot route or report on data you never captured.*

1. In `getPublicHostContext`/the intent adapter, when the host is a hub, set `source_workspace_id = <hub tenant_id>` and `origin_domain = <host>` on the inquiry, **distinct** from the resolved `tenant_id`. (`scope.ts:440-468`, intent adapter `inquiry-intent.ts`.)
2. Backfill-on-write everywhere else: storefront submissions set `source_workspace_id = <that storefront's tenant>`; Discover already sets `origin_domain` — extend it to set `source_workspace_id` too.
3. Carry `source_channel` + `source_workspace_id` + `origin_domain` onto `agency_bookings` in `engine_convert_to_booking` (or always join via `source_inquiry_id`).
4. Add a channel dimension to the billing aggregations so revenue/commission can be sliced by originating channel.
*Migration:* 1 (booking columns) + RPC edit. No behavioral risk; purely additive capture.

### Phase B — Routing / delivery (make the agency actually see it) — closes G7, G10
*The headline scenario does not work until this ships. Two viable architectures — this is the central decision (see §5, D1).*

- **Option B1 — Re-home at submit (recommended).** When a single owning agency is resolvable for all talents on the inquiry, set `inquiries.tenant_id = <owning agency>` at submit, and rely on Phase A's `source_workspace_id`/`origin_domain` to remember the hub. Pros: inbox, RLS, booking home, and checkout destination all "just work" because everything keys off `tenant_id = agency`. Cons: mixed-ownership inquiries (a lineup spanning two agencies) still need an overlay; the hub loses the row from its own inbox unless given a channel view.
- **Option B2 — Owning-party overlay.** Keep the row on the hub; teach the inbox/pipeline loaders **and** add an `inquiries`-table RLS policy to union in inquiries where the tenant owns a talent participant (`owning_party_id = tenantId`). Pros: supports mixed-ownership lineups natively; preserves a hub channel view for free. Cons: touches RLS on the money/coordination spine (high blast radius), and every list/count/badge surface must learn the overlay.
- Either option: fix G10 by making `seedOwningAgencyCoordinators` promote the agency coordinator to `coordinator_id` for an exclusive single-owner inquiry even if the hub pre-seeded one.

### Phase C — Commission / booking home + drift fix — closes G8, G15
1. **Immediately (P2, no design needed): close the drift.** Re-commit the live per-participant `engine_load_commission_context` as a new migration `> 20260926000000` so a rebuild reproduces prod. Realign `commission-pipeline.integration.test.ts:400-420` to the `participants` shape.
2. Make the booking record home on the managing agency (free if Phase B picks B1; an explicit `owning_tenant_id` on `agency_bookings` if B2).
3. Resolve the checkout Connect destination from the **owning agency** for a cross-tenant booking, not the booking's host tenant (`client-pipeline.ts:245`). Verify the hub has no Connect account and must never be a charge destination.

### Phase D — Client access tier (turn Discover into real monetization) — closes G12, G13, G14
1. **Server-enforce the Pro gate.** Move the multi-talent / compare gate out of the client `alert()` and into `/api/discover/inquiry` (`canUsePro` check). Today a free client bypasses it with a direct POST.
2. Wire Stripe client-subscription checkout + webhook to populate `client_subscriptions` (today it is a `mailto:` and a table nothing writes).
3. Decide + implement the trust-access gate (G13) and the no-roster talent path (G14).

### Phase E (optional, product-gated) — Hub referral economics — closes G11
Only if the business model is "free hubs monetize by funneling leads." Add a 4th commission lane (channel/referral) so the originating hub can take a configurable cut of a booking it sourced. **This does not exist in any form today** and is a genuine model extension, not a wiring fix.

---

## 5. Open product decisions for the owner

**D1 — Record home for a cross-tenant lead (the architectural fork).** When a hub lead resolves to a single exclusive agency, should the inquiry/booking **record** (a) re-home to the agency tenant at submit (Option B1 — simplest, everything keys off one tenant), or (b) stay on the hub with an owning-party overlay the agency unions in (Option B2 — supports mixed-ownership lineups, but edits RLS on the spine)? *Recommendation: B1 for single-owner inquiries; reserve the overlay only for genuinely multi-agency lineups.*

**D2 — Does the hub earn from leads it funnels? (G11 — the biggest money question.)** The current model gives the hub **0**: economics are platform (5%) / agency margin / talent net, with no channel/referral lane. If "free hubs that monetize by sending leads to agencies" is the business, the commission model needs a new lane. *Decision needed: flat hub referral %, fixed per-booking, or none (hub is purely a growth/SEO funnel).* Everything in Phase E hinges on this.

**D3 — Exact commission split on a hub-originated exclusive-talent booking.** Given D2, confirm the split. Today (live): platform 5% + agency's offer margin + talent net (paid in full); hub 0. Is that the intended split, or does the hub take a slice off the top / out of the platform fee / out of the agency margin?

**D4 — Is cross-tenant client contact a paid Discover feature?** Browsing + single-talent contact across the network already works for free (G5/G6). The only intended paid lever (multi-talent fan-out, compare) is currently unenforced (G12). Confirm: is multi-talent/compare the Pro gate, and at what price? (Spec placeholders: $0 / $49 / Enterprise.) Until enforced server-side, Discover is not monetizable.

**D5 — Must a client be verified ("trusted") to contact a talent? (G13.)** Spec says yes ("no trust → can shortlist but cannot inquire"); code says no (anyone can contact unless the talent's `contact_policy` blocks their tier, and Discover treats every client as basic). Confirm the intended access rule.

**D6 — Coordinator of record on an exclusive lead.** Should the agency's coordinator always lead an exclusive inquiry (overriding any hub pre-seed), with the platform officer demoted to secondary? (Currently the hub can retain coordinator-of-record — G10.)

---

## 6. Readiness score (blunt, not inflated)

Scored against the **full** cross-tenant network vision, per pillar. Per-pillar scores are not averaged into the overall by simple mean — the headline scenario ("agency manages a hub lead") is gated by its weakest link (inbox delivery), so the overall is dragged down deliberately.

| Pillar | Score | One-line justification |
|---|---|---|
| Exclusivity invariant (G1, G2) | **9 / 10** | DB-enforced, correctly overrides hub, wired, tested. Genuinely done. |
| Owning-party resolution + commission math (G3, G4) | **8 / 10** | Per-row freeze + per-participant commission + agency-routed payout all live. Loses points for the unversioned RPC drift. |
| Client access / cross-tenant contact (G5, G6) | **7 / 10** | Browse + contact across the network works end-to-end and is shipped. Premium tier is vaporware. |
| **Lead delivery to the agency (G7, G8, G10)** | **3 / 10** | The single most important headline claim — "the agency manages the inquiry" — **does not work**: the lead never reaches the agency's inbox; the booking + charge home on the hub. |
| **Channel attribution (G9, G11)** | **2 / 10** | Schema is perfect, wiring is dead; `source_workspace_id` never distinct in 48 inquiries; hub earns nothing and has no lane to. |
| Client monetization (G12, G13) | **2 / 10** | Tables + UI exist; the paywall is a client-side `alert()`; no Stripe checkout. |

**Overall readiness for the cross-tenant network vision: 6 / 10.**

The honest read: this is **not** an early-stage prototype. The conceptually hard, easy-to-get-wrong parts — the exclusivity invariant, the per-row owning-party freeze, the per-participant commission and payout — are **built, shipped, and verified live.** What's missing is the **last mile that makes the vision visible and monetizable**: deliver the lead into the agency's working surfaces, capture the channel it came from, home the booking/charge on the right tenant, and turn on the paywall. Those are concrete, well-scoped, and mostly additive. The one true correctness bug for the headline scenario is **G7 (inbox delivery)** — until it ships, "the agency manages the inquiry" is false at the delivery step, which is why the overall cannot score above a 6 despite a strong foundation. It is barely exercised today (effectively 0 real cross-tenant inquiries; 2 exclusive talents, 1 seed-data instance), so it is **latent, not on fire** — the right moment to fix it is before the network actually fills up, not after.

---

## 7. Corrections to prior assumptions (for the record)

- **`agency_talent_relationships` does not exist.** Exclusivity lives on `agency_talent_roster` (`is_primary` + plan_tier + `exclusivity_status`).
- **The commission RPC is NOT currently broken in prod.** The live `engine_load_commission_context` is per-participant and works (7 snapshots prove it). The real issue is **unversioned repo↔prod drift** (G15), a rebuild landmine — not a live outage.
- **`admin-bookings.ts:91 convertInquiryToBooking(formData)` is dead code** (zero importers). The live convert path is `convertInquiryToBookingAction` → `convertToBooking` (engine), and the commission snapshot persist is fatal.
- **The cross-tenant exclusive path is real but barely exercised:** 2 of 120 hub-rostered talents are exclusive elsewhere; 1 cross-tenant inquiry exists, and it is seed/test data. Fix the seam now, while it is cheap.

---

*Verification basis: 5 parallel code-mapping lanes (routing, attribution, commission, client/Discover, exclusivity), cross-checked on every decisive point against the live prod database `pluhdapdnuiulvxmyspd` (function bodies via `pg_get_functiondef`, `schema_migrations`, index definitions, owning-party + attribution row counts). All file:line citations reflect current `main`-tracking code as of 2026-06-27.*
