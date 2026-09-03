# Menu plan audit

Audit of the design at `~/.claude/plans/polished-growing-wombat.md` against
`origin/main` (commit `90a85226f` at branch creation). Every load-bearing claim
was checked in the real codebase. Blunt verdicts only.

## Claim register

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| a | `line_item_talent_required` exists and forces every priced line to name a talent | **VERIFIED** | Constraint `inquiry_offer_line_items_talent_required` in `supabase/migrations/20261029000000_line_item_talent_required.sql`. TS mirror at `inquiry-engine-offers.ts:819-820`. |
| b | `engine_load_commission_context` raises "house lane not supported in v1"; persist failure triggers compensating DELETE | **VERIFIED** | Latest body is `20261109000000_hub_referral_lane.sql:155` (not `20261124000000`, which only REVOKEs). Compensating delete + inquiry restore at `inquiry-engine-booking.ts:331-395`. Instant-book has a separate compensating path that does **not** restore the inquiry. |
| c | `engine_inquiry_group_shortfall` blocks talent-less convert because `quantity_required = max(len, 1) = 1` | **WRONG** | Function was rewritten in `20261016074247_unify_multi_talent_approval_set.sql`. It no longer reads stored `quantity_required`. It counts talent participants that have a line item on the current offer. Zero talent participants → `offered_count = 0` → filtered out → returns `[]`. CreateInquiry seed of a group with `quantity_required = 1` is **harmless** for convert. Skipping the seed would **break** house participant insert because `requirement_group_id` is NOT NULL (`20260534000000`). |
| d | `engine_convert_to_booking` recomputes `total_client_revenue` from `booking_talent`; excluding house lines without fixing recompute → $0 | **PARTIALLY TRUE** | Recompute from `booking_talent` is real (`20260533000000`). But today's INSERT has **no talent filter** and `booking_talent.talent_profile_id` is nullable, so house lines would land with null talent and revenue would be correct by accident. Still exclude house lines (20+ readers assume talent rows) and re-base the recompute onto `inquiry_offer_line_items` in the **same** statement. |
| e | Sections registry frozen; failure routes to `builder-node/` | **VERIFIED** | `registry-freeze.static.test.ts:209-216`. |
| f | `page-designs/restaurant.ts` ships a decorative menu | **VERIFIED** | Bound to `menu_items` collection repeater; no money. |
| g | `loadCalendarEvents` filters `.not("starts_at","is",null)`; convert never sets `starts_at` | **VERIFIED** | `calendar.ts` data-bridge; convert INSERT omits `starts_at`. |
| h | `QUANTITY_UNITS` excludes `event`/`flat_package` | **VERIFIED** | `offerings-offer.ts:21`. `offeringToOfferLineSeed` has **zero production callers** (test-only). |
| i | `isProductPayoutDeferred` defers ALL product payouts until `shipped_at` | **PARTIALLY TRUE** | Product-only (`fulfillment.ts:71` returns false for services). A UI exists (`TalentOrdersQueue`) but is talent-surface and keyed to `booking_talent` — cannot release a house order. Decision: stamp `booking_sub_type='service'`. |
| j | `resolveBookingCommissions` is correct for house (`talent_cost=0`, `sellerOfRecord=workspace`) | **VERIFIED** (wording fixed) | No divide-by-zero. Platform still takes `platformFeeCents`; workspace does **not** take "everything". No `house` branch needed in `commission.ts`. |
| k | Callers of `loadBuilderNodeDataSources` | **PARTIALLY TRUE** | 6 call sites in 5 files. Early-return guard is at lines **172-182** (8 terms), not ~156. |

## Additional findings (plan missed)

