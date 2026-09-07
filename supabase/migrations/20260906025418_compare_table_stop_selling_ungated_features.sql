-- Compare table: features nothing gates become "included on every plan".
--
-- WHY THESE ROWS MOVE RATHER THAN GET DELETED
-- ───────────────────────────────────────────
-- Each feature below EXISTS and every plan already has it. Nothing in the
-- codebase gates any of them:
--
--   Multi-locale                  `max_locales` is null (unlimited) on every
--                                 workspace plan and NO code reads it.
--   WhatsApp notifications        the channel is implemented and wired into
--                                 the dispatcher with no plan check.
--   Priority email routing        no implementation of any kind.
--   Roles & permissions           roles.ts has no plan predicate.
--   Audit log retention           one global cap, no per-plan window.
--   The six watermark rows        no plan or capability gate in lib/media
--                                 or lib/branding.
--
-- So the page was selling upgrades that buy nothing, and implying a downgrade
-- for anyone below the tier. Deleting the rows would hide features customers
-- actually have; marking them "roadmap" would be false, they shipped. Moving
-- them to included-everywhere is the only option that is true today.
--
-- If any of these later becomes a paid gate: BUILD THE GATE FIRST, then move
-- the row back. The drift guard's UNBACKED list is the queue for that work.
-- Ratified by the CEO 2026-09-05 under the owner's standing order.
--
-- NOT IN SCOPE, DELIBERATELY. Three rows claim capabilities that do not exist
-- at all -- hub SSO "On request", Data export "API access", Analytics
-- "Full + export API". "Included on every plan" is the WRONG fix for a feature
-- nobody built; you cannot include SSO everywhere when it exists nowhere.
-- Those need their own decision: delete, or state a real roadmap.
--
-- Data-only. No schema change, so nothing 500s if this is not applied.

begin;

-- 1. Boolean rows: withheld from a plan that already has the feature.
update public.product_features f
set included = true, updated_at = now()
from public.product_tiers t
where f.tier_id = t.id
  and t.slug in ('free', 'studio', 'agency', 'hub')
  and f.included = false
  and f.label in (
    'Multi-locale',
    'WhatsApp inquiry notifications',
    'Priority email routing',
    'Roles & permissions',
    'Audit log',
    'Logo watermark on photos',
    'Watermark position, opacity & size',
    'Per-photo watermark override',
    'Baked watermark exports (PDF / lookbook)',
    'Bulk watermark apply',
    'Photo usage tracking',
    'Workspace media gallery'
  );

-- 2. Value tiers that encode an unenforced difference.
-- "30 days / 90 days / Full history" and "Basic / Built-in / Advanced + custom"
-- describe a gradient no code implements. Clearing the value keeps the feature
-- listed as included without claiming a tier we do not deliver.
update public.product_features f
set value_text = null, updated_at = now()
from public.product_tiers t
where f.tier_id = t.id
  and t.slug in ('free', 'studio', 'agency', 'hub')
  and f.label in ('Audit log', 'Roles & permissions')
  and f.value_text is not null;

-- 3. Refuse to commit a half-applied move.
-- A migration that silently matched nothing is the failure mode here: these
-- are label-matched updates, and a renamed label would make this a no-op that
-- still reports success.
do $$
declare
  still_withheld int;
  stale_values int;
begin
  select count(*) into still_withheld
  from public.product_features f
  join public.product_tiers t on t.id = f.tier_id
  where t.slug in ('free', 'studio', 'agency', 'hub')
    and f.included = false
    and f.label in (
      'Multi-locale', 'WhatsApp inquiry notifications', 'Priority email routing',
      'Roles & permissions', 'Audit log', 'Logo watermark on photos',
      'Watermark position, opacity & size', 'Per-photo watermark override',
      'Baked watermark exports (PDF / lookbook)', 'Bulk watermark apply',
      'Photo usage tracking', 'Workspace media gallery'
    );

  select count(*) into stale_values
  from public.product_features f
  join public.product_tiers t on t.id = f.tier_id
  where t.slug in ('free', 'studio', 'agency', 'hub')
    and f.label in ('Audit log', 'Roles & permissions')
    and f.value_text is not null;

  if still_withheld > 0 then
    raise exception
      'compare-table move incomplete: % row(s) still withheld. A label was renamed, or a tier slug changed.',
      still_withheld;
  end if;

  if stale_values > 0 then
    raise exception
      'compare-table move incomplete: % unenforced value tier(s) remain.',
      stale_values;
  end if;
end $$;

commit;
