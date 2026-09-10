-- The role control's refusal, and the drift behind it.
-- Isolated branch, before the repair migration:
select pg_get_constraintdef(oid) from pg_constraint
 where conrelid='public.agency_memberships'::regclass and conname='agency_memberships_role_check';
-- OUTPUT (branch, built from this repository's migrations):
--   CHECK (role = ANY (ARRAY['owner','admin','coordinator','editor','viewer','hub_moderator','platform_reviewer']))
-- OUTPUT (production pluhdapdnuiulvxmyspd, READ ONLY, same query):
--   CHECK (role = ANY (ARRAY['owner','admin','manager','editor','viewer','hub_moderator','platform_reviewer']))
-- The code names the role `manager` everywhere (lib/access/roles.ts, lib/saas/tenant.ts,
-- team-management VALID_ROLES, the People role select). The dev log of the click:
--   [team-management.changeTeamMemberRole.update] new row for relation "agency_memberships"
--   violates check constraint "agency_memberships_role_check" | code=23514
--   [people.setRole] Couldn't update role.
-- Repair: supabase/migrations/20261231031547_agency_memberships_role_check_manager.sql,
-- applied to the branch with execute_sql plus a schema_migrations row (version 20261231031547).
-- After: check-migrations-applied OK, 795 local migrations all applied; the same click wrote role=manager.
