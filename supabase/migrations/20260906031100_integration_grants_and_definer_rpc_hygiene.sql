-- Integration tables and SECURITY DEFINER RPC grant hygiene.
-- IT Integration and Security Director, 2026-09-06.
--
-- Facts by privilege query on production BEFORE this migration (never by
-- reading migrations):
--   tenant_integration_secrets, tenant_integrations, tenant_social_feed_items
--     relacl: anon=rxtm, authenticated=arwdDxtm (default grants, never revoked).
--     Every reader in web/src runs as service_role (repository.ts service(),
--     feed-cache.ts admin, platform/admin/email/* admin, refresh-social-tokens
--     admin). Secrets table policy DENIES authenticated outright.
--   Nine SECURITY DEFINER functions executable by anon, none referencing
--   auth.uid(). Five hold EXECUTE through PUBLIC ("=X"), so a plain
--   `REVOKE FROM anon` would be a no-op on them; four hold an explicit anon
--   grant. Callers, by client role:
--     list_table_columns()                 service_role only (lint script)
--     usage_audit_metrics()                service_role only (cron)
--     match_talent_embeddings(vector,int)  service_role only (vector-retrieval)
--     generate_profile_code()              service_role only (4 admin actions)
--     find_taxonomy_assignment_drift()     NO caller in the repo
--     refresh_talent_discover_index()      service_role (cron) + AUTHENTICATED
--                                          staff (admin-discover-exposure.ts,
--                                          user session client). Keep authenticated.
--     ensure_guest_session(text), guest_add_saved_talent, guest_remove_saved_talent
--                                          anon by design: the guest fallback
--                                          client on /t/<code> is the cookie
--                                          client with no session. Keep anon,
--                                          but make the grant explicit instead
--                                          of inherited from PUBLIC.
--
-- Rule (incident_revoke_from_anon_noop_public_grant): revoke FROM PUBLIC first,
-- then from the named roles, then grant back explicitly, then ASSERT with
-- has_*_privilege. A green migration line is not evidence; the DO block is.


-- Tables ---------------------------------------------------------------------
revoke all on table public.tenant_integration_secrets from public, anon, authenticated;
revoke all on table public.tenant_integrations        from public, anon;
revoke all on table public.tenant_social_feed_items   from public, anon;
grant all on table public.tenant_integration_secrets to service_role;
grant all on table public.tenant_integrations        to service_role;
grant all on table public.tenant_social_feed_items   to service_role;

-- Service-role-only RPCs -----------------------------------------------------
revoke execute on function public.list_table_columns()                              from public, anon, authenticated;
revoke execute on function public.usage_audit_metrics()                             from public, anon, authenticated;
revoke execute on function public.match_talent_embeddings(public.vector, integer)          from public, anon, authenticated;
revoke execute on function public.generate_profile_code()                           from public, anon, authenticated;
revoke execute on function public.find_taxonomy_assignment_drift()                  from public, anon, authenticated;
grant  execute on function public.list_table_columns()                              to service_role;
grant  execute on function public.usage_audit_metrics()                             to service_role;
grant  execute on function public.match_talent_embeddings(public.vector, integer)          to service_role;
grant  execute on function public.generate_profile_code()                           to service_role;
grant  execute on function public.find_taxonomy_assignment_drift()                  to service_role;

-- Staff + service RPC --------------------------------------------------------
revoke execute on function public.refresh_talent_discover_index() from public, anon;
grant  execute on function public.refresh_talent_discover_index() to authenticated, service_role;

-- Guest RPCs: same privilege, explicit grant ---------------------------------
revoke execute on function public.ensure_guest_session(text)                         from public;
revoke execute on function public.guest_add_saved_talent(text, uuid)                from public;
revoke execute on function public.guest_remove_saved_talent(text, uuid)             from public;
grant  execute on function public.ensure_guest_session(text)                         to anon, authenticated, service_role;
grant  execute on function public.guest_add_saved_talent(text, uuid)                to anon, authenticated, service_role;
grant  execute on function public.guest_remove_saved_talent(text, uuid)             to anon, authenticated, service_role;

-- Assert ---------------------------------------------------------------------
do $$
declare
  bad text := '';
begin
  if has_table_privilege('anon', 'public.tenant_integration_secrets', 'SELECT') then bad := bad || ' secrets:anon'; end if;
  if has_table_privilege('authenticated', 'public.tenant_integration_secrets', 'SELECT') then bad := bad || ' secrets:authenticated'; end if;
  if has_table_privilege('anon', 'public.tenant_integrations', 'SELECT') then bad := bad || ' integrations:anon'; end if;
  if has_table_privilege('anon', 'public.tenant_social_feed_items', 'SELECT') then bad := bad || ' feed_items:anon'; end if;
  if not has_table_privilege('service_role', 'public.tenant_integration_secrets', 'SELECT') then bad := bad || ' secrets:service_role_lost'; end if;
  if not has_table_privilege('authenticated', 'public.tenant_integrations', 'SELECT') then bad := bad || ' integrations:authenticated_lost'; end if;

  if has_function_privilege('anon', 'public.list_table_columns()', 'EXECUTE') then bad := bad || ' list_table_columns:anon'; end if;
  if has_function_privilege('authenticated', 'public.list_table_columns()', 'EXECUTE') then bad := bad || ' list_table_columns:authenticated'; end if;
  if has_function_privilege('anon', 'public.usage_audit_metrics()', 'EXECUTE') then bad := bad || ' usage_audit_metrics:anon'; end if;
  if has_function_privilege('anon', 'public.match_talent_embeddings(public.vector, integer)', 'EXECUTE') then bad := bad || ' match_talent_embeddings:anon'; end if;
  if has_function_privilege('anon', 'public.generate_profile_code()', 'EXECUTE') then bad := bad || ' generate_profile_code:anon'; end if;
  if has_function_privilege('anon', 'public.find_taxonomy_assignment_drift()', 'EXECUTE') then bad := bad || ' find_taxonomy_assignment_drift:anon'; end if;
  if has_function_privilege('anon', 'public.refresh_talent_discover_index()', 'EXECUTE') then bad := bad || ' refresh_talent_discover_index:anon'; end if;
  if not has_function_privilege('authenticated', 'public.refresh_talent_discover_index()', 'EXECUTE') then bad := bad || ' refresh_talent_discover_index:authenticated_lost'; end if;
  if not has_function_privilege('service_role', 'public.generate_profile_code()', 'EXECUTE') then bad := bad || ' generate_profile_code:service_role_lost'; end if;
  if not has_function_privilege('anon', 'public.ensure_guest_session(text)', 'EXECUTE') then bad := bad || ' ensure_guest_session:anon_lost'; end if;
  if not has_function_privilege('anon', 'public.guest_add_saved_talent(text, uuid)', 'EXECUTE') then bad := bad || ' guest_add_saved_talent:anon_lost'; end if;

  if bad <> '' then
    raise exception 'grant hygiene assertion failed:%', bad;
  end if;
end $$;

