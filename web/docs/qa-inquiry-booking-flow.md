# QA Playbook — Inquiry → Booking Flow (Tulala / Impronta)

**Goal:** verify the full loop — *client inquires → coordinator (agency or talent) picks/confirms talent → all parties message → priced offer → approve/counter/reject → booking → (payment → payout)* — across **all three roles** (client, talent, agency admin) and **every relationship shape** (client↔agency, client↔independent talent, client↔agency-rostered talent), plus offer variations and mid-flow disruptions (location change, talent drop-out, coordinator change, cancel, refund).

Read §0 once. Then run each Scenario in §2 end-to-end using the Stage checklist in §1, applying the Offer variations (§3) and Disruptions (§4) where indicated. Record results in the §7 template.

---

## 0. Setup — do this once

### 0.1 Where to test
| Surface | URL | Used by |
|---|---|---|
| App (client / talent / agency) | `https://app.tulala.digital` | all roles sign in here |
| Open hub + public talent pages | `https://tulala.digital`, `tulala.digital/t/<profileCode>` | client discovers/inquires about a talent |
| Agency custom domain (if testing one) | e.g. `improntamodels.com` | client inquires "on the agency's own site" |
| Platform admin (commission config) | `app.tulala.digital/platform/admin/billing/commission` | super-admin only |
| Local (fast loop) | `http://localhost:3000` + `/api/dev/signin` | dev QA |

> **Money is TEST mode.** Payments use Stripe **test** cards (`4242 4242 4242 4242`, any future expiry/CVC). No real money moves. Real money is gated by a separate Stripe/legal decision — out of scope for this QA.

### 0.2 The cast (accounts)
| Role in tests | Login | Notes |
|---|---|---|
| **Agency admin** | `qa-admin@impronta.test` / `Impronta-QA-Admin-2026!` | runs the Impronta agency (exclusive-tier "agency" plan) |
| **Client 1** | `qa-client-1@impronta.test` / `Impronta-QA-Client-2026!` | primary buyer |
| **Client 2** | `qa-client-2@impronta.test` / `Impronta-QA-Client-2026!` | second buyer (multi-client tests) |
| **Talent — exclusive on Impronta** | `tulum-talent-sofia@impronta.test` / `TulumQA2026x` | "Sofía Herrera", primary on Impronta (agency plan) → **exclusive** |
| **Talent — hybrid (talent + own workspace)** | `more@impronta.test` / `Impronta-QA-More-2026!` | "More/Morena", active on Impronta roster |
| **Talent — independent (NO agency)** | `tulala.opus.qa.2026@mailinator.com` / `Impronta-QA-Opus-2026!` | "Opus Tester", no roster row → **self-coordinates** |
| **2nd Free-plan agency owner** | `owner@novacrew.demo` / `Nova-QA-Owner-2026!` | "Nova Crew" — a **Free**-plan agency (non-exclusive roster) |

> Always **verify the talent's roster state before a scenario** (see §0.5) — "exclusive" vs "non-exclusive" is what drives the routing, and test data drifts. A talent **primary** on an **agency/studio/network** plan = exclusive; a talent on a **free** plan, or **not primary**, = non-exclusive; a talent with **no active roster** = independent.

### 0.3 Sign in as 3 roles at once
Use **3 separate browser profiles** (or one normal + two incognito) so client / talent / admin sessions don't clobber each other. Rapid multi-role sign-in **in the same profile races the session** — wait ~10s after signing in before acting, and don't trust the rendered name as proof of who you're authenticated as (talent pages render via service-role and can show a talent's data even when you're logged in as someone else).

