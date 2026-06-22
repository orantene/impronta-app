-- Card surface — RLS drift repair + dead directory RPC removal.
--
-- Apply with npm run db:push BEFORE merge (decoupled — no code depends on it compiling).
--
-- This migration closes two pieces of accumulated drift that the talent-card
-- canonicalisation work surfaced. Both are independent of any TypeScript that
-- needs to compile, so it ships on its own schema track.
--
-- (1) RLS-vs-app visibility drift on talent_has_public_roster.
--     The app gate web/src/lib/saas/talent-roster.ts filters the roster on
--     agency_visibility IN ('site_visible','featured') AND status = 'active'
--     AND talent_site_hidden = false. The SECURITY DEFINER function
--     public.talent_has_public_roster (migration 20260925000000) reproduces the
--     first two predicates but DROPPED the `talent_site_hidden = false` clause.
--     Result: a talent whose roster row is explicitly site-hidden still passes
--     the talent_profiles.talent_select_public RLS policy, so anon reads can
--     reach a profile the app considers hidden. This re-asserts the function
--     WITH the missing clause, preserving SECURITY DEFINER / STABLE /
--     search_path and the exact REVOKE/GRANT from the original migration.
--
-- (2) Dead RPC removal — public.api_directory_cards.
--     Verified zero .rpc('api_directory_cards') callers in web/src (the only
--     textual references are doc comments). Two overloads currently exist in
--     the remote DB (both re-created by 20260615211200): the keyset overload
--     (int, timestamptz, uuid, uuid[]) and the search/sort overload
--     (int, int, uuid[], text, text, text). Both are dropped here; DROP
--     FUNCTION withdraws every grant (anon/authenticated) with the object, and
--     DROP ... IF EXISTS keeps this idempotent / scratch-safe.

BEGIN;

-- (1) Re-assert talent_has_public_roster with the talent_site_hidden gate.
CREATE OR REPLACE FUNCTION public.talent_has_public_roster(p_talent_profile_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_talent_roster r
    WHERE r.talent_profile_id = p_talent_profile_id
      AND r.status = 'active'
      AND r.agency_visibility IN ('site_visible', 'featured')
      AND r.talent_site_hidden = false
  );
$$;

COMMENT ON FUNCTION public.talent_has_public_roster(uuid) IS
  'SECURITY DEFINER: true iff the talent has at least one active roster row '
  'with the public eye ON and the row not site-hidden. Used by '
  'talent_profiles.talent_select_public so the roster lookup does not re-enter '
  'RLS (prevents 42P17 mutual recursion with '
  'agency_talent_roster_talent_self_read). The talent_site_hidden gate keeps '
  'RLS in sync with the app gate in web/src/lib/saas/talent-roster.ts.';

REVOKE ALL ON FUNCTION public.talent_has_public_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talent_has_public_roster(uuid)
  TO anon, authenticated, service_role;

-- (2) Drop the dead api_directory_cards overloads (zero .rpc callers).
--     DROP FUNCTION removes the object and all of its grants in one step, so
--     no separate REVOKE is needed; IF EXISTS keeps each drop safe to re-run.
DROP FUNCTION IF EXISTS public.api_directory_cards(int, timestamptz, uuid, uuid[]);
DROP FUNCTION IF EXISTS public.api_directory_cards(int, int, uuid[], text, text, text);

COMMIT;
