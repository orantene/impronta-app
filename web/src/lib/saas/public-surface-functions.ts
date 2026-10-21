/**
 * The ONLY database functions the app reaches with an anon-key client.
 *
 * This list is a security boundary, not documentation. Two checks read it and
 * they enforce opposite directions, which is the point:
 *
 *   rls-grant-drift.static.test.ts   nothing ON this list may be REVOKED from
 *                                    anon — doing so silently blanks a public
 *                                    surface for logged-out visitors.
 *   scripts/check-anon-function-grants.mjs
 *                                    nothing OFF this list may HOLD an anon
 *                                    EXECUTE grant.
 *
 * Only the first of those existed until 2026-09-03, and that is exactly how
 * four holes got in. The guard asserted the direction the team was already
 * careful about — "did we break a guest surface?" — and never the direction
 * that bit us: "is something exposed that should not be?"
 *
 * WHAT WENT WRONG WITHOUT THE SECOND CHECK. `replace_talent_languages` was
 * SECURITY DEFINER, anon-executable, and its body was
 *
 *     DELETE FROM talent_languages WHERE talent_profile_id=$1 AND tenant_id=$2;
 *     INSERT ... SELECT from the caller's jsonb
 *
 * with no auth.uid(), no ownership check and no tenant check. An
 * unauthenticated caller could wipe and rewrite any talent's languages, and
 * profile ids are printed on public directory pages. Alongside it,
 * `refresh_talent_skill_metrics_all()` took NO arguments and opened with
 * `TRUNCATE public.talent_skill_metrics` — one anon call, repeatable, emptying
 * a live table. None of the four was ever on this list. Every one was already
 * a violation of a contract this repo maintained but did not enforce.
 *
 * ADDING A NAME HERE WIDENS THE ATTACK SURFACE. Do it only when the app
 * genuinely calls the function with `createPublicSupabaseClient`, and when the
 * function defends itself in its own body — a bearer session key, an ownership
 * check, something. A grant is not authorization; it is only the outer door.
 */
export const PUBLIC_SURFACE_FUNCTIONS: readonly string[] = [
  "ensure_guest_session",
  "guest_add_saved_talent",
  "guest_list_saved_talent_ids",
  "guest_remove_saved_talent",
  "talent_public_site_for_profile_code",
  // Public `/t/<code>` alias resolver — retired vanity codes → live TAL-<digits>.
  // Read-only SECURITY DEFINER; returns id + live code + is_alias only.
  "resolve_talent_profile_code",
  // Events & Ticketing: `/r/<code>` (the ticket receipt) calls this with the
  // public client for logged-out holders standing at a door. Defends itself:
  // keyed on an opaque receipt code, withholds `holder_email`, returns
  // `token_version` and never a mintable token, and a foreign tenant's code
  // is a 404. Listed so a future anon REVOKE fails a test instead of silently
  // blanking every receipt on a night — the direction that guard exists for.
  "receipt_for_code",
  // Edge host resolution (proxy.ts -> host-context.ts) runs with the ANON key, so
  // a logged-out visitor on a talent custom domain or <slug>.tulala.digital can
  // be routed at all. Both are read-only SECURITY DEFINER lookups that defend
  // themselves in their own body: they return a row ONLY for an active domain /
  // published site of a publicly visible talent with a current Web Office, and
  // only public facts (profile id, site slug, demo flag, the talent's own ACTIVE
  // primary custom domain). Neither writes. Listed so an anon REVOKE fails a
  // test instead of blanking every talent site, and so the live grant check
  // (check-anon-function-grants.mjs) stops treating the grants as exposure.
  "talent_site_domain_lookup",
  "talent_site_subdomain_lookup",
  // TUL-1591 (a): the edge leaver redirect (host-context.ts `isFormerRosterMemberCode`) asks,
  // with the ANON key, whether a /t/<code> on a workspace host is a former member. Read-only
  // STABLE SECURITY DEFINER; returns a boolean only (no row, id or date). Held migration
  // 20261231422800_talent_left_workspace_tul1591.sql.
  "talent_left_workspace",
];

/**
 * RLS policy helpers that anon legitimately keeps EXECUTE on (TUL-1013 re-audit,
 * 2026-10-18). These are NOT called by the app with an anon client. They are
 * called by Postgres while it evaluates a row policy that applies to the anon
 * role (`TO public` or `TO anon`) on a table anon can read; without EXECUTE the
 * whole query for a logged-out visitor fails with "permission denied for
 * function". Evidence is the staging `pg_policy` read (fxlank, read-only,
 * 2026-10-18): count of policies applying to anon that call the function.
 *
 *   is_active_staff_of_tenant       20  cms_pages, cms_page_sections, cms_sections, ...
 *   is_agency_staff                 81  profiles, staff_permissions, taxonomy_terms, locations, ...
 *   is_platform_admin               39  platform_commission_config, plan_trial_offers, ...
 *   is_staff_of_tenant             131  agencies, agency_branding, agency_memberships, ...
 *   is_talent_profile_owner         17  talent_sites, talent_site_domains, talent_press_items, ...
 *   talent_has_public_roster         1  talent_profiles
 *   talent_is_site_visible_anywhere  1  talent_profile_field_values (+ directory_facet_scalar_base_ids)
 *   talent_profile_has_max           3  talent_site_domains (+ talent_site_domain_lookup)
 *   talent_profile_has_pro_or_max    8  talent_press_items, talent_profile_embeds, ...
 *
 * All nine are read-only STABLE boolean checks keyed on auth.uid() or a row id;
 * they return nothing but a boolean. ADDING A NAME HERE needs the same evidence
 * (a policy that applies to anon and calls it); otherwise it belongs in a
 * REVOKE migration, not on this list. `check-anon-function-grants.mjs` accepts
 * these in addition to PUBLIC_SURFACE_FUNCTIONS.
 */
export const POLICY_HELPER_FUNCTIONS: readonly string[] = [
  "is_active_staff_of_tenant",
  "is_agency_staff",
  "is_platform_admin",
  "is_staff_of_tenant",
  "is_talent_profile_owner",
  "talent_has_public_roster",
  "talent_is_site_visible_anywhere",
  "talent_profile_has_max",
  "talent_profile_has_pro_or_max",
];
