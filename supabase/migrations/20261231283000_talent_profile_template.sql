-- Per-TALENT profile-page template.
--
-- WHY. profile-view.tsx picks the profile template from
-- `template.profile-layout-family` in `agency_branding.theme_json`, which is
-- TENANT-level. The code's own comment calls it "Per-tenant choice of profile
-- page template", and that is exactly the limitation: on the Tulala hub, 94
-- talent profiles share one design, and giving one talent a different one means
-- repainting all of them. `?template=` exists but is a per-request QA override,
-- not a persisted choice.
--
-- This is a different surface from the Phase 0 theme gallery, which themes
-- talent SITES via talent_sites.theme_design_slug / theme_look_slug at
-- /t/site/<slug>. That model does not reach /t/<profileCode>. Confirmed with
-- the talent-website lane 2026-09-23 before adding a second one.
--
-- RESOLUTION ORDER after this lands:
--   ?template= (QA override)  ->  this column  ->  tenant token  ->  classic
--
-- NULL means "inherit the tenant's choice", which is today's behaviour exactly,
-- so this is additive: nothing changes for any existing profile until someone
-- sets it.
--
-- NOT CONSTRAINED TO AN ENUM ON PURPOSE. The set of templates lives in code
-- (`_shared/profile-template-dispatch.ts`), ships with the app, and changes
-- when a template is added — a CHECK constraint here would mean a migration
-- every time a designer adds a layout, and a value this database considers
-- valid could still name a template a given deploy does not have. The reader
-- validates against the shipped list and falls back to the tenant choice for
-- anything it does not recognise, so an unknown value degrades to today's
-- behaviour rather than to a blank page.

alter table public.talent_profiles
  add column if not exists profile_template text;

comment on column public.talent_profiles.profile_template is
  'Per-talent public profile template key (e.g. maison, noir, lumen, atelier, classic). '
  'NULL inherits the tenant''s template.profile-layout-family design token. '
  'Validated in code against the shipped template list; an unrecognised value '
  'falls back to the tenant choice rather than failing the render.';