### 0.4 What to watch at every step (4 lenses)
For each stage, check **all four**:
1. **UI per role** — what the client / talent / admin each see (and *don't* see).
2. **Money** — the exact figure each role is shown (see §5; clients see **gross only**, talent see **their take-home only**, admin sees the full split).
3. **Notifications** — the in-app **bell** for each affected user (email is dormant until `RESEND_API_KEY` is set — confirm the bell, not the email).
4. **Database** — the source of truth (see §0.6). When UI and DB disagree, that's a bug.

### 0.5 / 0.6 Database checks (source of truth)
Use the Supabase SQL console (prod project `pluhdapdnuiulvxmyspd`). Key tables, in flow order:

| Table | What it tells you |
|---|---|
| `inquiries` | status, `tenant_id` (which inbox it lives in), `coordinator_id`, `current_offer_id`, `source_channel` |
| `inquiry_participants` | who's on it + their `role` (client / talent / coordinator), `status` (invited/active/removed), `owning_party_type` (talent/workspace/agency = **the routing decision**) |
| `agency_talent_roster` | a talent's agency relationships: `tenant_id`, `is_primary`, `exclusivity_status`, the agency's `plan_tier` |
| `inquiry_offers` + `inquiry_offer_line_items` | the offer: `total_client_price`, per-talent line items (`talent_profile_id`, `total_price`) |
| `inquiry_approvals` | who has approved the current offer (keyed on participant + `current_offer_id`) |
| `agency_bookings` | exists **only after convert**: `payment_status`, `client_revenue_lifecycle`, `total_client_revenue` (gross) |
| `booking_commission_snapshot` | the frozen split per talent: gross / platform_fee / workspace_fee / talent_net |
| `booking_transactions` | the real charge: `status`, `gross_amount_cents`, `currency`, `paid_at` |
| `booking_payouts` | per-talent payout legs: `status` (held/transferred/reversed), `stripe_transfer_id` |
| `user_notifications` | the in-app bells (kind/surface/title/body) |

Handy roster check before a scenario:
```sql
select r.tenant_id, a.slug, a.plan_tier, r.is_primary, r.exclusivity_status, r.status
from agency_talent_roster r join agencies a on a.id = r.tenant_id
where r.talent_profile_id = '<TALENT_PROFILE_ID>';
```
- rows on `plan_tier in (studio,agency,network,hub-network)` + `is_primary=true` + `exclusivity_status not in (declined,notice_period)` → **exclusive**.
- only `free`-plan / non-primary rows → **non-exclusive**.
- no active rows → **independent**.

---

## 1. The canonical flow — stage checklist (the spine of every scenario)

Run these 7 stages for each scenario in §2. The **expected coordinator and commission differ per scenario** (§2 says which) — everything else is the same spine.

### Stage 1 — Client creates the inquiry
- **Do (client):** start an inquiry (entry point depends on scenario — agency site, talent's public page, Discover, or agency-created). Fill event date, location, brief; pick talent or "let the agency recommend".
- **Check UI:** client lands on a thread / confirmation; sees their own inquiry in their inbox.
- **Check DB:** new `inquiries` row (status `submitted`); `inquiry_participants` has a `client` row + a `talent` row per requested talent with the right `owning_party_type` (**this is the routing decision — verify it matches the scenario**); `source_channel` reflects the entry point.
- **Check notif:** agency admin gets a "new inquiry" bell; requested talent get a "you've been invited" bell.

### Stage 2 — Coordinate / confirm the lineup
- **Do (coordinator — agency admin OR self-coordinating talent):** open the inquiry; if "agency recommends", add talent to the lineup; nudge invited talent; talent **accept the invitation**.
- **Check UI:** lineup shows each talent **with a face + name + discipline** (not initials-in-a-box). Coordinator can see the client (private) thread; plain talent see only the group thread.
- **Check DB:** `inquiry_participants` talent rows flip `invited → active` as they accept; the `coordinator` participant is the **expected** party (agency owner, or the talent themselves for self-coordinate).
- **Check money:** none yet.

### Stage 3 — Build + send the offer
- **Do (coordinator):** open the offer builder; add a **priced line item per talent**; the **Total is auto-summed and read-only** (you cannot hand-type a number that differs from the line items); send to client.
- **Check UI:** client receives an Offer card; talent see an amount-free "offer is out" card in their group thread; the talent's own **take-home** ("Your take-home: $X") shows on their Offer tab.
- **Check money:** **Total shown to client == sum of line items.** Admin sees the full split (gross / platform fee / each talent's net). Each talent sees **only their own** net — never the client's total or the agency margin.
- **Check DB:** `inquiry_offers` (status `sent`), `inquiry_offer_line_items` per talent, `inquiries.current_offer_id` set, inquiry status `offer_pending`. `inquiry_approvals` seeded `pending` for client + each offered talent.
- **Negative:** sending a **blank / $0 / no-priced-line** offer must be **rejected**.

### Stage 4 — Approval (the multi-party gate)
- **Do (client):** Approve / Counter / Reject (see §3 for the variants).
- **Do (each talent):** "Approve offer" / Decline on their Offer tab.
- **Check UI:** once a party approves, their CTA stops re-showing — they should **not** be asked to approve twice; they see "You approved — awaiting the other parties." Each approval emits a group-thread card ("<Name> approved").
- **Check DB:** `inquiry_approvals` rows flip to `accepted`. Inquiry flips to **`approved`** only when **client + every offered talent** have accepted.
- **Status alignment (important):** at `approved`, **all three roles must say "Approved", not "Booked"** — there is **no `agency_bookings` row yet**. Verify the admin **inbox** shows an indigo "Approved" pill (not green "Booked"), the admin thread says "Approved by all parties — ready to book", and the client/talent show "Approved".

### Stage 5 — Convert to Booking
- **Do (agency admin):** **"Move to → Booked"**.
- **Check UI:** now all three roles show **Booked**.
- **Check DB:** **`agency_bookings`** row created (`source_inquiry_id` = the inquiry); **`booking_commission_snapshot`** has one lane per talent with gross / platform_fee / workspace_fee / talent_net that **sum to the offer total**. `inquiries.status = converted/booked`.
- **Check money:** commission matches the scenario (see §2 / §5): hub or independent → **6% platform only**; agency → **3% client surcharge + 3% from agency margin (talent protected)**.

### Stage 6 — Payment (test rail)
- **Do (admin):** request payment (the receiver auto-defaults to the booking's talent). **Do (client):** Pay now → enter test card `4242…`.
- **Check DB:** `booking_transactions` → `paid`, `gross_amount_cents` == the gross the client was shown, `currency` == USD. `agency_bookings.payment_status = paid`, `client_revenue_lifecycle = fully_paid`.
- **Check UI:** client sees "Paid / Confirmed" (**gross only**); admin sees paid; talent sees the booking confirmed.
- **Check notif:** payment bells.

### Stage 7 — Payout (test rail)
- **Do:** trigger payout (webhook/markPaid fans out). The talent must have a connected payout account; if not, the leg shows **held** (expected) until they connect.
- **Check DB:** `booking_payouts` talent leg → `transferred` with a `stripe_transfer_id` (or `held` if no account); workspace leg `held` if the agency has no connected account (correct). `payout_lifecycle` flips to `paid` once talent legs settle.
- **Check money:** the transfer amount == the talent's **net** from the snapshot.

---

## 2. Relationship / source scenarios (run the full spine for each)

> The differences to verify per scenario are **(a) who the coordinator is**, **(b) `owning_party_type` on the talent participant row**, and **(c) the commission split**. Everything else follows §1.

### Scenario A — Client → **Agency**, agency picks the talent
- **Setup:** client starts an inquiry to **Impronta** (on the agency's surface) in **"let the agency recommend"** mode (no specific talent), or naming a need.
- **Stage 2:** **agency admin shortlists + adds** the talent(s) to the lineup.
- **Expected:** coordinator = **agency** (Impronta owner/default coordinator). `owning_party_type = agency` (Sofía is exclusive) or `workspace`. Commission = **agency split** (3% client + 3% from agency margin; talent protected).
- **Watch:** the client should pick from a **shortlist with faces + info**, not a blank list.

### Scenario B — Client → **independent talent** (NOT in any agency)
- **Setup:** client opens the **independent talent's public page** on the hub (`tulala.digital/t/<Opus's code>`) and inquires. (Opus Tester = no roster.)
- **Expected:** the **talent self-coordinates** — `owning_party_type = talent`, a `coordinator` participant row is auto-created **for the talent**, and the talent can **DM the client on the private thread**. Inquiry lands in the **hub** inbox; **no agency** in the loop. Commission = **6% platform only**.
- **Watch:** sign in as Opus → they should see the inquiry as **theirs to run** (client sub-thread unlocked) and be able to message the client directly; sign in as the client → they should see Opus's messages.

### Scenario C — Client → **agency-rostered, EXCLUSIVE** talent
- **Setup:** client inquires about **Sofía** (primary on Impronta, agency plan = exclusive) — from **anywhere** (the agency site, the hub, or Discover).
- **Expected (key test of "exclusivity overrides source"):** coordinator = **the agency** regardless of where the inquiry came from. `owning_party_type = agency`. Commission = **agency split**. The talent does **not** self-coordinate even if the inquiry came via the hub.

### Scenario D — Client → **agency-rostered, NON-exclusive** talent, via the **agency's own site**
- **Setup first:** put a test talent on a **Free**-plan agency (e.g. add Opus to **Nova Crew** or the **QA Agency** roster, non-primary) so they're non-exclusive. Then the client inquires **on that agency's surface**.
- **Expected:** coordinator = **that workspace/agency**. `owning_party_type = workspace`. Commission = the workspace's configured split.

### Scenario E — Client → **agency-rostered, NON-exclusive** talent, via the **OPEN HUB**
- **Setup:** same non-exclusive talent as D, but the client inquires via the **hub** (`tulala.digital/t/<code>`), **not** the agency's site.
- **Expected (the new source-aware behavior):** the **talent self-coordinates** — `owning_party_type = talent`, talent-coordinator created, commission = **6% platform only**. This is the case that used to wrongly route to the agency.
- **Contrast D vs E directly:** same talent, two entry points, **two different outcomes** — that's the headline thing to confirm.

### Scenario F — **Multi-talent** inquiry (any of A–E with ≥2 talent)
- **Setup:** client requests / agency builds a lineup of **2–3 talent**.
- **Expected:** **every** offered talent must approve before the inquiry flips to `approved`; convert needs the **full** set; the booking has **one commission-snapshot lane per talent**; payout fans out per talent (each leg independent — one can settle while another is held).
- **Watch:** the "client suggests which coordinator" UI is **not built yet** — note it as N/A.

---

## 3. Offer variations (apply at Stage 3–4 of any scenario)

| Variation | Do | Expect |
|---|---|---|
| **Pre-budget → offer** | client states a budget at inquiry; coordinator builds the offer | the offer total is the coordinator's priced number (line items), independent of the stated budget; compare the two in the UI |
| **Approve (happy path)** | client Approve + talent Approve | inquiry → approved → bookable |
| **Counter** | client taps **Counter**, sends a note/number | offer state does **not** silently change; the coordinator gets the counter and **re-drafts** a new offer (version bump); old CTAs don't linger |
| **Reject** | client **Reject** (with reason) | inquiry moves out of offer_pending; coordinator can re-coordinate / re-offer or close |
| **Revise + resend** | coordinator edits a line item and re-sends | client sees the **new** total; approvals reset for the new offer; talent take-home updates |
| **Per-talent rate** | multi-talent offer, different rate each | each talent sees **only their** line/take-home; admin sees all; client sees the **sum** |
| **Invalid offer** | try to send blank / $0 / no priced line | **blocked** with a clear message |

---

## 4. Mid-flow disruptions (the "real life" cases)

Run these on an in-flight inquiry and verify state stays coherent across all 3 roles + the DB.

| Disruption | Do | Check |
|---|---|---|
| **Edit location / date** after offer sent | coordinator edits the event location or date | the change shows for **all** parties (client + talent + admin); an audit/chat entry is emitted; if it materially changes the deal, the offer/approval should reflect it (re-confirm). Note any party that does **not** see the change = bug. |
| **One talent declines** (before approval) | a talent taps Decline | inquiry should **not** convert with a missing talent; multi-talent gate stays open; coordinator can swap in another talent or re-scope. |
| **One talent cancels** (after approval, before booking) | talent withdraws | convert must be **blocked** / the lineup re-opened; verify the client isn't shown "Booked" prematurely. |
| **Add a talent mid-flow** | coordinator adds a talent after the offer | the new talent is invited + (if priced) added to the offered/approval set; convert now needs them too. |
| **Remove a talent mid-flow** | coordinator removes a talent | their participant row → `removed`; they drop out of the approval gate + lineup; commission recomputes at convert. |
| **Change coordinator** | agency adds/removes a coordinator on the chat; or a talent-self-coordinated job gets the hub admin added | the added coordinator gains the **client (private) thread**; the removed one loses it; verify thread access flips in the UI + RLS (the removed party can't post). |
| **Client cancels the whole inquiry** | client cancels | inquiry → cancelled; talent + admin see it closed; no booking; no charge. |
| **Refund / dispute** (after payment, test) | issue a Stripe **test** refund or dispute-lost on the charge | `booking_payouts` legs reverse; `agency_bookings` → refunded; **talent + client get a "payout reversed / refund" bell** (email dormant); a **partial** refund must **not** claw the talent's protected quote (only platform fee + agency margin) and the **client** is notified of the partial. |
| **Re-approval suppression** | after approving, refresh / revisit | neither client nor talent is asked to approve **again**; the CTA is replaced by "you approved — awaiting others". |

---

## 5. Per-role "money & visibility" rules (assert on every scenario)

- **Client** must see **GROSS only** (what they pay). **Never** the agency margin, the platform fee, or any talent's individual cut. The number they're **shown** == **charged** == **booked**.
- **Talent** must see **only their own take-home** (their line-item net). **Never** the client's total or the agency margin. On the offer, at booking, and at payout — the same number.
- **Agency admin** sees the **full split**: gross, platform fee, each talent net, agency/workspace margin — the real commission snapshot, **not** a flat % placeholder.
- **Commission expectation:** hub/independent → **6% platform** (3% client surcharge + 3% talent seller). Agency → **3% client surcharge + 3% from the agency's margin** (talent protected). Configurable at `/platform/admin/billing/commission` — confirm the live value before asserting exact numbers.
- **Currency** is **USD** everywhere (offer, booking, payment, payout, dashboards) — no stray € / MXN.
- **Identity/confidence:** anywhere a talent appears (lineup, thread header, client's inquiry, booking) there must be a **real face + name + discipline**, and the thread must make clear **what was ordered** and **who you're talking to**.

---

## 6. Cross-cutting acceptance checks (per scenario, quick pass)

- [ ] Status is **aligned across all 3 roles** at every stage (esp. **Approved ≠ Booked** before convert).
- [ ] Every stage fires the right **in-app bell** to the right users.
- [ ] No role sees a number it shouldn't (§5).
- [ ] The thread shows faces + "what/who".
- [ ] DB matches the UI at every stage (no silent divergence).
- [ ] Coordinator + `owning_party_type` + commission match the scenario's routing.

---

## 7. Report template (fill one block per Scenario × Variation)

```
SCENARIO: <A–F> + <offer variation> + <disruption, if any>
DATE / TESTER:
ENTRY POINT (host + how the client started):
TALENT(S) + their roster state (exclusive / non-exclusive / independent):

ROUTING
  expected coordinator: <agency / talent-self / ...>
  actual coordinator (inquiries.coordinator_id + coordinator participant):
  owning_party_type on talent row(s):                 PASS / FAIL
  commission (snapshot vs expected 6% or 3%+3%):       PASS / FAIL

STAGE RESULTS (PASS / FAIL + note + screenshot ref)
  1 inquiry created:
  2 coordinate/lineup (faces+info, coordinator correct):
  3 offer (total == sum of lines; talent take-home; client gross):
  4 approval (multi-party gate; no double-ask; Approved≠Booked):
  5 convert (agency_bookings + snapshot sums to total):
  6 payment (txn paid; gross == shown; USD):
  7 payout (transfer == talent net; held legs correct):

MONEY/VISIBILITY (§5): client gross-only? talent own-net-only? admin full split?  PASS/FAIL
NOTIFICATIONS (bells per stage):                                                 PASS/FAIL
DISRUPTION RESULT (if run):                                                       PASS/FAIL

BUGS FOUND (with repro + the 4 lenses: UI / money / notif / DB):
EVIDENCE (screenshots + the relevant DB rows):
```

### Coverage matrix to fill (minimum set)
| # | Scenario | Offer variation | Disruption | Result |
|---|---|---|---|---|
| 1 | A (client→agency, agency picks) | approve | — | |
| 2 | B (client→independent talent) | approve | — | |
| 3 | C (agency-rostered, exclusive) | approve | — | |
| 4 | D (non-exclusive, via agency site) | approve | — | |
| 5 | E (non-exclusive, via hub) | approve | — | |
| 6 | A | counter → re-offer | — | |
| 7 | A | reject | — | |
| 8 | A | pre-budget → offer | — | |
| 9 | F (multi-talent, any scenario) | per-talent rates | one talent declines | |
| 10 | A or F | approve | edit location/date | |
| 11 | B or E | approve | change/add coordinator | |
| 12 | A | approve + pay | partial refund / dispute | |

> Run 1–5 first (they prove the routing matrix — the heart of the model). Then 6–8 (offer shapes), then 9–12 (multi-talent + disruptions). For each, fill a §7 block. The "full detailed report" = the filled coverage matrix + one §7 block per row + a bug list.
