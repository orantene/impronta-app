-- The client trust ladder is EARNED, not sold. Take it out of the sellable catalog.
--
-- WHAT IT WAS DOING THERE
-- ───────────────────────
-- `product_packages` holds the things Tulala charges money for. Seeded into it
-- is a `family = 'client'` package with four tiers — Basic, Verified, Silver,
-- Gold — and six `product_features` rows describing them.
--
-- None of it is sellable, and none of it was ever meant to be. A client's trust
-- level is COMPUTED by `lib/client-trust/evaluator.ts` from two signals:
--   verified_at         → basic becomes verified
--   funded_balance_cents → verified becomes silver, then gold
-- There is no price, no Stripe product, and no code path that would charge for
-- one. The four tiers have zero `product_prices` rows between them, which is
-- exactly what you would expect of something nobody can buy.
--
-- WHY IT MATTERS
-- ──────────────
-- It renders in Platform Admin → Commerce → Catalog beside the real workspace
-- and talent ladders, as a package with no prices. To an operator that reads as
-- an unfinished product rather than a category error, and the obvious "fix" is
-- to give it prices — which would invent a product nobody designed. Worse, it
-- teaches the next person that the catalog is a grab bag rather than the answer
-- to "what do we sell".
--
-- DEACTIVATED, NOT DELETED
-- ────────────────────────
-- `is_active = false` rather than a DELETE, deliberately:
--
--   • It is reversible. If the trust ladder ever DOES become a paid product
--     (a paid verification, say), the tier ids and their history are still here.
--   • The feature rows carry authored copy describing each trust level, which
--     is worth keeping even though it is not selling anything.
--   • Deleting production rows to tidy a taxonomy is a poor trade: the risk is
--     permanent and the benefit is cosmetic.
--
-- `loadActivePrices` — every marketing surface — already filters on
-- `is_active`, so this removes the family from the customer-facing catalog
-- immediately. The admin catalog shows inactive packages by design, and now
-- shows this one correctly marked as not sold.

begin;

update public.product_packages
set is_active = false
where family = 'client'
  and is_active;

update public.product_tiers t
set is_active = false
from public.product_packages p
where t.package_id = p.id
  and p.family = 'client'
  and t.is_active;

comment on column public.product_packages.family is
  'workspace | talent | client. The `client` family is the EARNED trust ladder '
  '(see lib/client-trust/evaluator.ts), deactivated 2026-09-02 because it is '
  'not sellable and never was. Do not give it prices without a product '
  'decision that says clients can buy a trust level.';

commit;
