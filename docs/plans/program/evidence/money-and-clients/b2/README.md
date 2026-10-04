# B2 — customer_id + ensureCustomer talent owner RLS

**Stage:** Money/Clients One Engine · Phase 1.3 / B2  
**Branch:** `cursor/mc-b2-customer-id-d350`  
**Migration:** `supabase/migrations/20261231286000_customers_owner_and_inquiry_booking_customer_id.sql`  
(Renumbered from `…285000…` because remote already had `20261231285000_customers_notes_column_privilege`.)

## What landed

| Change | Detail |
|---|---|
| `customers.owner_talent_profile_id` | Nullable FK → `talent_profiles`. Null = agency pool; set = talent-private. |
| Unique email/phone | Split agency vs owner indexes. Silent reuse = exact email of **same** owner + tenant. |
| `inquiries.customer_id` | Nullable FK → `customers`. |
| `agency_bookings.customer_id` | Nullable FK → `customers`. Unblocks `markBookingNoShow` select. |
| RLS | Staff of tenant see only `owner IS NULL`. Talent sees own `owner_talent_profile_id`. Platform admin sees all. Self-select unchanged. |
| `ensureCustomer` | Optional `ownerTalentProfileId`; match/insert scoped to that pool. |
| SQL twin | `ensure_customer_for_tenant(..., p_owner_talent_profile_id)`; `bookings_write_order` prefers inquiry/booking `customer_id` and stamps booking. |

## Writers wired

| Path | Behavior |
|---|---|
| `submitInquiry` → `linkInquiryCustomer` (covers `createInquiryFromIntent` + dock/website/forms) | After insert: `ensureCustomer` when email/phone present; stamps `inquiries.customer_id`. Owner set when exactly one talent with owning party `talent`. |
| WhatsApp `resolveInquiry` | Uses `matchCustomers` (exact phone/email); else `ensureCustomer` on phone; stamps `inquiries.customer_id`. Agency pool. |
| `createOwnSlotBooking` | Ensures when optional `contactEmail`/`contactPhone` present; **name-only skips** (no identity key). Owner = talent. |
| `convertOwnTalentHold` | Prefers `inquiry.customer_id` / contact; ensures when email/phone known; name-only skips. Owner = talent. |
| `ensureOrderShell` | Passes talent owner; also stamps `agency_bookings.customer_id`. |

## Name-only note

Manual calendar create (`create-slot`) and holds without inquiry contact still accept a display name alone. That path intentionally does **not** create a `customers` row — email or E.164 phone is required for identity.

## Gates

| Gate | Result |
|---|---|
| `npm run typecheck` | exit **0** |
| `npm run lint` | exit **0** |
| `npm run db:push` | **CLI failed:** `ProjectRefNotLinkedError` (no `supabase link` in this environment). |
| Remote apply | **Succeeded** via Supabase MCP (`execute_sql` + `apply_migration` chunks). Verified: owner + customer_id columns present; agency/owner email unique indexes present; `ensure_customer_for_tenant` nargs=6; `schema_migrations` row `20261231286000` recorded. |

## Out of scope (not B2)

- Phone-only UI suggestions (4.3 / E4)
- No-show rollup recompute (0.6)
- Hub tenant for solo talent bookings (decision 1 / later stage)
- Regenerating types via `supabase gen types` (hand-patched `database.types.ts`)
