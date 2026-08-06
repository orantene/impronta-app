-- Wave 6.3 — platform switch for the storefront admin quick bar.
--
-- Third switch on the same `platform_settings` singleton card as the workspace
-- FAB and the first-run tour (20261110150000). Unlike those two this one
-- defaults TRUE: the quick bar already shipped visible in #1001, so defaulting
-- it off would silently remove a live feature from every tenant the moment the
-- column landed. HQ opts OUT here, it does not opt in.
--
-- Timestamp note: this repo's migration filenames are sequential, not wall
-- clock. A `date -u` stamp (2026-08-06) would sort BEFORE the already-applied
-- 2026-11-11 migrations and push out of order, so this continues the local
-- sequence instead.
alter table public.platform_settings
  add column if not exists workspace_quick_bar_enabled boolean not null default true;
