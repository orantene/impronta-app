-- Commerce truth pass — correct the plan claims stored in the database.
--
-- Companion to the code-side corrections in the same PR. Three classes of fix,
-- all of them "the database says something the product does not do":
--
--   1. product_features — the PUBLIC /pricing compare table. Two seat cells
--      contradicted the enforced caps IN OPPOSITE DIRECTIONS: Free advertised
--      1 seat where `PLAN_LIMITS.max_team_seats` grants 2, and Agency advertised
--      "Up to 8" where the enforced value is unlimited and the live Stripe
--      product description a buyer reads at checkout says "Unlimited roster and
--      team". This is the exact failure `plan-seat-caps.ts` was written to end;
--      that module fixed the code paths and left the marketing table behind.
--
--   2. plan_trial_offers — the admin-editable trial CTA. Studio's subtext sold
--      "widgets and API access". `plan_tier_caps` has Studio at
--      embed_widgets=false / api_access=false, and there is no public API in the
--      product to grant. Portfolio's headline still said "Max", the internal
--      tier slug, rather than the customer-facing plan name.
--
--   3. agencies.talent_seat_limit — one live tenant on the `agency` plan
--      carried a seat limit of 5. Agency is unlimited (NULL). The roster gate
--      reads the column, not the plan, so this tenant would have been refused
--      its sixth profile while on an unlimited plan.
--
-- Every statement is idempotent and scoped by value as well as by key, so
-- re-running cannot clobber a later deliberate edit.

begin;

-- ── 1. Public compare table ──────────────────────────────────────────────────

-- Free: enforced max_team_seats = 2.
update public.product_features f
set value_text = '2'
from public.product_tiers t
join public.product_packages p on p.id = t.package_id
where f.tier_id = t.id
  and p.family = 'workspace'
  and t.slug = 'free'
  and f.category = 'team_access'
  and f.label = 'Seats'
  and f.value_text = '1';

-- Agency: enforced max_team_seats = NULL (unlimited).
update public.product_features f
set value_text = 'Unlimited'
from public.product_tiers t
join public.product_packages p on p.id = t.package_id
where f.tier_id = t.id
  and p.family = 'workspace'
  and t.slug = 'agency'
  and f.category = 'team_access'
  and f.label = 'Seats'
  and f.value_text = 'Up to 8';

-- ── 2. Trial CTA copy ────────────────────────────────────────────────────────

update public.plan_trial_offers
set cta_subtext = 'Add your roster, split commissions, and coordinate bookings with your team.'
where audience = 'workspace'
  and plan_key = 'studio'
  and cta_subtext like '%API access%';

update public.plan_trial_offers
set cta_headline = 'Try Portfolio free for 14 days'
where audience = 'talent'
  and plan_key = 'talent_portfolio'
  and cta_headline like '%Max%';

-- ── 3. Seat limit that contradicts its plan ─────────────────────────────────

-- Agency and Network are unlimited; NULL is the "no cap" sentinel that
-- checkRosterSeatAvailability reads. Scoped to rows that actually disagree.
update public.agencies
set talent_seat_limit = null
where plan_tier in ('agency', 'network')
  and talent_seat_limit is not null;

commit;
