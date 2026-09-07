-- Compare table: remove claims for capabilities that do not exist.
--
-- Ruled by the CEO 2026-09-05: "nothing built is neither included nor roadmap,
-- and a roadmap line is a promise we have not decided to make."
--
-- ONE ROW IS DELETED. TWO ARE NOT, AND HERE IS WHY
-- ────────────────────────────────────────────────
-- The ruling named three rows. Only one of them is a feature that does not
-- exist:
--
--   SSO (SAML, Google, Okta)   DELETED. There is no SAML, Okta or SSO
--                              implementation anywhere in the tree. The only
--                              non-marketing occurrence of "SSO" is an
--                              unrelated cross-domain session comment.
--
-- The other two name features that DO exist and work. Only a suffix is false:
--
--   Data export                CSV export is real (see the translations export
--                              route). Only hub's "API access" is false --
--                              there is no /api/v1.
--   Analytics & funnels        analytics are real (channel-performance,
--                              conversion-events). Only hub's "export API" is
--                              false.
--
-- Deleting those two rows would HIDE WORKING FEATURES from the page, which is
-- the same failure the previous migration avoided by moving ungated rows to
-- included-everywhere rather than deleting them. So the false claim is removed
-- and the feature stays listed.
--
-- Their value tiers are cleared rather than rewritten. "Basic / Full / Full +
-- export API" and "CSV / CSV + JSON / API access" are gradients no code
-- enforces, so replacing one false value with another unverified one would
-- swap a known-false claim for an unchecked one.
--
-- Data-only. No schema change.

begin;

-- 1. The feature that does not exist.
delete from public.product_features f
using public.product_tiers t
where f.tier_id = t.id
  and f.label = 'SSO (SAML, Google, Okta)';

-- 2. Real features whose value tier claims an API that does not exist.
update public.product_features f
set value_text = null, updated_at = now()
from public.product_tiers t
where f.tier_id = t.id
  and f.label in ('Data export', 'Analytics & funnels')
  and f.value_text is not null;

-- 3. Refuse to commit a half-applied change.
do $$
declare
  sso_left int;
  api_claims int;
begin
  select count(*) into sso_left
  from public.product_features
  where label = 'SSO (SAML, Google, Okta)';

  select count(*) into api_claims
  from public.product_features
  where label in ('Data export', 'Analytics & funnels')
    and value_text is not null;

  if sso_left > 0 then
    raise exception 'SSO rows remain: %. A label was renamed.', sso_left;
  end if;
  if api_claims > 0 then
    raise exception 'API-claiming value tiers remain: %.', api_claims;
  end if;
end $$;

commit;
