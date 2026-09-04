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
];
