-- Platform-wide kill switch for the point of sale.
--
-- Fourth switch on the `platform_settings` singleton, same card family as
-- the workspace FAB / tour (20261110150000) and the storefront quick bar
-- (20261111040000). Defaults FALSE like the FAB and tour: the POS mode
-- vocabulary (lib/pos/modes.ts) and every mode's screen are new, unshipped
-- surface, so nothing should appear in any workspace until HQ deliberately
-- opts a first tenant in from /platform/admin/settings.
alter table public.platform_settings
  add column if not exists workspace_pos_enabled boolean not null default false;
