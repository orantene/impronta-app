-- Phase 2 · SECURITY FIX — `admissions_mint_shortfall` leaked across tenants.
--
-- I shipped this view in `20261229000366` with a comment reading "Views run
-- with the definer's rights by default here, so no anon grant of any kind."
-- The first half is true. The conclusion I drew from it is backwards.
--
-- A view with `security_invoker` UNSET runs as its OWNER -- here `postgres` --
-- so it BYPASSES row-level security on the tables underneath it. `orders` and
-- `order_lines` are RLS-protected per tenant; the view is not. I then granted
-- SELECT on it to `authenticated`.
--
-- THE EFFECT: any signed-in user of ANY tenant could read every tenant's paid,
-- session-backed order lines -- order id, tenant id, session id, units sold.
-- Nothing errored. RLS on the base tables was doing its job and the view was
-- quietly standing outside it.
--
-- I reasoned about the definer's rights as an argument for withholding the ANON
-- grant, and stopped there, without asking what those same rights meant for the
-- grant I DID give. A correct premise, one step, wrong conclusion.
--
-- FOUND BY MEASURING PRIVILEGES RATHER THAN EXISTENCE, which is the Reservations
-- Manager's method: `has_table_privilege` across every object an area owns
-- rather than `to_regclass`. It has now caught issues across three areas, and
-- the reason it works is that a leak of this shape has NO symptom -- the view
-- returns rows, which is what a view is for.
--
-- THE FIX: `security_invoker = true`, so the view runs with the querying user's
-- rights and RLS applies to it exactly as it does to the tables. The staff-only
-- grant then means what it was always supposed to mean: staff of THIS tenant.

BEGIN;

ALTER VIEW public.admissions_mint_shortfall SET (security_invoker = true);

COMMENT ON VIEW public.admissions_mint_shortfall IS
  'Paid, session-backed order lines that minted fewer admissions than they sold -- what makes '
  'best-effort minting safe, because without it a failed mint is undetectable until a buyer is at a '
  'door with a receipt and no ticket. Rows expected = order_lines.units, NOT units * admits_per_unit: '
  'one VIP table for six is one admission of party_size 6. SECURITY INVOKER, and it must stay that '
  'way -- unset, a view runs as its owner and bypasses the RLS on orders and order_lines, which '
  'turned a staff-only grant into a cross-tenant read of every workspace''s sales.';

COMMIT;