1. **Migration numbering collision.** Plan proposed `20261222000000-*`. `origin/main` already has `20261222000000_relationship_commission_overrides.sql` and `20261225000000_offering_require_account_to_book.sql`. Remote has applied through `20261225000000`. Reusing a version is silently skipped by `db push`. **Start at `20261226000000`.**
2. **`database.types.ts` must change.** `inquiry_participant_role` is a Postgres ENUM; generated TS is `"client"\|"coordinator"\|"talent"`. Hand-apply minimal deltas (no full regen — shared remote has unmerged branch schema).
3. **`verify:server-actions`** — every export in a `"use server"` file must be async.
4. **Owner-read RLS** on all four offering tables resolves via `talent_profiles.user_id`. Workspace-owned rows need `is_staff_of_tenant` policies.
5. **`talent_offerings_public_read` has no tenant predicate** — isolation rests on the fetcher `.eq("tenant_id")`.
6. **Presentation not owner-agnostic at dispatch** — `OfferingRequestDetail.talentProfileId` is non-nullable; `loadPublicOfferingsForProfile` filters by talent id.
7. **Two `CalendarEventKind` unions** (data-bridge vs talent UI). Plan assumed one.
8. **`CalendarListViews.tsx` has no duration/0px hazard** — claim deleted.
9. **Skipping requirement-group seed would break house inserts** — see claim c. Seed stays. Register entry 13 replaced with a pin test.
10. **Capacity forward-compat:** order lane writes neither `talent_holds` nor `talent_bookings`. When capacity lands, exclude `calendar_lane='order'`. Not built here.

## Changes made to the plan (and why)

| Change | Reason |
|---|---|
| Do **not** skip requirement-group seed | Current shortfall RPC already allows talent-less convert; skipping breaks NOT NULL on `requirement_group_id` for house participants |
| Migrations start at `20261226000000` | Avoid silent skip against applied remote versions |
| Stamp `booking_sub_type='service'` | Product deferral + talent-only fulfilment UI would strand workspace payouts |
| Re-base convert revenue recompute **and** exclude house from `booking_talent` in one statement | Exclude alone creates $0; leave alone leaks null-talent into review/fulfilment readers |
| Hand-edit `database.types.ts` | Enum + columns must compile; full regen pulls unmerged schema |
| Drop CalendarListViews 0px step | Claim false |
| Pin shortfall no-block behaviour with a test | Guard against future RPC edits re-introducing the false gate |
| Gallery tile disambiguation mandatory | Decorative restaurant menu already named "Menu" |
| Wire tests into curated `package.json` lanes | New `*.test.ts` files do not auto-run |
| Add staff SELECT RLS on offerings + children | Owner-read via `user_id` cannot see workspace rows |

## Silent-failure register (revised)

1. Homepage early-return misses `menu_board` → empty 200
2. Non-homepage `loadBuilderNodeDataSources` callers → blank interior / editor
3. Reuse `offeringToOfferLineSeed` → 2 pepperoni bills as 1
4. Exclude house from `booking_talent` without recompute fix → $0 revenue
5. `booking_sub_type='product'` without fulfilment path → workspace never paid
6. `ensureGuestClientByEmail` null → zero approvals, order stalls
7. `ensureOfferTalentsOnLineup` early return skips house → snapshot has nothing
8. Read `talent_cost_total_cents` on house line instead of forcing 0 → shrinks workspace payout
9. `ALTER TYPE … ADD VALUE` same file as first use → half-applied migration
10. Workspace guards only `.eq("tenant_id")` → edit talent-owned offerings
11. `tenant_id ON DELETE SET NULL` vs new CHECK → 500 on agency delete
12. Silently drop unresolvable offering ids → partial order
13. ~~Requirement-group gate~~ → **DELETED**; replaced by pin that shortfall returns `[]` for talent-less inquiries
14. Two "Menu" gallery tiles → restaurant builds decorative one, zero orders
15. **NEW:** forget `database.types.ts` hand-edit → tsc fails on `'house'`
16. **NEW:** sync helper exported from `"use server"` file → production "Loading…"
17. **NEW:** migration version collision → `db push` skips, prod 500s
