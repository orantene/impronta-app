# Menu — workspace-owned sellable items

> Audited rewrite. See [`menu-plan-audit.md`](./menu-plan-audit.md) for every claim
> checked and every change from the original design conversation plan.

## Context

Today **only a person can own something sellable.** `talent_offerings.talent_profile_id`
is `NOT NULL`, and a DB CHECK (`inquiry_offer_line_items_talent_required`) forces every
priced line to name a talent. The commission RPC raises
`house lane not supported in v1`.

That blocks: Jesus (chef) selling pizza/empanadas as products; Alejandra selling
agency packages; restaurants selling tables/set menus.

**Fix:** one catalogue, two owners. `talent_offerings` gains `owner_kind`; line items
gain an XOR owner (talent **or** tenant); a `house` participant role attributes
commission to the workspace. The menu rides the existing inquiry spine (flows A/B/C),
not a new one.

**Out of scope:** capacity / `units_consumed`, e-commerce inventory/shipping pipeline,
self-serve checkout without seller approval path for request-mode items. Capacity must
later exclude `calendar_lane='order'` from slot accounting.

**Naming:** UI label **"Menu"** (operator-editable display string only). Code/routes/DB
stay `menu` / `menu_board`. Calendar lane: **"Orders"**. No "cart"/"buyer" in UI copy.
No em dashes in user-facing copy.

**Payout decision:** stamp `booking_sub_type='service'` so payout is immediate. The
existing product-fulfilment UI cannot release a house order (no `booking_talent` rows).

## Architecture

1. **One catalogue, two owners** — `owner_kind ('talent'|'workspace')`, nullable
   `talent_profile_id` under exclusivity CHECK. Presentation display layer is largely
   owner-agnostic; CTA dispatch and public talent queries are **not** — fix those.
2. **XOR payee on every priced line** — talent XOR `owner_tenant_id`, never both/neither.
3. **`house` participant role** — fail-safe (existing filters are role=talent|client|coordinator).
   Do **not** fake a talent profile. Do **not** null `participant_id` on the snapshot PK.
4. **`resolveBookingCommissions` needs zero edits** — feed `talent_cost_cents: 0` and
   `sellerOfRecord: "workspace"`. Characterization tests only.
5. **Builder node, not section** — registry is frozen; work goes to `builder-node/`.

## Phase 1 — Money spine (hard exit: proven by tests, no UI)

Migrations start at **`20261226000000`** (remote already applied through `20261225000000`).

| File | Change |
|---|---|
| `20261226000000_offer_line_owner.sql` | `owner_tenant_id`; drop talent-required CHECK; XOR CHECK |
| `20261226000001_house_role.sql` | `ALTER TYPE … ADD VALUE 'house'` only |
| `20261226000002_house_participant_shape.sql` | shape CHECK + unique house per inquiry/party |
| `20261226000003_offering_owner_kind.sql` | nullable talent_profile_id, owner_kind, exclusivity, CASCADE tenant FK, staff SELECT RLS |
| `20261226000004_commission_house_lane.sql` | commission context v2 + convert exclude house + recompute from line items |
| `20261226000005_calendar_lane.sql` | `agency_bookings.calendar_lane` |

**Do not** skip the requirement-group seed in `createInquiry` — current shortfall RPC
already allows talent-less convert; skipping breaks house participant NOT NULL.

TS: XOR + `owner_tenant_id === ctx.tenantId` + force `talent_cost === 0` for house;
add `owner_tenant_id` to the line-item insert; `ensureOfferTalentsOnLineup` creates
house participants; post-convert assertion that revenue equals offer total (compensating
delete on mismatch). Hand-edit `database.types.ts`.

## Phase 2 — Admin editor

Workspace page **Menu** for both `talent` and `business` workspace types.
Parameterize `TalentOfferingsManager` with `OfferingOwner` (do not fork).
`authorizeForWorkspace` filters **both** `tenant_id` and `owner_kind='workspace'`.

## Phase 3 — Public menu + ordering

Client-only pre-submit island (`sessionStorage` key `impronta.menu-order.<tenantId>` —
never say "cart" in UI). Atomic server action re-resolves every offering. New helper
`menuOrderToOfferLineSeeds` (never reuse `offeringToOfferLineSeed`). Hard-fail if guest
client user id is null. `menu_board` builder node with all wiring points including the
8-term early-return guard and all 6 `loadBuilderNodeDataSources` call sites. Fetcher
uses `.eq("tenant_id").eq("owner_kind","workspace")` — **not** roster gating.

## Phase 4 — Calendar lane

Stamp `starts_at = ends_at = <finalized instant>` so the existing filter sees the row.
Use `calendar_lane='order'`, not `booking_sub_type`. Add `"order"` kind + "Orders"
prefix. Add `"confirmed"` to the green tone branch. Static test: menu-order path writes
neither `talent_holds` nor `talent_bookings`.

## Phase 5 — Templates

Keep decorative restaurant menu. Label gallery tiles **"Menu — display only"** vs
**"Menu — orderable"**. Add orderable designs carrying `menu_board`.

## Verification

Gates before every commit: `tsc --noEmit` + `lint` (real exit codes).
`test:size-ratchet` after large files. Wire new tests into curated `package.json` lanes.
`npm run db:push` before merge.

Full gate before finish: tsc, lint, size-ratchet, test:money, test:builder,
test:tenant-isolation, test:phase1-i18n.
