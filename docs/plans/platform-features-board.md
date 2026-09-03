# Platform Features board

Maintained by the Platform Features Director. One page: who is doing what, what has a go, what is blocked, what only the owner can decide, and the registry of shared objects. Updated on every manager message. Managers read it; they do not edit it.

Vision and contracts: https://claude.ai/code/artifact/871b8720-ae26-4f49-b9a4-c18a45676a99 (Sell the Room, sections 04, 05b, 05c, 05d, 10b).
Prompts: `docs/plans/feature-managers-prompts-2026-09-02.md`.

Last updated: 2026-09-03 by the Director. Five manager chats open; Orders & Checkout and Front Door reporting, three quiet and chased. Migration blocker repaired. The Workspace & Dashboards Director (a separate department) has WP1 merged as #1497 and is running WP2.

## How the owner starts this

1. Open these seven chats now, titled exactly as written, and paste the matching prompt as the first message: **Capacity Engine Manager**, **Spaces & Seating Manager**, **Orders & Checkout Manager**, **Front Door Manager**, **QR & Links Manager**. Then paste the two re-brief prompts as the next message in the existing **Menu Workspace Manager** and **Appointments Manager** chats.
2. Do not open **Sessions & Classes**, **Events & Ticketing** or **Reservations** yet. Their prompts are written; their go comes from this board when the plumbing is on main.
3. Expect a plan document from each manager before any code. The Director reviews it against the contracts registry below, then sends the go.
4. The titles must match exactly. Managers find the Director by looking up the chat titled "Platform Features Director", and the Director finds them the same way.
5. The owner reads this file. The Director sends a dispatch when a wave completes or a decision is needed.

## Critical path

Capacity 0.2 → Orders 0.5 → Orders 0.6 → Phase 1 Sessions → Phase 2 Events and Phase 3 Reservations in parallel → Phase 4 Layouts → Phase 5 people onto capacity.

