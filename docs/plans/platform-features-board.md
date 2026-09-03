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
| B | Orders 0.5 on main, verified | Orders 0.6, 0.7 · Menu re-home · Front Door F3, F4, F5 · Orders 0.8 with Finance |
| C | Orders 0.6 on main, verified | Sessions & Classes Phase 1 |
| D | Phase 1 on main, verified | Events Phase 2 · Reservations Phase 3 · Spaces S2, S3 · Front Door F6, F7, F8 |
| E | Phases 2 and 3 live | Spaces S4, S5, S6 · Front Door F9 · Appointments Phase 5 |

## Status by manager

| Manager | Go | Current | Next | Blocked on | Last message |
|---|---|---|---|---|---|
| Capacity Engine | A | **plan APPROVED, all 5 decisions upheld; building 0.2 in `wt-capacity-engine`, band `20261229000200`–`…219`** | 0.2 pools + allocations + reserve RPCs, then 0.3 | nothing. Spaces & Seating inherits the ancestor rule with a right to challenge it | Director ruling sent 2026-09-03 |
| Spaces & Seating | A (S1 only) | **NO CHAT OPEN — prompt DELIVERED to the owner 2026-09-03, paste-ready** | mockups + plan, S1 | nothing. S1 (venue + timezone) is read by four other areas | prompt now states the ancestor rule they inherit and their right to overturn it |
| Orders & Checkout | A (0.4, 0.5, 0.8a) | **0.8a MERGED (#1511). 0.4 = PR #1513 (rebased after a false green). 0.5 = PR #1514, 3 migrations, 838 lines, no TypeScript.** Migrations `…140`–`…144` applied to prod. | merge #1513, then #1514, then 0.6 | **0.5c HELD until Finance rules on the grain P0** — deliberately, so the error is not baked into the new path. 0.7 needs D4; 0.8b proof blocked on P0-6 | #1514 opened + the `mergeStateStatus` trap, 2026-09-03 |
| Front Door | A (F1, F2) | **F1a written (26 hrefs, new guard, cue reader fixed); F2a written; queue defect they found is fixed** | F2b/F2c, F1e verb, then F1a-2 and F1b | both branches await the full tsc; F1d blocked on D7; F1b behind the anchor answer | lock fix confirmed 2026-09-03 |
| Menu Workspace (existing) | A (item 1) | **chat open, silent** | stock in editor, sold-out, payInPerson | re-home waits on Orders 0.6 | **ruling sent 2026-09-03: they own the stock editor UI; oversell is unbounded. Chased twice, no reply** |
| Appointments (existing) | A (items 1 to 4) | **chat open, silent** | click through the never-clicked screens, then items 1 to 4 | F8 waits on Capacity 0.3 | **chased twice, no reply. Nothing waits on them, so silence costs schedule not blocking** |
| Sessions & Classes | C | not started | plan + pure prototypes | Orders 0.6 | none |
| Events & Ticketing | D | not started | designs + plan | Phase 1 | none |
| Reservations | D | not started | designs + plan | Phase 1, Spaces S2 | none |
| QR & Links | A (Q1, Q2) | **NO CHAT OPEN — prompt DELIVERED to the owner 2026-09-03, paste-ready** | plan doc, then Q1 | Q3 waits on Orders 0.5 + Page Builder Director; Q4 on Orders 0.6 | none |
| Workspace & Dashboards Director (separate department) | running | WP2 HQ regroup | WP3, WP4 | nothing | WP1 merged #1497 |

## Shipped

| What | Where | Evidence |
|---|---|---|
| **Orders 0.8a** — idempotency key on hosted Checkout (`cs_txn_<transactionId>`), and the second deposit path retired | PR #1511, merged 2026-09-03, sha `4be3ae9c4`. **LIVE-VERIFIED, chain complete.** | All CI gates green including the structural quality gate. Production verification done by the manager and **independently re-verified by the Director**: `origin/production` head IS `4be3ae9c4`; the live page serves `sentry-release=4be3ae9c46bae2d6906d8ca5082db7923ddb52e3`, the exact merge commit, which is what distinguishes deployed from pointer-moved; `deploy:smoke` real exit 0 with no Supabase migration drift; `tulala.digital` and `app.tulala.digital` both 200. On `origin/production`: `stripe-checkout.ts:163` carries the key and `server-actions/bank-link.ts` is absent. |
| **Orders 0.4** — `customers` table, backfill, `lib/customers/` | migrations `20261228000140` + `…141`, applied to production | 8 customers, 8 distinct emails, 6 correctly sharing one phone (measured by the manager; an earlier 7 here was mine and wrong). |
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

## Department rules added in flight
**A grant revoke needs BOTH directions, and only `has_function_privilege` proves it.** Found by the Orders & Checkout Manager auditing their own earlier migrations. The recorded incident `incident_revoke_from_anon_noop_public_grant` covers one direction: revoking from a role when the grant is on PUBLIC is a no-op. **The mirror is equally true and was hit here:** Supabase grants EXECUTE to `authenticated` explicitly on every new function, and an explicit role grant survives `REVOKE ... FROM PUBLIC`. So `offer_major_to_cents` read as revoked and was not. Always revoke from PUBLIC *and* from each role, then assert with `has_function_privilege`.

**Assert both directions, not just the one you fear.** Their fix asserts that no client role holds EXECUTE **and** that `service_role` keeps it. In their words: a revoke that over-reached would break the purchase pipeline silently, which is a worse outcome than the leak it fixed, and it is the kind of thing a one-sided assertion cheerfully certifies. A guard that can only fail one way is half a guard.

**Care tracks perceived risk; assertions do not.** The manager's own diagnosis, kept because it is the transferable part: every SECURITY DEFINER function in the track was already correctly locked, and the only leak was on the one that could not do harm — IMMUTABLE pure arithmetic. They wrote the dangerous ones carefully and the harmless one casually. An assertion does not know which function you thought was important. The structural gap underneath: they asserted TABLE grants with `has_table_privilege` in three migrations and asserted FUNCTION grants in none.

**Measured, so nobody escalates this into a repo-wide alarm:** `public` holds **148** SECURITY DEFINER functions, **87** of them executable by `anon`. That is largely by design — a large share are trigger functions, where EXECUTE is not a callable surface, and the rest are RPCs authorized internally, which is the entire point of the pattern. The most alarming name on the list was sampled rather than assumed: `engine_convert_to_booking` opens with `IF auth.uid() IS DISTINCT FROM p_actor_user_id THEN RAISE EXCEPTION 'forbidden'`, and for `anon` `auth.uid()` is NULL. Broad grant, internal authorization, correct shape. **Not escalated.** A real grant audit would need a per-function reading of each guard, not a count, and belongs to whoever owns security posture.


**Before proposing a link table, ask: can two of the left thing legitimately share one of the right thing?** The Orders & Checkout Manager's framing of Director error 7, and it is better than the error itself. If the answer is no, the relationship is one-to-many, the link belongs on the many side, and a join table silently **permits** the very thing you were protecting against. The trap is that a join table answers a real requirement — integrity plus an indexed lookup — and answering a real requirement is what makes a wrong shape feel safe. **Adding integrity in the wrong shape removes a guarantee.**


**READ `mergeStateStatus` BEFORE YOU READ CHECKS.** Proposed by the Orders & Checkout Manager after nearly shipping a false green on #1513, sharpened by the Director after measuring every open PR. One command:

```
gh pr view <n> --json mergeStateStatus,mergeable
```

`DIRTY` / `CONFLICTING` means **the checks you are looking at do not describe what would land**, and it has TWO faces:

1. **The absence.** #1513 showed `Vercel: pass`, `Vercel Preview Comments: pass`, `Re-alias: skipping` — two passes and a skip, nothing red. The structural gate, admin boot, fidelity goldens and perf budget were not pending, not failing, not queued. **They had never fired.** A conflicting PR fires nothing, which this repo already records in `reference_ci_and_ratchet_traps` as "a CONFLICTING PR fires NOTHING while reporting all done". The manager caught it only because the gates were green implausibly early for a PR that normally takes a 16-minute structural gate.
2. **The stale green, which is worse.** Measured 2026-09-03: PR #1506 (`feat/finance-ledger-writer`) is `DIRTY` / `CONFLICTING` and shows a **complete green check set**, structural quality gate included, passing in 16m16s. Those runs measured a merge ref from before `main` moved. There is no absence to notice and nothing looks early. Related recorded lesson: `incident_rerun_replays_stale_merge_ref` — a stale PR needs a **rebase**, never a re-run.

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
