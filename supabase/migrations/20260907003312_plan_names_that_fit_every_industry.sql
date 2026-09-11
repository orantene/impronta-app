-- Ledger reconciliation (defects-close, 2026-09-11; D-014 / D-103, "the
-- from-zero replay, four historical files").
--
-- Production's ledger records this version with no statements stored and no
-- file in the tree. The file was recovered from git: commit 7a3cccafa on the
-- unmerged branch `feat/plan-names-that-fit-every-industry`, pushed to
-- production by hand on 2026-09-07. Production's `product_tiers` carries its
-- effect today (website=Site, studio=Team, agency=Business, both taglines).
-- The body below is that file verbatim. It is value-matched, so it is a
-- no-op wherever it has run; on a database with no tiers (the isolated
-- branch has zero `product_tiers` rows) it touches nothing and its check
-- passes. NOTE for the owner: the code half of that commit (plan-catalog.ts,
-- plan-tiers.ts, en/es messages) is NOT on main; main still labels these
-- tiers Website / Studio / Agency while production data says Site / Team /
-- Business. That is recorded in docs/plans/program/defects.md, not fixed here.
--
-- Plan names stop naming a customer type.
--
-- El Paisa is a parrilla in Glew. Its dashboard told it that it was on the
-- Agency plan, because `plan_tier` is 'agency' and the label never consulted
-- `workspace_type`, which is correctly 'business'. We sell "Shopify for what
-- you do" to restaurants, studios, agencies and independents, and the top plan
-- was named after one of them.
--
-- WHY RENAME RATHER THAN LABEL BY workspace_type
-- ----------------------------------------------
-- The pricing page has no workspace_type. A logged-out visitor cannot be given
-- a type-specific label, so labelling by type would create TWO naming systems:
-- bought as "Agency" on the pricing page, called something else on the
-- dashboard. That is worse than the defect, on the one surface where the name
-- does commercial work.
--
-- THE LADDER, WHICH IS NOW TRUE FOR EVERY INDUSTRY
-- ------------------------------------------------
--   Free      5 people                                  (unchanged)
--   Site      no roster, your own domain, 2 languages   was Website
--   Team      up to 15 people                           was Studio
--   Business  unlimited people, own domain, white-label was Agency
--   Network   several workspaces                        (unchanged)
--
-- How many people you list, and whether you get your own domain. True for a
-- restaurant, a photo studio and a modelling agency alike.
--
-- SLUGS NEVER MOVE. `product_tiers.slug` and `agencies.plan_tier` are stable
-- keys; only what a human reads changes. Stripe product records are NOT touched
-- here: those names appear on a customer's invoice and in their billing portal,
-- which is the owner's act, not a side effect of a migration.

begin;

update public.product_tiers set name = 'Site',     updated_at = now() where slug = 'website' and name = 'Website';
update public.product_tiers set name = 'Team',     updated_at = now() where slug = 'studio'  and name = 'Studio';
update public.product_tiers set name = 'Business', updated_at = now() where slug = 'agency'  and name = 'Agency';

-- The taglines named industries too, which is the same defect in prose.
update public.product_tiers
set tagline = 'Up to 15 people. The full pipeline.', updated_at = now()
where slug = 'studio' and tagline = 'Solo studios and small agencies. The full pipeline.';

update public.product_tiers
set tagline = 'Unlimited people, your own domain, white-label.', updated_at = now()
where slug = 'agency' and tagline = 'Full agencies. Unlimited roster, white-label.';

-- Refuse a half-applied rename. These are value-matched updates: a name edited
-- elsewhere first would make this a silent no-op that still reports success.
do $$
declare stale int;
begin
  select count(*) into stale from public.product_tiers
   where (slug = 'website' and name <> 'Site')
      or (slug = 'studio'  and name <> 'Team')
      or (slug = 'agency'  and name <> 'Business');
  if stale > 0 then
    raise exception 'plan rename incomplete: % tier(s) still carry the old name', stale;
  end if;
end $$;

commit;
