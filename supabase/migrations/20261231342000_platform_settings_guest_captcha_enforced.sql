-- Platform-wide guest booking captcha enforcement switch.
--
-- Default TRUE (safe): Continuar al pago / instant-book guests still must
-- complete hCaptcha/Turnstile when a captcha provider is configured.
-- HQ may temporarily set this FALSE for production testing from
-- /platform/admin/settings. Re-enable before real guest traffic / friend
-- handoff. Fail-closed on read errors in app code (treat as enforced).
alter table public.platform_settings
  add column if not exists guest_captcha_enforced boolean not null default true;

comment on column public.platform_settings.guest_captcha_enforced is
  'When true (default), guest instant-book / Continuar al pago enforces tenant/platform captcha. When false, HQ has temporarily disabled enforcement for testing — re-enable before launch.';
