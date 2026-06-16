-- WS-A A7 — shell template kinds.
--
-- Add two values to the `builder_template_kind` enum so a Builder Lab template
-- can target the shared SITE SHELL header / footer. These kinds surface only in
-- the shell-surface "+" gallery (gated by the per-surface `allowedTabs`), never
-- in the page builders' tabs.
--
-- Additive + idempotent. Existing kinds and the `gallery_tab` text column are
-- untouched. NOTHING about live rendering depends on these values — the shell
-- RENDER flag (`ENABLE_SITE_SHELL`) and the shell EDIT flag
-- (`ENABLE_SITE_SHELL_EDIT`) both stay OFF by default, so this is dormant
-- schema until an operator opts a tenant in.
--
-- Applied to the linked remote project (pluhdapdnuiulvxmyspd) via the Supabase
-- MCP `apply_migration` (recorded in supabase_migrations.schema_migrations as
-- version 20260616033557). This file mirrors that apply so the local migrations
-- directory tracks it.

ALTER TYPE public.builder_template_kind ADD VALUE IF NOT EXISTS 'shell_header';
ALTER TYPE public.builder_template_kind ADD VALUE IF NOT EXISTS 'shell_footer';
