-- W2-C — add per-tenant "show on home" flag for the public guest-chat launcher.
--
-- tenant_guest_chat_settings previously carried show_on_talent + show_on_directory
-- only; the launcher's home surface was keyed off show_on_directory, so an owner
-- could not control the homepage independently of the directory. This adds a
-- dedicated flag, defaults-ON (fail-open) to match every other surface flag so
-- existing tenants keep the launcher on their home page with no config change.
alter table public.tenant_guest_chat_settings
  add column if not exists show_on_home boolean not null default true;

comment on column public.tenant_guest_chat_settings.show_on_home is
  'Show the guest-chat launcher on the tenant home page (builder-authored home or legacy storefront). Defaults on; independent of show_on_directory.';
