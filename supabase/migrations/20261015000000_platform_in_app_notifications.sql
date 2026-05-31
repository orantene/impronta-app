-- Platform-scoped (tenant-less) in-app notifications.
--
-- Platform alerts (new workspace / over-quota / signup-failed) are dispatched
-- with tenant_id = NULL and target super_admins. Until now the in-app channel
-- DROPPED them (user_notifications.tenant_id was NOT NULL), so they only ever
-- reached super_admins by email. This relaxes the column + widens the surface
-- enum so those rows persist and the Tulala HQ console can surface them.
--
-- No new RLS needed: user_notifications RLS is user-scoped
-- (user_id = auth.uid()), NOT tenant-scoped, so a super_admin reads their own
-- null-tenant rows through the existing `user_notifications_select_self` policy.
-- Existing tenant-scoped readers filter `tenant_id = <id>`, so null-tenant rows
-- never leak into a workspace surface.

alter table public.user_notifications
  alter column tenant_id drop not null;

alter table public.user_notifications
  drop constraint if exists user_notifications_surface_check;

alter table public.user_notifications
  add constraint user_notifications_surface_check
  check (surface in ('workspace', 'talent', 'client', 'platform'));

comment on column public.user_notifications.tenant_id is
  'Owning tenant. NULL = platform-scoped (Tulala HQ) notification for a super_admin; readable via the user-scoped RLS policy, excluded from tenant-scoped readers.';
