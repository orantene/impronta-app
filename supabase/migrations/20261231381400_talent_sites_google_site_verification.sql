-- Per-talent Google Search Console HTML-tag verification token.
-- Additive: one nullable text column. RLS is row-level on talent_sites
-- (talent_sites_owner_select / _update), so the new column inherits it; the
-- app writes it through the talent-self guard. Idempotent.
alter table public.talent_sites
  add column if not exists google_site_verification text;

alter table public.talent_sites
  drop constraint if exists talent_sites_google_site_verification_shape;
alter table public.talent_sites
  add constraint talent_sites_google_site_verification_shape
  check (google_site_verification is null or google_site_verification ~ '^[A-Za-z0-9_-]{1,100}$');