Off the critical path, blocking nothing, and worth starting first because they are cheap and visible: Spaces S1 (venue and timezone, which four other areas read), Front Door F1 (a new restaurant's homepage button currently points at a route that does not exist) and F2 (the words table and the sixteen industry presets, the cheapest multiplier in the plan), and QR & Links Q1 and Q2.

## Waves

| Wave | Go condition | Slices |
|---|---|---|
| A | now | Capacity 0.2, 0.3 · Spaces S1 · Orders 0.4, 0.5 · Front Door F1, F2 · Menu item 1 · Appointments items 1 to 4 · QR & Links Q1, Q2 |
| B | **OPEN as of 2026-09-03** — Orders 0.5 merged `a56a53bef`, verified on main | Orders 0.6, 0.7 · Menu re-home · Front Door F3, F4, F5 · Orders 0.8 with Finance |
| C | Orders 0.6 on main, verified | Sessions & Classes Phase 1 |
| D | Phase 1 on main, verified | Events Phase 2 · Reservations Phase 3 · Spaces S2, S3 · Front Door F6, F7, F8 |
| E | Phases 2 and 3 live | Spaces S4, S5, S6 · Front Door F9 · Appointments Phase 5 |

## Status by manager

*Rewritten end of day 2026-09-03. The previous table described the morning and was eight PRs stale for Spaces alone — the manager flagged it rather than editing the Director's file, which was right.*

| Manager | Current | Next | Blocked on |
|---|---|---|---|
| **Capacity Engine** | **Phase 0 COMPLETE and live** — 0.2, 0.3a/b/c, 0.9-cap, 0.10, 0.11, the unchecked-read ratchet and the registry guard. The oversell is closed. | **Sessions & Classes P1.1** — `session_series`, `sessions`, recurrence. Timestamp `20261229000214` verified free; `session_tier` closes the unregistered list. | nothing. **Needs a handoff decision if the Sessions chat opens** — they are already building it. |
| **Spaces & Seating** | **S1, S2 and S3 all merged and live.** Venues + one timezone resolver, the rooms-and-tables editor, seating/moving/closing, both invariants under failing-first test. Eight PRs. | **A clean stop, on purpose.** S4–S6 (layouts, seat maps, minimum spend) are wave E, behind Events and Reservations, and neither manager exists. | nothing. Declined a dev-server lease on the grounds that a lease being available is not the work being ready. |
| **Orders & Checkout** | **0.4, 0.5, 0.6a and 0.8a merged and live-verified.** The Orders spine and `createPurchase` are in production; both engines still present by design. | **0.7, the order card in the thread** — the visibility surface that makes 0.6b's deletions safe. Then 0.6b. | **#1561, two type errors**, both diagnosed: `WordsLookup` is a function-bearing object, so `words.word("menu.order")` not `words["menu.order"]`; and `admin-4.tsx:309` reads a second inline message type needing the same `order` extension. |
| **Front Door** | **Twelve merged.** F1a, F1d, nav, F2a, F2b, F2c, F3a, F3b, F5, the services design, the Settings screen, F8's design and engine halves. **F2 is complete end to end.** | **F1e, the header verb** — the piece the whole F2 chain was built to make possible. Then the Sheet component, held for them. | F4 on Orders 0.8, F6 on 0.7, F7 behind F4, F9 behind Phases 1–3. |
| **Menu Workspace** | **Three merged** — the unpayable card request (#1528), the sold-out board and stock editor (#1535), the words wiring (#1559). **Not silent; the Director reported them so wrongly this morning and corrected it.** | The sold-out badge's remaining surface. | **Unresponsive since ~18:20** through two full unblocks and a direct question. **If still silent, the badge reassigns to Capacity**, who offered and correctly deferred. |
| **Appointments** | **First PR of the day merged** (`cdf3bfc3b`) after eight hours silent — *clearing the timezone box inherits, it does not write UTC.* A real bug, and the same "an absent value is not a default" rule three other managers reached independently. | `BookingHoursCard`, one of five surfaces that hardcoded UTC. | Front Door's open question: **is a house offering's booking mode the same question as a talent's, given a chair has no `booking_terms` and no agency relationship?** Not blocking either side. |
| **Sessions & Classes** | **READY TO OPEN** — P1.1–P1.3 need nothing from Orders 0.6, verified against the shipped schema. | Prompt 6. | **A collision, not a dependency:** Capacity is already building P1.1. Open it *with* a handoff of their branch, or two sessions write `lib/sessions/`. |
| **Reservations** | **READY TO OPEN** — Phase 1 is band mode, which Spaces shipped today. | Prompt 8. First slice: the reservation flow against a band pool, no floor plan needed. | nothing for Phase 1. Phase 3 (host stand) waits on Spaces' band→assigned migration. |
| **Events & Ticketing** | **BLOCKED.** `admissions` does not exist anywhere in the repo — zero references. Ticketing is orders + admissions + a door app. | Prompt 7, after the dependency clears. | One migration for `admissions` (~half a day), plus Orders 0.7 landed so a ticket purchase is visible. |
| **QR & Links** | **READY TO OPEN**, no dependency. | Prompt 10. Q1/Q2 have a Wave A go. | nothing. Will append `/q/<code>` to `AGENCY_STOREFRONT_PREFIXES` — a one-line merge with Front Door's `/me`. |

**Director capacity, stated honestly:** six managers is at the limit, and what broke today was **the message channel, not review throughput** — one ruling took eight delivery attempts and blocked a manager for hours while the decision had already been made. A decision that cannot be delivered is indistinguishable from one that has not been made. **Recommendation: a second director takes Sessions, Events and Reservations as one cluster** — they share a spine and carry no history to inherit.

## Shipped

| What | Where | Evidence |
|---|---|---|
| **Orders 0.8a** — idempotency key on hosted Checkout (`cs_txn_<transactionId>`), and the second deposit path retired | PR #1511, merged 2026-09-03, sha `4be3ae9c4`. **LIVE-VERIFIED, chain complete.** | All CI gates green including the structural quality gate. Production verification done by the manager and **independently re-verified by the Director**: `origin/production` head IS `4be3ae9c4`; the live page serves `sentry-release=4be3ae9c46bae2d6906d8ca5082db7923ddb52e3`, the exact merge commit, which is what distinguishes deployed from pointer-moved; `deploy:smoke` real exit 0 with no Supabase migration drift; `tulala.digital` and `app.tulala.digital` both 200. On `origin/production`: `stripe-checkout.ts:163` carries the key and `server-actions/bank-link.ts` is absent. |
| **Orders 0.4** — `customers` table, backfill, `lib/customers/` | **MERGED `63c98ffde`, LIVE-VERIFIED, CLOSED.** Structural gate 13m7s, all seven checks green. | 8 customers, 8 distinct emails, 6 correctly sharing one phone (measured by the manager; an earlier 7 here was mine and wrong). |
| **Orders 0.5** — `orders`, `order_lines`, convert writes an order, allocations by FK, function grants asserted | **MERGED `a56a53bef`, LIVE-VERIFIED, CLOSED.** Independently re-verified by the Director: production head and the live `sentry-release` match on the **full 40 characters**, both domains 200, `ensure-customer.ts` and all six migrations present on the production ref, `deploy:smoke` exit 0 with no drift. Database queried rather than inferred: all 3 spine tables exist, 8 customers, **0 orders and 0 order_lines (correct — nothing has bought yet)**, 6 migration rows recorded, **0 functions leaking to `authenticated`**. | 838 lines, no TypeScript touched: the schema lands and nothing reads it. Convert parity proven at 50002¢ three ways (offer = order = line totals), house lane preserved, `offer_major_to_cents` asserted identical to the existing inline cast across 12 values including ties and negatives, inside the migration so they cannot drift. **0.4 and 0.5 are both on main — the Orders spine exists.** |
| **The union conflict resolution survived the squash** — `test:money` on `main` carries `stripe-checkout.test.ts` AND `customer-identity.test.ts` | verified on `origin/main` after the merge | A squash is exactly where a bad conflict resolution disappears without trace. Either side alone would have dropped the other's coverage and stayed green. Confirming the **resolution** survived, not just the files, is the step most close-outs skip. |
| **Migration history repair** — two duplicate auto-stamped rows removed, DDL preserved onto their correct twins | production, owner-authorised | `db:check` OK, 651 local migrations all applied, exit 0. |

| **Department docs committed** — the board, all 11 manager prompts and the typecheck serialiser | PR #1512 | The operating rules told every manager to read `docs/plans/platform-features-board.md` before planning, but it was **untracked**, so no worktree branched off `origin/main` contained it. Director error, fixed. |

## P0 FOUND 2026-09-03: the commission context double-multiplies the talent's cost

Found by the Orders & Checkout Manager while staging 0.5's exit proof. **Independently re-verified line by line by the Director before routing.** Not new, not this department's, and **armed rather than fired**.

**The defect.** On `inquiry_offer_line_items`, `unit_price` is PER UNIT and `talent_cost` is the LINE TOTAL. The convert RPC proves the grain in its own arithmetic (`20261226000004_commission_house_lane.sql:348` divides `talent_cost / units` to get a rate; `:349` uses `unit_price` as a rate directly and writes `talent_cost` to a column named `talent_cost_total`; `:369` is `SUM(total_price - talent_cost)`). But `engine_load_commission_context` in the same file passes both `* 100` in the same shape (`:135`, `:140`), and `web/src/lib/billing/commission.ts` then multiplies **both** by units (`:311`, `:315`). **For any line with units > 1 the talent's cost is multiplied by units a second time.**

**Measured, in a rolled-back transaction:** one line, 2 units, `unit_price` 150.005, `talent_cost` 200.00 → order 26001¢, commission context 46001¢. **$200.00 became $400.00.**

**Why it is money, not reporting.** `web/src/lib/payments/transfers.ts` passes `snap.talent_net_cents` straight through as `amountCents` at `:250` and `:337`; its header says the talent is "paid in full" from it. An inflated snapshot transfers real money out of the platform balance — more to the talent than the client ever paid.

**It can also just throw.** `commission.ts:258` refuses `talent_cost_cents > unit_price_cents`. A line total against a per-unit price trips on ordinary data (20000 > 15001), so a realistic multi-unit job may fail conversion outright with `talent_cost_exceeds_price`. Wrong money or a dead convert button, depending on the numbers.

**Blast radius, measured on production 2026-09-03:** `booking_commission_snapshot` 0 · `booking_transactions` 0 · `booking_talent` 0 · `inquiry_offer_line_items` 0 (so 0 multi-unit lines) · `agency_bookings` 2. Nothing to repair, nobody to pay back. **It fires on the first real multi-unit booking, which is the exact thing the platform is trying to get.**

**Second bug, same root.** Order 50002¢ vs context gross 50004¢ across 3 lines: the context computes `round(unit_price × 100) × units` while the order uses `round(total_price × 100)`. The order is right; the client agreed to `total_price`.

**Fix shape endorsed:** have the context pass LINE TOTALS with `units: 1`, rather than dividing by units. Dividing then multiplying reintroduces rounding drift; totals with `units: 1` are exact by construction. Verified safe: `.units` appears exactly **three** times in `commission.ts` (the negative guard at `:255` and the two sums), and all three behave correctly. Line 258's guard also becomes a total-versus-total comparison, which is the correct one. Recommended alongside it: rename `unit_price_cents` to `line_total_cents`, because a field name that lies about grain is what caused this.

**Routed to the Finance, Payments & Accounting Director.** Their file, their decision. Orders has **not touched it** — their brief says feed the resolver, never fork it, and they held to that. **Orders 0.5c is deliberately held** until the fix lands, so the same error is not baked into the new path and made to look intentional.

## OPEN FOLLOW-UP: the grain P0 is fixed but its NAME still lies

The commission grain P0 is fixed and live — verified against `pg_proc`: `'units', 1` present, `li.total_price * 100` present, `li.unit_price * 100` gone. **Independently measured** by the Orders & Checkout Manager through the real staging path (real rows, real RPC, real convert trigger, compared against `order_lines` written by a different code path): order gross 30001¢ = context gross 30001¢, order talent cost 20000¢ = context talent cost 20000¢, `units` field 1. Before the fix the talent cost came through as 40000¢.

**But the rename did not ship.** Verified: the JSON key is still `unit_price_cents`, and `line_total_cents` appears nowhere in the function.

**The name is now MORE wrong than before the fix, not less.** Previously `unit_price_cents` held a unit price and only `talent_cost_cents` lied about its grain. Now both fields hold line totals and neither name says so. The next person to add a line-item consumer will multiply by `units` because the field is called `unit_price` — and it will look correct in review, which is precisely how the original bug survived. **The original bug had passing tests.**

Finance's file and Finance's call. Recorded here as an **open follow-up rather than closed with the fix**, because the mechanism that let this survive is still fully in place. A correct implementation under a lying name is a trap rearmed rather than defused.

## Sequencing decisions the Director has made## Sequencing decisions the Director has made

| Item | Decision | Reason |
|---|---|---|
| `capacity_pool_id` / `consumes_units` on `talent_offerings` and variants | **Capacity Engine adds the columns and the read path. Menu Workspace owns the editor UI that sets them.** There is no separate Catalog owner. | The columns are pool references and are meaningless without the engine, so the engine owns their shape. The control that writes them is a feature surface. Engine owns the column, feature owns the UI. |
| Hotfixing the unbounded oversell before Capacity 0.2 | **No hotfix.** Zero transactions have ever been processed and the fix path is 0.3, which deletes the code a hotfix would touch. **Cheaper mitigation offered to the owner: unpublish or hand-cap the live 12-spot course until 0.3 lands.** | A hotfix to a `kind='product'` gate that 0.3 removes is thrown-away work; unpublishing is zero code and zero risk. |
| Orders 0.4b (retire `ensureGuestClientByEmail`) | **Moves after 0.6.** 0.4 ships the customers table, the backfill, `lib/customers/` and the Clients page reading it. | Nine call sites; `guest-trust-gate`, `guest-claim-link` and `guest-reply-nudge` explicitly depend on the provisioned account; `init.sql:299` gates it with a CHECK. This repo has recorded "a null user_id silently kills a whole path" **twice**. Removing the provisioner before the pipeline is its last producer reproduces a known incident. |
| Proposal 0.4's exit proof ("a guest who buys twice is one customer with two orders and no login") | **Becomes 0.6's exit proof**, by Director ruling, not by manager substitution. | It needs orders (0.5) and the pipeline (0.6) to be evidenced at all. The manager raised it before opening the PR rather than quietly substituting a weaker proof. |
| The five unkeyed SaaS `checkout.sessions.create` sites (`client-billing.ts` ×3, `talent-billing.ts`, `workspace-billing.ts`) | **Routed to the Finance director. Platform Features does not pick them up even if they stay open.** | Their money lane, same one-line shape, and my manager has enough. |
| F1a-2 (37 dead defaults in the seeded section library, 21 of them `/directory`) | **Goes with F1e, not now and not alone.** Ratchet holds the line meanwhile. | No live harm today (zero business workspaces; `/directory` resolves for every tenant that exists). Fixing 37 destinations now and returning for their labels after the verb layer is the patch-written-twice trap we just avoided on the page designs. C2 was a policy, not a bug: the old guard prescribed `/directory` and these 37 are its output. |
| Seeded nav labels ("Shop", "Cart (1)", "Add to cart · $280", "Schedule") | **F1e, with the verb, not F1a.** | A nav item promises a place; a CTA promises an action; the chat honours the second only. Splitting the words layer across two PRs is worse than waiting. |
| `store.ts` as the business audience default | **F2 must repoint it away from `store.ts` in the same change that ships presets.** | A false transaction promise (fake price, fake cart count) is worse than a false place promise. No window where presets are live and salons still get a shop with a cart. |
| Orders 0.5: the order is written by an AFTER INSERT trigger on `agency_bookings` rather than a line inside `engine_convert_to_booking` | **Manager's deviation, approved, and preferred to what the Director specified.** | Same transaction, so booking and order still fail together, which was the actual requirement; putting it inside the RPC was an implementation detail, not the constraint. It avoids `CREATE OR REPLACE` on a 200-line SECURITY DEFINER money function for a one-line addition, and it covers every path that creates a booking rather than only convert — a later second booking-creation path would silently have no order under the Director's version. |
| The three unique money indexes | **Untouched in Phase 0.** Events designs the relaxation with Orders at Phase 2, not before. | Relaxing a guard before its replacement exists turns the many-buyers case into a data-integrity incident. |
| `order_lines` → capacity allocations link shape | **RESOLVED, and the Director was wrong about the shape.** The array is dropped, but the link is `capacity_allocations.order_line_id` (nullable, indexed, `ON DELETE SET NULL`), which Capacity had **already shipped** in `20261229000200` before Orders existed. Orders added the FK. Verified in production. | The Director was right that the array was indefensible (Postgres cannot FK an array element) and right that refund-by-line needs an indexed lookup, but proposed a join table. **One line holds many allocations; an allocation belongs to exactly one line — that is one-to-many, so the link belongs on the many side.** A join table models many-to-many, which here would mean two order lines sharing one allocation: two customers holding one seat, the exact thing the engine exists to prevent. Orders also rejected keeping both the array and the column, which would have been two sources of truth for one fact with nothing to detect a disagreement. |
| `inquiry_offer_line_items.source_service_id` is TEXT, not a uuid FK | **RESOLVED as recommended.** Retyped TEXT → uuid with a real FK to `talent_offerings` (`ON DELETE SET NULL`), guarded by a row-count assertion so the no-backfill path cannot silently run against real data later. The convert trigger is simplified: no cast, no drop, no log. Verified in production: `order_lines_offering_id_fkey` exists. | The tolerance was for data that has never existed (0 rows, every writer stamps an offering id), and a drop-rate metric reading zero forever tells nobody anything. Downstream tolerance for a broken upstream reference is the shape of the recorded lesson "copying the sibling pattern preserved the bug". |

## Decisions only the owner can make

| # | Decision | Needed by | Status |
|---|---|---|---|
| D1 | Events and Ticketing before Reservations, as recommended (phases 2 and 3 are swappable) | Wave D start | open |
| D2 | No-show deposit forfeiture: who keeps it, does the platform take its cut | Reservations plan | open |
| D3 | Cancel and proration policy (finance P0-4) | Orders 0.8 | open |
| D4 | Renaming the offer card to the order card. **Both managers converged on a resolution and the Director recommends it: rename internally, never ship a customer-facing copy change as a side effect, and take the label from the words table with a default rather than hardcoding it in either surface, so it becomes a tenant's choice.** This reduces D4 from an open question to a confirmation. | Orders 0.7 | **recommendation with the owner** |
| D5 | Tax rule for Mexico (blocked on an adviser); columns ship empty until then | Phase 2 | open |
| D6 | Twilio account for SMS and WhatsApp reminders | Reservations Phase 3 | open (owed since the support program) |
| D8 | 0.8b's exit proof ("one real card charge refunded by line") needs the platform bank account verified. Finance P0-6: the BoA account is still `verification_failed`, which only the owner can clear in the Stripe Dashboard. Until then the proof degrades to a test-mode charge. Director's call: ship the code, hold the proof, do not hold the work. | Orders 0.8b | **open, owner action in Stripe** |
| D9 | **`.github/workflows/auto-apply-migrations.yml` is INERT AND REPORTS SUCCESS ON EVERY RUN. This is a live hazard, not just a choice.** Verified from the run logs on `63c98ffde` and `a56a53bef`: `SUPABASE_ACCESS_TOKEN and/or SUPABASE_URL not set — skipping auto-apply as a no-op`. Five runs, all green, none touched the database. **CLAUDE.md is accidentally still correct** — apply before merge, every time, unchanged. **But the workflow's NAME is the trap:** a manager who sees "Auto-apply Supabase migrations: success" in main's check list will reasonably conclude their migration was applied. It was not. That is how someone skips the manual apply, merges code referencing unapplied schema, and reproduces the three-incident failure CLAUDE.md exists to prevent — with a green check as the reason they felt safe. This is `incident_guards_green_measuring_nothing`, live, and worse than the recorded cases because **its green is load-bearing for a human decision**: the entire point of an auto-apply is that people stop doing it by hand. **Binary choice, owner's to make** — (a) ARM it: set both repository secrets, and CLAUDE.md's protocol genuinely changes; or (b) DISARM it: make the missing-secret branch **fail** rather than pass, so the green disappears until it can do its job. The Orders & Checkout Manager recommends (b) as the interim, and the Director agrees: a red is honest and gets asked about, while the current state is silent and rewards a wrong assumption. Neither manager nor Director touched it — adding production Supabase credentials as repository secrets is a security decision, and CI workflows are nobody's file here. | department-wide migration protocol | **open, owner action in GitHub** |
| D9b | **Correction, checked rather than forwarded:** the manager also suspected the migration-only guard mis-classifies pushes, having seen "migration push detected — proceeding" on the mixed squash `63c98ffde`. **That concern is not correct.** The run did emit `##[warning] This push changed migrations AND other files ... Proceeding`, listing all six non-migration files, which is exactly what the workflow's header documents: a mixed push warns and still applies. The real defect is smaller and is naming: **the step is called "Guard — push must be migration-only" while its body only warns.** A step named like a block that does not block. Worth fixing whenever the workflow is next touched; not a reason to delay arming or disarming it. | — | noted, low priority |
| D7 | Seed a `/contact` page, or keep the owner-ratified "no placeholder contact page" call (#1395)? Front Door proposes a third way: seed it only when `agency_business_identity` has real details to render, otherwise seed nothing and point the header verb at Ask (the chat), which always works. That also removes the reason `/directory` became the fallback, which is what created the dead-link tripwire problem. | Front Door F1d | **open, with the owner now** |

## Director errors caught by managers

Kept deliberately, because the pattern is the point: the verification culture is catching the Director as often as it catches the code, and every one of these would have shipped as an instruction if managers had accepted the brief.

| # | Error | Caught by | Root cause |
|---|---|---|---|
| 1 | "Zero `stripe.refunds.create` in the repo" — Finance had shipped the refund engine, cancel-to-Stripe and payout idempotency. | Orders & Checkout | Director read a local checkout 41 commits behind `origin/main`. |
| 2 | "The Connect branch at `stripe-checkout.ts:145` already passes a key" — there is no Connect branch; Finance deleted it in #1479. | Orders & Checkout | Same stale checkout. Rule adopted: the Director reads facts via `git show origin/main:<path>`, never the working tree. |
| 3 | The typecheck script wrote its verdict to a single machine-wide file, reproducing "measured the neighbour" inside the tool written to prevent "read the wrapper's exit". | Orders & Checkout | Shared mutable state, assumed private by its reader. |
| 4 | F1 instructed seeding a `/contact` page, silently reversing an owner-ratified decision (#1395). | Front Door | Director wrote an instruction without checking whether the absence was deliberate. |
| 5 | The typecheck serialiser reclaimed locks from **live, healthy** runs after 30 minutes (`||` with `STALE_SECONDS=1800`). Under contention this is a positive feedback loop: a run exceeds the deadline, its lock is stolen, runs re-parallelise, more runs exceed the deadline. It inverted exactly when it was needed. | Front Door | Director added an age-based backstop "for safety" without asking what happens when the deadline is wrong. **Fixed: reclaim on dead owner only, no age-based reclaim of any kind.** A first fix (heartbeat backstop) reintroduced the bug in milder form and was caught by the Director's own test before it shipped. |
| 6 | The operating rules in every manager prompt told managers to read the board before planning, but the board was untracked in the shared checkout. Managers work in worktrees off `origin/main`, so the file did not exist for them. | Nobody — the Director found it while auditing why two managers had gone silent. | Writing a shared document in the one place that is not shared. Fixed by PR #1512. |
| 7 | Proposed a join table `order_line_allocations` for the order-line ↔ capacity-allocation link. Wrong shape: the relationship is one-to-many, so the link belongs on the many side, and Capacity had already shipped `capacity_allocations.order_line_id` correctly. A join table models many-to-many, which here would permit two order lines sharing one allocation — two customers holding one seat. | Orders & Checkout | The Director reasoned from a requirement (real FK, indexed refund-by-line lookup) straight to a mechanism without checking the cardinality, or checking whether the other side had already built it. Both halves of the correction were available by reading Capacity's applied migration. |

## Corrections accepted from managers

| # | Correction | Effect |
|---|---|---|
| C1 | The roster seed is three profiles, not five, and the workspace-type gate already shipped. But `workspace_type` maps a solo **operator** to "talent", so barbers and coaches still get seeded talent and a directory page. | The gate is right; the flag is wrong. A two-value flag is answering a sixteen-value question, which is the preset argument made by the code. **F2 now lands before or with the roster change.** |
| C2 | The dead-CTA tripwire's prescribed remedy is itself a dead link: it steers authors to `/directory`, which 404s for business workspaces. | The rewritten guard must be workspace-type aware, or it keeps enforcing the wrong answer. |
| C3 | Sixteen dead routes across the thirteen page designs, not one. `restaurant-orderable` is the only clean design, and it is the one the picker never chooses. | F1a reviewed against a per-design inventory in the Front Door plan. |
| C4 | F2 needs **no migration**: words and preset follow the shipped JSONB precedent. | Registry corrected; no timestamp coordination with Capacity, Orders or Spaces. |
| C5 | Words consumes `resolveTerminology()` rather than replacing it; nothing in `lib/scheduling/` changes. | The Appointments Manager needs no coordination for F2. |
| C6 | **The proposal's "zero `stripe.refunds.create`" is stale.** Finance shipped the refund engine (`lib/payments/refund-execute.ts:244`, PR #1481), cancel-reaches-Stripe (#1482) and transfer/payout idempotency (#1484). Verified on `origin/main @ 2e2868ef3`; the Director's local checkout was 41 commits behind. | 0.8 shrinks to refund **by line** on top of a working engine, plus the two genuinely open items. Proposal section 01 and 10b to be corrected. |
| C7 | `agency_client_relationships` cannot be "promoted" to customers: no email, no phone, and `client_profile_id` is required, which needs an `auth.users` row. **That is the mechanical reason guests are provisioned into auth.users** — the client list has nowhere else to put them. | 0.4 is a new table with a new identity key plus an 8-row backfill, not a rename. |
| C8 | `inquiry_offer_line_items.source_service_id` is TEXT, not a uuid FK. | `order_lines.offering_id` cannot be populated straight from it; convert casts and drops on failure rather than failing the conversion. |
| C9 | The engines are 795 and 445 lines, not "two 400-line files", and instant-book is spread across four more `lib/scheduling/instant-book-*.ts` files plus a server action. | 0.6 is a bigger consolidation than the proposal implied. Scope accepted as described. |
| C18 | **The 12-spot course is UNBOUNDED oversellable today, not "stuck seats".** The proposal said only the *release* path was gated on `kind='product'`. The **reserve** path is too (`instant-book-engine.ts:317`). The live course is `kind='package'`, so it never decrements at all: it can sell 13, 30, 300. Verified on origin/main. | The Director's audit understated this. Capacity 0.3's exit proof must prove the 13th is *refused*, which today never happens. Mitigation while 0.3 is built: unpublish or hand-cap the course rather than hotfix a path that 0.3 deletes. |
| C19 | **"Expose stock in the editor" is net-new UI, not an exposure.** `TalentOfferingsManager.tsx` has **zero** references to `inventoryQty`; it is read in four places and written by no editor. The menu board likewise has no inventory or sold-out concept at all (zero references), and the talent storefront's sold-out badge is itself `kind='product'`-gated. | Budget 0.3 and the Menu item accordingly: three net-new surfaces, not three tweaks. |
| C17 | **A phone number does not identify a person, and the `customers` contract said it did.** `(tenant_id, phone_e164)` UNIQUE collapsed **seven** production client profiles sharing `+52 998 400 1234` into one row; `ON CONFLICT DO NOTHING` swallowed it and nothing errored. Dry run predicted 8, apply produced 3. | **Worse at runtime than in the backfill**: `ensureCustomer` looked up by phone first, so the second guest to give a household number would have inherited a stranger's order history, spend total and receipts. A backfill that drops rows is visible if you count; a runtime path that merges two strangers is not. Fixed and verified in production: 8 customers, 8 distinct emails, 7 correctly sharing the phone. **Contract, inherited by everyone downstream: EMAIL is identity; phone is an attribute, and an identity only when there is no email** (so a phone-only buyer is still one customer, not one per order). Unique index narrowed to `WHERE email IS NULL`. A restaurant's regulars are exactly the population this breaks on, and a restaurant is this table's first customer. |
| C16 | **A quarter of the production `auth.users` table is QA debris.** 7 `menu-qa-<timestamp>@example.com` users, 8 on `@example.com`, out of 31 total. First 2026-08-30, last 2026-08-31, and that last one is the newest auth user of any kind on the platform. Six are referenced by `agency_client_relationships`. | Not growing right now only because nobody has run menu QA in two days, which is the wrong thing for the rate to depend on. **Not deleted** (production auth rows with real referenced history; the 0.4 backfill carries them into `customers` as-is, correctly). **Path not closed early** (that is 0.4b, after 0.6). The "where does QA write" question is routed to the **Menu Workspace Manager**: point menu QA at a dedicated tenant or an already-suppressed disposable domain until 0.4b lands. Note the related memory: QA to invented addresses produced five hard bounces. |
| C13 | **`client_profiles` has no email column and no name column.** The only place a client's email exists in the whole schema is `auth.users`. An email-only buyer is not representable at any level. | This is not a gap in the client list, it is *why* the client list is derived from inquiries and *why* guests become permanent human accounts. Production shows the damage: 6 of the 8 client rows are `menu-qa-<timestamp>@example.com`, real permanent auth identities minted by QA runs. |
| C14 | **There is no Connect branch in `stripe-checkout.ts`.** Finance deleted it in #1479; the header says "Do not reintroduce a connected-account branch here." `:148` was the single platform-only call site. | The Director's "refinement" to the contrary came from a 41-commit-stale local checkout. **Second Director error from stale local code** (after the refunds claim). Rule adopted: the Director reads every fact through `git show origin/main:<path>`, never the working tree. |
| C15 | **Unreferenced is not unreachable.** `lib/server-actions/bank-link.ts` had 3 exports and 0 importers, but it is `"use server"`, so every export was a live RPC endpoint reachable by any workspace staff member. `createDepositPaymentIntent` minted a PaymentIntent whose consumer writes `agency_bookings.deposit_*` directly: no transaction row, no commission snapshot, no transfer, invisible to every report, never reaching the talent. | Producer deleted, consumer deliberately left (retiring it plus the four `deposit_*` columns is Finance's call). **Check this property before assuming any `"use server"` file is dead.** |
| C12 | **The `?inquiry=open` cue reader was mounted only on `/directory`.** `DirectoryInquiryUrlSync` documents itself as "the cross-surface fallback every repointed entry routes through", but on origin/main it appears only in `directory/page.tsx` and two directory components, while the launcher it opens is on `agency-home-storefront.tsx` and five times in `/p/[[...slug]]` — exactly the surfaces a seeded design renders on. Repointing 26 CTAs at it would have replaced 26 loud 404s with 26 silent no-ops. | Fixed by mounting the reader **inside** `AgencyChatLauncherMount`, so the cue cannot drift from the thing it opens. Registered as a contract. **Third instance in two days of one failure shape: documented as wired, resolves to nothing** (C6 anchors, C11 anchors, C12 the cue). Verify the destination, never the comment describing it. |
| C11 | **In-page anchors do not resolve in any page design.** A builder node's id is emitted only as `data-builder-node-id` (52 sites in `render.tsx`); there is no plain DOM `id` and no scroll handler. `#menu` in `restaurant-orderable.ts:216` and `store-orderable.ts:36` matches nothing, so the button does nothing. Verified on origin/main. | The design the picker should choose has a primary button that is silently inert, which is worse than a loudly broken route. **F1b re-sequenced behind F1a.** Director's call: split the sixteen by intent. Class A, real destinations, point at the chat permanently (one patch, never redone). Class B, the three genuine in-page jumps, stay inert and out of F1b's scope until an anchor exists. Request routed to the **Page Builder Director**, who owns `builder-node/`; no Platform Features manager touches those files until they answer. |
| C10 | Only the **platform** branch of Checkout session creation lacks an idempotency key; the Connect branch at `stripe-checkout.ts:145` already passes one. | 0.8a is a one-line fix on the platform branch, pulled forward as standalone. |

## RESOLVED: the duplicate migration rows are gone. `db:push` is still not the tool to use, and here is why.

**Repair applied by the Director 2026-09-02, with the owner's authorisation.** The two auto-stamped duplicate rows (`20260902160809 plan_capabilities`, `20260902203622 support_escalation_reasons`) are deleted. Before deleting, their recorded DDL was **copied onto their correctly-versioned twins**, which had none, so the repair lost no information. Verified after: `20261227000002` and `20261227000004` now carry the DDL, the duplicates are gone, `20261227000000 signup_recovery_marker` was deliberately left alone. `npm run db:check` -> **OK, 651 local migrations all applied, exit 0**.

**A correction to the original report, found while verifying.** The CLI showed *seventeen* remote-only versions from the Director's checkout, not three. Thirteen of those have files on `origin/main` and appeared as orphans only because that checkout was 41 commits stale. **Which migrations look orphaned depends on how current your checkout is**, which is its own trap: never diagnose migration state from a stale tree.

Genuinely remote-only against `origin/main` after the repair, and all four are legitimate rather than corruption:

| Version | Why it is remote-only | Action |
|---|---|---|
| `20261227000000` signup_recovery_marker | file on the unmerged `mkt-recovery` branch | leave; it arrives on merge |
| `20260903015526` card_capability_trait_lines | applied today by another session, file on an unmerged branch | leave; **but it is the apply_migration auto-stamp trap happening again in real time** |
| `20261228000140`, `…141` | Orders & Checkout's own, in flight on their branch | expected |

**So `db:push` is still the wrong tool, and correctly so.** With migrations applied from unmerged branches, `db push --include-all` is genuinely unsafe, not merely blocked. The sanctioned path stays:

```
node web/scripts/apply-migration.mjs --apply-pending
```

It derives the version from the filename, applies via the Management API, records the correct version, and ignores remote-only rows.

## The remote-only migration versions, measured 2026-09-03

The Orders & Checkout Manager reported "three remote-only migration versions still block `db:push` department-wide." Measured against the ledger, the count is **eighteen in a stale checkout, five against `origin/main`, and two that are genuine orphans**. The difference matters, so here it is precisely.

Of the five that exist in production but not on `origin/main`:

| Version | Name | Verdict |
|---|---|---|
| `20261228000140` | customers | **Not an orphan.** Orders' own, in PR #1513. Resolves on merge. |
| `20261228000141` | customers_phone_is_not_identity | **Not an orphan.** Same PR. |
| `20261229000200` | capacity_engine | **Not an orphan.** Capacity's 0.2, applied, branch unmerged. Confirms they are building. |
| `20260903015526` | card_capability_trait_lines | **Genuine orphan.** Applied via the management API on 2026-09-03, no file anywhere in git history. |
| `20261227000000` | signup_recovery_marker | **Genuine orphan, and harmless.** Zero statements. A bookkeeping marker row, no DDL to lose. |

Neither orphan is this department's. `card_capability_trait_lines` created **no schema object** (nothing in `information_schema` matches `%trait%` or `%capability%` beyond `plan_capabilities.capability_key` and `talent_reviews.traits`, both of which predate it), so it wrote data, not structure. A rebuild from migrations would miss seeded rows, not tables. It belongs to whoever owns plan capability cards — most likely the Product, Pricing & Commerce Director. **Routed there, not picked up here.**

Practical impact on this department: **none.** We do not use `db:push`; the apply path is `node web/scripts/apply-migration.mjs --apply-pending`, and `db:check` returns OK with 651 local migrations all applied. Nobody should stop work on this.

## Original diagnosis, kept for the record

`db push` aborts with `LegacyDbPushMissingLocalError`. Production's migration history carries three versions with no file on `origin/main`. **Verified against production 2026-09-02:**

| Remote version | Name | Status |
|---|---|---|
| `20260902160809` | plan_capabilities | **duplicate** of `20261227000002` (file present on main) |
| `20260902203622` | support_escalation_reasons | **duplicate** of `20261227000004` (file present on main) |
| `20261227000000` | signup_recovery_marker | file lives on the unmerged `mkt-recovery` branch |

Cause is the documented `apply_migration` trap: the MCP tool stamps its own `now()` version instead of the repo filename, the repo is future-dated, so the two never match. Whoever realigned them **added** the future-dated row instead of **renaming** the auto one, leaving both. Third and fourth occurrence of an incident already recorded twice.

**Workaround, no repair needed, use this today:**
```
node web/scripts/apply-migration.mjs --apply-pending
```
It derives the version from the filename, applies via the Management API, records the correct version, and ignores remote-only rows. Confirmed present on `origin/main`.

**Repair is NOT a manager's call and is not done.** It is a production write to shared migration history and two rows are other managers' work. Proposal with the owner: delete the two auto-stamped duplicate rows (the DDL is already recorded under the future-dated twins, so this removes duplicate history, not schema); **leave `20261227000000` alone**, because marking it reverted risks a double-apply when `mkt-recovery` merges.

## THE ONE SCREEN EACH AREA NEEDS A HUMAN TO CLICK

**Why this list exists.** `web/AGENTS.md:76` says *"Agents do not browser-QA. The integrator does live checks."* But **the integrator is also an agent, and every screen worth checking is behind a login no agent may type a password into.** So today nobody in the loop could perform an authenticated live check — and both `<select>` bugs found today were caught by construction, not by that rule.

The CEO's proposal, adopted: **a short weekly session where the owner walks ONE path per area**, from a list each manager keeps current. Not a QA plan — one screen, the one where a wrong render costs the most.

**Managers: keep your line current. One screen, one sentence on what would be wrong if it were wrong.**

| Area | The one screen | What a wrong render costs |
|---|---|---|
| **Front Door** | Settings › Industry, the preset picker | A stored preset absent from the option list renders as the first option and **saves on the next click — silently rebranding a live storefront.** Guarded by `presetPickerModel` and asserted across every input a real column can hold; never yet seen by a human. |
| **Spaces & Seating** | Venue › timezone select | The same shape, already caught once: `Intl.supportedValuesOf("timeZone")` omits UTC, every workspace is on UTC, so it showed `Africa/Abidjan` and the first Save would have written it live. **Found in the first screenshot.** Now guarded; the rooms-and-tables editor beside it has been clicked once, by its author. |
| **Menu Workspace** | The menu board, sold-out state | The engine refuses a thirteenth sale, but if the badge does not render the customer clicks a live-looking item and is refused at checkout. **The last gap in the oversell story.** |
| **Orders & Checkout** | **Set a tenant's words row to "Quote" and confirm the card TITLE follows** | **Corrected twice by the manager, and the second correction saved the owner a wasted trip.** First narrowing: the card itself has been seen — a real order card rendering `ORDER · $42.50 · 2 items` in amber, signed in via `/api/dev/signin` on localhost (a dev endpoint, not a production login). But the screenshot **predates the `loadTenantWords` wiring**, so it shows the fallback noun, which is **pixel-identical to a broken lookup.** Second correction: *"Pay now and Add line are unclicked" was wrong — they do not render at all.* Verified: **zero non-test call sites pass `onPayOrder` or `onAddOrderLine`**, and the card only renders an action when a handler is supplied. The unit tests assert *when* the buttons should appear and that logic is right; nothing wires them to a behaviour. **Fifth instance of something that looks wired, is documented as wired, and resolves to nothing** — and the first found by asking what a human would actually be asked to click. The client and talent surfaces render no order card yet, deliberately, so there is nothing to check there either. |
| **Appointments** | `BookingHoursCard` | One of the five surfaces that hardcoded UTC. Every workspace has been on UTC since creation, so **every "8am" this product ever showed was 8am somewhere else.** |
| **Capacity Engine** | *(none — no user-facing surface)* | Its proofs are rolled-back transactions against the real schema. Correctly has no line here. |

**A note on how the one proof so far was obtained, because the distinction matters and is easy to get wrong:** signing in through a **dev-only endpoint on localhost with a documented dev credential** is not the same act as typing a password into a login form, and only the second is prohibited. That is what made the order-card screenshot permissible. It does **not** generalise to a production login, and it does **not** mean an agent may use the owner's real browser profile — a permission touching the owner's live sessions cannot be relayed by a peer, which two managers correctly refused when the Director tried to pass it on.

**The standing rule this does not change:** a manager may not assert a UI path they have not clicked, and may not grant themselves an exemption from a repo rule. This list is how the obligation gets discharged by the one person who can discharge it.

## Department rules added in flight
**Writing the click list finds bugs that reviewing the code does not.** Asked to name the one screen a human must check, the Orders & Checkout Manager went to verify their own entry and found that **Pay now and Add line do not render at all** — zero non-test call sites pass their handlers, and the card only draws an action when one is supplied. The unit tests assert *when* the buttons should appear, correctly, and nothing connects them to a behaviour. **Fifth instance of the week's recurring shape**, and the only one found by asking "what would a person actually click?" rather than by reading the code.

The cost avoided is concrete: the owner would have been sent to click a button that does not exist and reported back "I can't find it", which reads as a QA failure rather than a wiring gap.

**A guard that enumerates a gap must be edited in the same commit that closes it.** `subject-registry.static.test.ts` asserts the unregistered kinds are exactly `["session_tier"]`. The moment Sessions P1.1 merges, the directory-wide reader finds its INSERT, the list empties, and **main goes red for a reason the merging manager has no way to anticipate.** Enumerating the gap was the right design — it just has a sharp edge on the last item. Both managers spotted it independently before it fired.


**A sort cannot tell a preference from a hard constraint.** Found by the Spaces & Seating Manager, by a test rather than a review: ordering seating placements longest-window-first let an unseated party take a table **a guest was already sitting at**, because the sort had no way to know one of those was a person mid-meal. **Seating is a hard constraint; duration is only a preference.** The code was wrong, not the test — which is the opposite of the three fixture-versus-code calls made earlier today, and worth having both directions on the record.


**A stacked PR whose base is squash-merged lands INSIDE its parent's commit, and the parent's subject then lies about its contents.**

Found by the Spaces & Seating Manager about their own history, and verified: commit `05699209b` is titled *"fix(capacity): a registration without ON CONFLICT swallowed the next statement (#1568)"* and actually contains **nine files** — `SpacesEditor.tsx` (314 lines), `spaces/editor.ts`, `spaces/pools.ts`, `server-actions/spaces-editor.ts`, migration `…222`, and the en/es strings. All of S2b.

Nothing is lost — GitHub concatenated both commit bodies, so the full message does describe both. **Only the subject line misleads**, and it misleads in the place people actually look: anyone running `git log --oneline` to find why `SpacesEditor.tsx` exists lands on a commit about a regex.

**The safer pattern:** base a follow-up on `main` and accept the conflict, or wait for the parent to land first. Not worth rewriting history for once it has happened — worth avoiding next time.

**Watch for a cap buying CPU with correctness.** Raised by the Orders & Checkout Manager when the CPU governor landed: *if managers start reporting FEWER gates rather than SLOWER ones, the cap will have bought CPU with correctness.* A slower pass is a cost; a shorter pass is a silent change in what "green" covers — **and it would look like discipline.** The signal in a review is a PR body listing three lanes where it used to list six, without saying why. Slower gates, never fewer; raise the cap before accepting a shorter pass.

**Three of today's findings are one disease, and the Orders manager's phrasing is better than the three separate entries above:** a wrapper's exit standing in for the real one, a shared verdict file handing you a neighbour's green, and a 4 GB `tsc` abort reading as a clean pass are **all a green that is true about something other than what you asked.**

**A `<select>` is not the only thing that types cannot check.** The Spaces manager's first S3 draft updated `capacity_allocations.space_id` — **a column that does not exist.** It typechecked, because the service-role client is not generically typed, so it would have failed at runtime against a field that was never there. Caught by reading `information_schema` rather than trusting the draft. **And the invented column would have been wrong even if it had existed:** a joined party sits at two tables, so one allocation occupies two spaces and a single `space_id` cannot say that — it would have forced a second allocation for the same guests, which is the double-count the area exists to prevent.


**A guard that reads ONE file to check a registry that MANY files write to is measuring nothing — and it will read green while doing it.**

Found by the Spaces & Seating Manager. `subject-registry.static.test.ts` read migration `…212` alone, while the registry it guards exists precisely so each feature owner registers their own kind in **their** migration. The instruction given was "register in YOUR migration" — and following it as written would have left `space` and `space_group` **reported as unregistered forever, while they were in fact validated.**

**What makes it worth recording is who wrote it and when.** The guard was written the same day, by the manager who had just argued that coverage nobody can see is how six green-but-empty guards shipped here. It is not a lapse in care; it is evidence the failure mode is genuinely invisible from inside. The author of a guard is the person least able to see what it cannot reach.

Fixed generically — every migration, every `INSERT INTO capacity_subject_kinds`, de-duped — rather than special-cased, because Sessions & Classes will hit the identical wall with `session_tier`.

**Related boundary rule, adopted with it:** you may fix another manager's **guard or test** when it is demonstrably blind, it blocks you, and your fix is general — provided you tell its owner immediately and the fix makes the guard see *more*, never less. Engine code, migrations and money paths stay off-limits without agreement. **A guard that cannot see is not a boundary worth respecting; it is a bug in the boundary.**

**Prove the PROBE red before you trust it green.** The same manager broke the SS-1 binding deliberately — T7's parent pool set to NULL instead of the room — and watched it fail with `expected pool depth 2 for T7, got 1` before it passed on the corrected shape. **A probe that has never failed proves nothing**, and that discipline belongs on the probe itself, not only on the unit tests it accompanies.

**The structural gate runs longer under load than the board says.** Measured 2026-09-03: **19m51s** against the usual 16-17 minutes. Worth knowing before anyone tightens a timeout on it.


**BROWSER QA IS NOW ALLOWED, on Google Chrome, whenever you need it — owner-granted 2026-09-03.** With one condition: **check that the machine can afford it before you start.** This department OOM-killed several sessions this morning with eighteen concurrent typechecks; a browser is heavier than a typecheck. Look at the load, and if the machine is busy, wait. The permission is standing, not per-request — you do not need to ask me.

This does not soften the rule it serves: **you still may not assert a UI path you have not clicked, and agents still may not do the clicking.** The permission removes the excuse, it does not remove the obligation.

**A `<select>` whose value is not in its option list is silently the FIRST option.** Found by the Spaces & Seating Manager in the first screenshot after mounting the venue editor — and it is the single best argument for the click-it rule this department has produced.

`Intl.supportedValuesOf("timeZone")` returns **418 canonical zones and "UTC" is not one of them** (nor is `Etc/UTC`). Verified independently: 418 entries, `UTC` absent, first entry `Africa/Abidjan`. **Every workspace in production is on UTC**, so the editor had no matching option and fell through to the first one — the screen would have shown **Africa/Abidjan** to every operator who ever opened it, and **the first click of Save would have written Abidjan into a live workspace's venue and `agencies.timezone`.**

Nothing in the toolchain could catch it. Not a type error, not a lint error, not a failing assertion — **a correct program displaying a wrong value.** It typechecked, linted, and passed every lane.

The rule it is pinned by: **a value we cannot render is a value we must not silently replace.** The test also asserts that the runtime really does omit UTC, so it cannot quietly become vacuous later.

**A local-QA worktree setup note, so it costs nobody else two dead ends:** Turbopack rejects a `node_modules` symlink pointing outside the project root, and a preview worktree must live under `.claude/worktrees/` for the launch config to accept its cwd. Use a hardlinked copy — `cp -al`, about twenty seconds.


### Added 2026-09-03, from managers

**Route contract questions back to the engine owner; do not resolve them at the surface.** Twice in one day a question about the capacity contract found a defect inside it, and both were invisible from inside the engine. Front Door asking what a refusal *says* found that a database outage was reaching customers as "this does not exist" — the one refusal a customer can act on, collapsed into one they cannot. Menu asking how to *call* `set_offering_stock` found it had no tenant check. The engine owner's words: "from inside the engine both strings are equally safe and the bug is invisible."

**A ratchet is seeded by the thing that will enforce it, never by a human's grep.** The Director counted 194 unchecked Supabase reads with a literal `grep`. The detector counts bindings — `data` present, `error` absent — and found **1,186 across 386 files**, because `const { data: rows } = await` is 5.4× more common than the plain form. Baselining at 194 would have permitted about a thousand new violations while reporting green: a ratchet that ratchets nothing. Third number the Director stated too confidently in one day.

**A detector must not count its own documentation.** The unchecked-read detector counted explanatory snippets in `src/`, so the baseline was inflated and could then be "fixed" by editing a comment — the guard drifting green while the code got worse, with the fix looking like a fix. It now blanks comments before scanning, preserving offsets so line numbers stay true, with string-literal tracking so a `//` inside a URL is not a comment.

**An escape hatch must require a reason.** `// supabase-read-unchecked-ok: <why>` silences the guard; a bare marker does not. A marker is a silencer people route around; a reason is a decision someone defends in review.

**Prove a guard bites before you ship it.** The ratchet was proven by injecting an unchecked read into `lib/capacity/reserve.ts`, watching the lane go red naming the exact file and line, then reverting to green. Six guards in this repo's history were green while measuring nothing; two self-tests asserting the ratchet actually fails is the step that separates this one from those.

**Permit the unknown, but enumerate it.** `capacity_subject_kinds` permits an unregistered `subject_kind` rather than blocking it, so the engine never stops a feature shipping — and because that leaves a real gap, the test **enumerates** the unregistered kinds and fails if the set changes without someone deciding. Coverage nobody can see is how a green guard measures nothing; naming the gap makes it a decision instead of an accident.

**Drop the unguarded overload; do not leave it beside the fixed one.** Keeping a 2-arg `set_offering_stock` next to the tenant-checked version would have left the cross-tenant hole reachable under a different signature — "the sort of thing a fix quietly preserves."

**A guard that fails OPEN is worse than no guard.** A hardcoded `to_regclass('public.spaces')` silently disables itself when the table does not exist or the name was guessed wrong. A registry row is an explicit act by the table's owner, and registering a table that does not exist is refused.

**An absent value is not a default — it is a signal that nobody has chosen, and the safe reading is whatever is already live.** Every workspace predates industry presets, so the preset parser returns "custom" for all of them. Treating "custom" as a real value would have silently rewritten the chat opener and header button on every live storefront in one merge.

**Before changing a cron's schedule, look for what else is riding it.** The review-request sweep piggybacks on the booking-reminder cron and is not workspace-scoped. Moving that cron from daily to hourly would have run the sweep 24 times a day, silently. It is now gated to the 08:00 UTC tick, with `reviewSweepDue` in the log line so it is observable rather than assumed.

**A local day is not 24 hours.** Madrid's fall-back Sunday is 25 and spring-forward is 23. Anyone building service windows or turn times will hit this.

**`starts_at` and `event_date` are different kinds of fact.** An instant converts into a zone; a bare civil date is compared as written. "Converting it would invent a time nobody recorded and move the booking a day in half the world."

**Managers apply their own migrations, in their own band, before merge, without asking.** Verify the object exists afterwards. Escalate only when a migration is destructive, changes a customer-facing promise, or touches another manager's table. Bands exist to stop two managers picking the same number, **not** to impose an order — sorting below an applied migration matters only for a rebuild-from-scratch, and only when there is a real dependency.

**"CI is authoritative" is a merge-gate rule, not a licence to describe a green local run as an absent one.** Post-crash the Director told everyone to write "local typecheck not run" in their PR body. Correct for two managers whose runs never completed; **wrong** for the one whose run completed and passed, and who refused to write it. State what actually happened.

**On a stacked branch whose lower PRs merged as squashes, `git rebase origin/main` is the wrong command.** It replays commits already upstream and manufactures conflicts in your own code. Use `git rebase --onto origin/main <last-merged-commit>`.

**An overstated security claim is its own kind of error.** A finding described as "any authenticated staff member could call this" implied direct reachability that the grants did not permit. The finding still stood — and for a sharper reason: because the RPC was unreachable, the server action was the *only* guard rather than a second one.

**Compare the FULL 40-character sha, not a prefix.** The manager's first read of the sentry release matched on nine characters and they nearly accepted it. Nine characters prove less than they appear to, and this is a money branch. Compare the whole thing.

**The sentry-release check has now actually caught a divergence, so stop treating it as ceremony.** 2026-09-03: `origin/production` head was `a56a53bef` while the live page still served `sentry-release=63c98ffde`. **Pointer advanced, build not landed.** Every previous close-out in this department had the two agree — which is exactly the condition under which people stop checking. A pointer advance proves what `production` points at; only the release string on the live page proves what is serving traffic. The Orders & Checkout Manager refused to call 0.5 verified on this basis, correctly — and in their words: had they closed on the pointer alone they would have been reporting a deploy that had not happened, and would have been right by luck twelve minutes later. The check is cheap and the failure it catches is silent. That is the whole argument.


**A grant revoke needs BOTH directions, and only `has_function_privilege` proves it.** Found by the Orders & Checkout Manager auditing their own earlier migrations. The recorded incident `incident_revoke_from_anon_noop_public_grant` covers one direction: revoking from a role when the grant is on PUBLIC is a no-op. **The mirror is equally true and was hit here:** Supabase grants EXECUTE to `authenticated` explicitly on every new function, and an explicit role grant survives `REVOKE ... FROM PUBLIC`. So `offer_major_to_cents` read as revoked and was not. Always revoke from PUBLIC *and* from each role, then assert with `has_function_privilege`.

**Assert both directions, not just the one you fear.** Their fix asserts that no client role holds EXECUTE **and** that `service_role` keeps it. In their words: a revoke that over-reached would break the purchase pipeline silently, which is a worse outcome than the leak it fixed, and it is the kind of thing a one-sided assertion cheerfully certifies. A guard that can only fail one way is half a guard.

**Care tracks perceived risk; assertions do not.** The manager's own diagnosis, kept because it is the transferable part: every SECURITY DEFINER function in the track was already correctly locked, and the only leak was on the one that could not do harm — IMMUTABLE pure arithmetic. They wrote the dangerous ones carefully and the harmless one casually. An assertion does not know which function you thought was important. The structural gap underneath: they asserted TABLE grants with `has_table_privilege` in three migrations and asserted FUNCTION grants in none.

**Measured, so nobody escalates this into a repo-wide alarm:** `public` holds **148** SECURITY DEFINER functions, **87** of them executable by `anon`. That is largely by design — a large share are trigger functions, where EXECUTE is not a callable surface, and the rest are RPCs authorized internally, which is the entire point of the pattern. The most alarming name on the list was sampled rather than assumed: `engine_convert_to_booking` opens with `IF auth.uid() IS DISTINCT FROM p_actor_user_id THEN RAISE EXCEPTION 'forbidden'`, and for `anon` `auth.uid()` is NULL. Broad grant, internal authorization, correct shape. **Not escalated.** A real grant audit would need a per-function reading of each guard, not a count, and belongs to whoever owns security posture.

**A grant count is not a finding.** The manager's addition, and the reusable half: the unit of analysis is one function *plus its guard*. Anything that reports a count without reading guards produces 87 alarms and zero information, and the next person to run it will escalate. The distance between "alarming", "true" and "nearly meaningless" is exactly where a false alarm gets manufactured.


**Before proposing a link table, ask: can two of the left thing legitimately share one of the right thing?** The Orders & Checkout Manager's framing of Director error 7, and it is better than the error itself. If the answer is no, the relationship is one-to-many, the link belongs on the many side, and a join table silently **permits** the very thing you were protecting against. The trap is that a join table answers a real requirement — integrity plus an indexed lookup — and answering a real requirement is what makes a wrong shape feel safe. **Adding integrity in the wrong shape removes a guarantee.**


**READ `mergeStateStatus` BEFORE YOU READ CHECKS.** Proposed by the Orders & Checkout Manager after nearly shipping a false green on #1513, sharpened by the Director after measuring every open PR. One command:

```
gh pr view <n> --json mergeStateStatus,mergeable
```

`DIRTY` / `CONFLICTING` means **the checks you are looking at do not describe what would land**, and it has TWO faces:

1. **The absence.** #1513 showed `Vercel: pass`, `Vercel Preview Comments: pass`, `Re-alias: skipping` — two passes and a skip, nothing red. The structural gate, admin boot, fidelity goldens and perf budget were not pending, not failing, not queued. **They had never fired.** A conflicting PR fires nothing, which this repo already records in `reference_ci_and_ratchet_traps` as "a CONFLICTING PR fires NOTHING while reporting all done". The manager caught it only because the gates were green implausibly early for a PR that normally takes a 16-minute structural gate.
2. **The stale green, which is worse.** Measured 2026-09-03: PR #1506 (`feat/finance-ledger-writer`) is `DIRTY` / `CONFLICTING` and shows a **complete green check set**, structural quality gate included, passing in 16m16s. Those runs measured a merge ref from before `main` moved. There is no absence to notice and nothing looks early. Related recorded lesson: `incident_rerun_replays_stale_merge_ref` — a stale PR needs a **rebase**, never a re-run.

3. **The stale base, milder than both and still worth a rebase.** Proposed by the Orders & Checkout Manager after applying the rule to their own PR rather than making an exception for themselves. A PR can be `BLOCKED` / `MERGEABLE` — no conflict, nothing to fix — while its structural gate started *before* the PR it depends on landed, so it measured a base that no longer exists. Not `DIRTY`, so clauses 1 and 2 do not catch it. **If `main` moved under an open PR, rebase before merging, even when it is `MERGEABLE`.** Cheap to follow, and it removes the per-PR judgement call about whether this particular gate happened to be sensitive to this particular base change — a call nobody should be making on a money branch. The Director rebased #1512 on the same rule, for the same reason.

**The check that resolves "is this green mine" is the run's head sha — not its status, duration, or recency.** Added by the Orders & Checkout Manager after clause 3 gave them a false positive on its first real use: post-rebase, #1514's gate read `pass 12m57s`, and the pre-rebase watcher had reported the identical string to the second. Everything about it said "old run". Reading the run's head sha settled it in one query with no judgement — the pass was genuinely from the rebased commit, and the two pre-rebase runs were `cancelled`, not passed.

```
gh run list --branch <b> --workflow "<name>" --json headSha,conclusion,createdAt
```

Their corollary reframes clause 2: **GitHub cancels superseded runs**, so a stale run usually shows `cancelled` rather than `passed`. A full green set on a `DIRTY` branch — Finance's #1506 — is therefore the unusual case, not the normal one. That makes clause 2 rarer and clause 3 more valuable than first written.

**Why this hits this department specifically:** every manager branched off a fast-moving `main`, and `web/package.json`'s curated lane list is the one file we all touch, because "a new test file runs nowhere until you add it to a lane" funnels all nine of us into the same line. Resolve that conflict as the **union** of both sides, never either one — the manager's rebase went from 282 tests to 295 by taking both.


**A migration that is only safe because of a measurement must assert the measurement.** Proposed by the Orders & Checkout Manager's practice, adopted 2026-09-03. "Zero rows today, so this retype is free" is true today and silently false the moment it is not. Their `source_service_id` TEXT → uuid migration carries a row-count assertion so the no-backfill path cannot run against real data later. Do the same wherever a Director ruling rests on a count.


- **Migration timestamp bands** (from Orders & Checkout, adopted for everyone). See the band table below.
- **Never commit on a scoped typecheck.** The full `npx tsc --noEmit` is the gate. Sibling sessions on this machine have been observed queueing 23 concurrent tsc processes; if yours is queued, wait or run it later. A scoped green is not evidence, and this repo has a recorded incident of exactly that false signal.
- **"Not zero" is not a count.** A verification block that asserts a backfill produced rows passed while it silently dropped five of eight. Assert the exact expected number, and of the right thing.
- **A dry run of a backfill must include the INSERT, not just the SELECT that feeds it.** The query returned 8 in isolation; the loss happened in the insert's `ON CONFLICT DO NOTHING`.
- **Any shared mutable location that a reader assumes is theirs is a bug.** Not just temp files. If two sessions can write the same place and either can read it expecting their own result, that is the shape. The Director's first version of the typecheck script wrote its verdict to one machine-wide file; the lock serialises runs but does not stop a *later* run clobbering the verdict before the earlier reader gets to it, so a manager could read a real, correct, honestly-produced verdict **about someone else's branch**. Nothing about it looks wrong, which is what makes it dangerous. Fixed: the verdict file is keyed by checkout, the shared file is never written and is deleted on every run, and the script prints the exact re-read command. Per-checkout history: `grep " $(pwd) " /tmp/tulala-tsc.log | tail -1`.
- **Read the exit line out of the log, never a task notification's summary.** A backgrounded typecheck was reported by its harness as "completed (exit code 0)" while the real line said `TSC EXIT = 143` (SIGTERM, the manager's own kill). That is this repo's recorded "wrapper exit 0 over tsc 134" incident happening again, and the queue script makes it *more* likely because it encourages backgrounding. The script now classifies the outcome itself: PASS, FAIL, or **"KILLED by signal N - NOT A RESULT, run it again"** for any exit above 128, written to stderr, appended to `/tmp/tulala-tsc.log` and overwritten to `/tmp/tulala-tsc.last`. After any run, `cat /tmp/tulala-tsc.last` is the answer.
- **Serialise the full typecheck.** Measured 30 concurrent `tsc --noEmit` across six checkouts, top process at 38% CPU, one branch waiting 58 minutes. Use `bash /private/tmp/claude-505/-Users-oranpersonal-Desktop-impronta-app/da6c55c3-afdd-4e66-8406-c0efd3d3d477/scratchpad/tsc-queue.sh` from your worktree's `web/`: machine-wide lock, same full command, real exit code, stale locks reclaimed. It does not weaken the gate. If it proves out, land it in the repo as a script.
- **Verify the destination, never the comment that describes it.** Three findings in two days were things documented as wired that resolve to nothing.
- **`builder-node/` belongs to the Page Builder Director**, a separate department. No Platform Features manager edits those files. Route engine requests through the Director.

**The typecheck serialiser lives at `web/scripts/tsc-queue.sh`** (in the repo, as the Orders & Checkout Manager recommended: a session scratchpad dies with the session that wrote it, and the next manager gets a confusing "No such file"). Run it from your worktree's `web/` directory. `~/.claude/tulala-tsc-queue.sh` is the identical script for worktrees that predate PR #1512. It runs the same full `tsc --noEmit` and exits with its real code. It reclaims a lock only when the owner process is dead; there is no age-based reclaim, on purpose.

## Contracts registry
### `space_group` pools are BAND MODE ONLY. Ruled 2026-09-03.

Found by the Spaces & Seating Manager, applying the invariant Capacity handed them (**SS-1**: `parent_pool_id` is the pool of the nearest ancestor *that has a pool*) to their own plan — and finding their own plan was wrong.

**The plan said "every bookable space AND every group gets a pool". SS-1 makes that a double-sell.** A table's nearest pooled ancestor is its **room**, so a `space_group` pool is not an ancestor of its members. The two never see each other's allocations, and **the same table sells twice.**

**The obvious repair is unavailable:** making the group the parent fails because a table belongs to several groups at once. The mockup's Table 7 is in *Four-tops* **and** *Window*, and a pool has exactly one parent.

**But groups are not a mistake, because one thing only a group pool can express:** `overbook_units` is a property of the band, not of the table. "We take 8 reservations against 6 four-tops" has no home on a per-table pool.

**So there are two modes, and they must never both be live for the same tables:**

| Mode | Who | Pools that exist | Why |
|---|---|---|---|
| **Band** | Reservations Phase 1, no floor plan | the **group only** | sells "a four-top at 8pm"; tables may not exist as rows yet; the only place `overbook_units` means anything |
| **Assigned** | Reservations Phase 3, host stand | the **tables only** | the group demotes to a pure **selection** — pick an available member, reserve *its* pool. Overlapping groups become harmless, because a selection has no arithmetic. |

**MEASURED, not reasoned.** The Capacity Engine Manager reproduced it in production and rolled it back: with the group pool as a sibling of the tables, band mode sells all 6 four-tops (group remaining 0), then a **direct sale of Table 7 for the same window returns ok: TRUE**, and the room does not catch it either (remaining 5). They also tested the obvious repair — parenting the group to the room — and it *works* (`ancestor_full`) and is **still not the answer**: it only holds when the room contains exactly that group's tables. Room of 10, group of 6 → band sells 6, room 6/10, Table 7 sells directly, room 7/10 allowed, **seven four-tops promised against six**. Parenting narrows the hole; the two modes close it.

**ROOT CAUSE, recorded as the engine's limit rather than as the caller's workaround:** a table belongs to several groups at once and `parent_pool_id` is single-valued. A DAG would mean an allocation charging several paths, which is a materially different engine. Two mutually exclusive modes is the right answer at this scale, not a compromise.

**CORRECTION — in band mode the group pool must be PARENTLESS, not parented to the room.** During a band → assigned migration both pools exist briefly. If the group hangs under the room, reserving the replacement table pool double-charges the room and returns `ancestor_full` **mid-migration** — the migration blocks itself, halfway through, on a live venue. Parentless shares no ancestor with the table pools, so the two sets never contend, and nothing is lost because in band mode the tables do not exist as rows.

**MIGRATION ORDER, because the obvious order is wrong:** reserve the replacement table and **commit it BEFORE releasing the group allocation**. Release-then-reserve opens a window where the guest holds nothing and a walk-in takes their table. No new RPC is needed.

**THE REGISTRY LINE IS THREE FACTS, NOT ONE:**
1. `space_group` pools exist **in band mode only, and PARENTLESS**.
2. `space` pools exist **in assigned mode only**, parented to the room per SS-1.
3. **SS-2 — a `space_group` pool and its member table pools are never both active.**

**`capacity_subject_kinds` does NOT cover mode exclusivity, and Capacity volunteered that rather than let it be assumed.** That registry maps a kind to a backing table: registering `space_group` says the subject id must be a real group row, and says **nothing** about whether that group should currently be selling. A caller who reads the registration as protection has bought less than they think.

**The band → assigned migration is FOUR steps and the ORDER is the safety property, not an implementation detail:** create the table pools → `reserve` then `commit` each replacement → **only then** release the group allocation → deactivate the drained pool. Reserve before release, never the reverse. It needs no new RPC. **This is a real deliverable on the Reservations Phase 3 critical path and they must know before they plan.**

**Registry line: `space_group` → band mode only.** Without it, a future session creates both kinds of pool for one venue and the only thing preventing a double-sold table is that nobody thought of it.

**Band → assigned is a real migration and belongs on the Reservations Phase 3 critical path.** Capacity's trigger refuses to re-parent a pool holding live allocations, so it is *create the table pools, drain the group pool, deactivate it* — not a re-parent. **Reservations must know this before they plan**, not discover it in Phase 3.

**Mode exclusivity cannot be enforced by the engine, and Capacity said so plainly rather than let anyone believe otherwise.** Their schema has no idea which tables belong to which group — membership is the caller's table. **SS-2 is therefore the caller's invariant: a `space_group` pool and its member table pools are never both active.**

**The pattern, stated by the engine owner after telling Spaces twice that an invariant cannot live with them:** *the engine is correct by construction for every value a caller can pass, so there is no wrong-looking row for it to refuse. An invariant about the SHAPE of a caller's tree can only be held by the caller.* Adopted as a department rule.

**Two things Capacity declined to build, both deliberately.** An any-of RPC for "pick any available four-top" — the caller's app-code loop is correct and does not race, because each reserve is atomic and a refusal writes nothing; an RPC would buy one round trip and cost the engine a concept it does not need. (Contention tip given instead: rotate candidate order, or every booker fights over Table 1.) And engine-side mode exclusivity, per above.

**Why this entry exists at all:** the manager applied another engine's invariant to their own design and found their own error before writing code. That is the cheapest place this could possibly have been found, and it is worth naming as the practice rather than only the outcome.


| Object | Owner | Consumers | Status | Migration |
|---|---|---|---|---|
| agencies.timezone, venues, resolveTenantTimezone | Spaces & Seating | everyone | proposed | S1 |
| capacity_pools, capacity_allocations, reserve_capacity, reserve_capacity_batch, commit_capacity, release_capacity, parent_pool_id ancestor rule | Capacity Engine | Spaces, Orders, Sessions, Menu | proposed | 0.2 |
| offering.capacity_pool_id, consumes_units; inventory_qty on a pool | Capacity Engine | Menu, Sessions, Events | proposed | 0.3 |
| customers; **EMAIL is identity, phone is an attribute and an identity only when email is null** | Orders & Checkout | everyone | **applied 2026-09-02** | 20261228000140 + 141 |
| orders, order_lines (cents, XOR payee, allocation_ids, space_id, session_id, payout_release_rule); order_id on booking_transactions and booking_commission_snapshot | Orders & Checkout | everyone | proposed | 0.5 |
| lib/orders/purchase.ts pipeline | Orders & Checkout | Menu, Front Door, Sessions, Events, Reservations | proposed | 0.6 |
| message_kind 'order', the order card | Orders & Checkout | Front Door, Menu | proposed | 0.7 |
| spaces, space_groups, space_group_members, layouts, layout_spaces, assign/move API, QR per space | Spaces & Seating | Reservations, Events, Menu, Appointments | proposed | S2 to S5 |
| session_series, sessions, session tier pools | Sessions & Classes | Events, Reservations | proposed | Phase 1 |
| admissions, check_in RPC | Sessions & Classes | Events, Reservations | proposed | Phase 1 |
| events, inquiries.event_id, tenant promo codes | Events & Ticketing | Front Door | proposed | Phase 2 |
| the Sheet component contract, draft order per guest session, /r/<code>, /me | Front Door | every feature | proposed | F3 to F5 |
| links, link_scans, /q/<code> resolver, Share popover, qr_code block, print canvas kind; orders.link_id, inquiries.link_id | QR & Links | every feature, Front Door, Page Builder | proposed | Q1 to Q4 |
| the `?inquiry=open` cue reader is mounted INSIDE `AgencyChatLauncherMount`, never beside it, so the cue cannot drift from the launcher it opens | Front Door | every seeded design | **agreed 2026-09-02** | none |
| terminology precedence: an EXPLICIT pick beats the preset, an untouched default does not; drawn on the raw value before normalisation | Front Door | Appointments, every feature | **agreed 2026-09-02** | none (JSONB) |
| `presetRepresentsPeople()` replaces `rosterEnabled(workspace_type)` as the starter-roster gate; fails toward "represents nobody" | Front Door | signup seeding | **agreed 2026-09-02** | none |
| The Sheet reads the offering's payment policy directly (reserve mode, deposit, pay in person, require account) and renders from it; the purchase pipeline **re-validates at submit**, because a client read is display, never a gate | Front Door | Orders & Checkout | **agreed 2026-09-02** | none |
| words + industry preset, stored as JSONB at `agencies.settings.words` and `.industry_preset` (NOT a table; follows the shipped `settings.appointments.terminology` precedent, so **zero migrations**); read path for public, Sheet, receipts, chat, admin rail; defaults read through `resolveTerminology()`, overrides win on top | Front Door | every feature, Dashboards Director | **agreed 2026-09-02** | none |
| fulfilment_pipelines (editable stages, per preset defaults, routing by category); Menu views toggles | Menu Workspace | Orders, Front Door | proposed | Menu item 3 |
| Terminology setting read path | Appointments | Front Door | agreed (exists) | none |
| Naming: no new table named reservations, bookings, holds, locations; customer nouns via terminology; no em dashes; cents | Director | everyone | agreed | none |

## Migration timestamp bands (department rule, adopted 2026-09-02)

Proposed by the Orders & Checkout Manager and adopted for everyone. The newest migration on `origin/main` is `20261227000004`, and today's real `date -u` stamp sorts **before** it, so every manager must future-date. With nine parallel sessions, hand-picked stamps collide. Each manager owns a band under `202612280001xx`:

**BANDS REBASED 2026-09-03.** The original `202612280001xx` bands were flawed: Orders had already applied `20261228000140` and `…141`, so every other manager's band sorted *below* an applied migration. The Capacity Engine Manager caught it. New bands, all above the remote head:

| Band | Manager |
|---|---|
| `20261229000200` to `…219` | Capacity Engine |
| `20261229000220` to `…239` | Spaces & Seating |
| `20261229000240` to `…259` | Orders & Checkout (140/141 already applied stay where they are) |
| `20261229000260` to `…279` | Front Door (needs none; words and preset are JSONB) |
| `20261229000280` to `…299` | QR & Links |
| `20261229000300` to `…319` | Menu Workspace |
| `20261229000320` to `…339` | Appointments |

**Do not pick a timestamp by reading the local migrations directory.** The local head is `20261226000010` while the remote ledger head is `20261228000141`; a local read collides. CLAUDE.md's `date -u +%Y%m%d%H%M%S` rule is actively wrong for this repo, because a real-clock stamp sorts below everything future-dated. Use your band.

Claim a number inside your band, announce it here through the Director before you apply it, and verify the object exists in production afterwards. **The apply command is `node web/scripts/apply-migration.mjs --apply-pending`, not `npm run db:push`.** `db:check` gives a false green on a collision, so never trust the green line alone.

Orders' already-claimed `20261228000142` and `…143` stay where they are: they sort above the applied head, so they were never part of the flaw. Everything else moves to the `20261229` bands.

| Timestamp | Manager | Purpose | State |
|---|---|---|---|
| 20261228000140 | Orders & Checkout | customers | **applied** |
| 20261228000141 | Orders & Checkout | customers phone-is-not-identity fix | **applied** |
| 20261228000142 | Orders & Checkout | orders, order_lines | claimed |
| 20261228000143 | Orders & Checkout | convert RPC | claimed |
| 20261228000144 | Orders & Checkout | commission context | claimed |
