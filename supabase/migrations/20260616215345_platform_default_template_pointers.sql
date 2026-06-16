-- Builder-Lab "Default surfaces" — platform DEFAULT template pointers.
--
-- The platform DEFAULT storefront + talent profile are resolved today by a
-- RESERVED SLUG in `builder_templates` (`__platform_default_storefront__` /
-- `__platform_default_talent_profile__`). This adds an OPTIONAL pointer so a
-- super-admin can point the default at ANY published template from the Builder
-- Lab → Default surfaces tab without re-seeding the reserved row, and toggle the
-- talent freeform default without a deploy (it was env-only: DEFAULT_TALENT_FREEFORM_PROFILE).
--
-- ADDITIVE + fallback-safe. All three columns are nullable / default-false, so
-- with no pointer set + the toggle false the render path is byte-identical to
-- today (reserved slug → built-in code tree). The FKs are ON DELETE SET NULL so
-- archiving / deleting a template never breaks the singleton — the pointer just
-- clears and the resolver falls back to the reserved slug.
alter table public.platform_settings
  add column if not exists default_storefront_template_id uuid
    references public.builder_templates(id) on delete set null,
  add column if not exists default_talent_template_id uuid
    references public.builder_templates(id) on delete set null,
  add column if not exists default_talent_freeform_enabled boolean not null default false;

comment on column public.platform_settings.default_storefront_template_id is
  'Builder Lab → Default surfaces: published template the platform DEFAULT storefront renders. NULL → falls back to the reserved slug __platform_default_storefront__, then DefaultStorefrontBody.';
comment on column public.platform_settings.default_talent_template_id is
  'Builder Lab → Default surfaces: published template the platform DEFAULT talent freeform profile renders. NULL → falls back to the reserved slug __platform_default_talent_profile__, then the built-in code tree.';
comment on column public.platform_settings.default_talent_freeform_enabled is
  'Builder Lab → Default surfaces: when true, talents with no published Max site render the freeform default. OR-ed with the legacy env flag DEFAULT_TALENT_FREEFORM_PROFILE.';
