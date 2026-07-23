-- W14 — persist the talent Day-1 checklist dismissal per user.
--
-- The first-session checklist on the talent Today page was dismissible only
-- for the lifetime of the React tree: every reload brought it back, even for
-- talents who had finished onboarding months ago. This column makes the
-- dismissal durable, mirroring the existing first_run_toggle_tip_seen flag.
alter table public.user_prefs
  add column if not exists talent_checklist_dismissed boolean not null default false;

comment on column public.user_prefs.talent_checklist_dismissed is
  'True once the talent dismissed the Day-1 first-session checklist on /talent/today.';
