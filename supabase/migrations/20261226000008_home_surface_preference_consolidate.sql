-- Home surface preference — collapse two columns that meant the same thing.
--
-- 20261226000007 added `profiles.home_surface_preference` for auth routing.
-- `public.user_prefs.preferred_surface` already existed and already held
-- 'talent' | 'workspace' for the in-shell surface toggle. Same question, same
-- answer, two rows — which is exactly the kind of split that drifts: a user
-- toggles to Workspace in the shell, logs out, and login sends them back to
-- /talent because routing read the other column.
--
-- `profiles` wins, for one concrete reason: middleware resolves the landing
-- surface on every request via `ensure_profile_for_current_user()`, which
-- `RETURNS public.profiles`, so a column there costs nothing to read. Routing
-- on `user_prefs` would add a per-request query to the hot path that Sprint 2.1
-- spent real effort removing.
--
-- `user_prefs.preferred_surface` is NOT dropped here. It is still selected by
-- `loadUserPrefs`, and a column drop would break a running deployment mid-roll.
-- It becomes a deprecated mirror this migration stops feeding; the drop is a
-- separate cleanup once no code reads it.

BEGIN;

-- Backfill: an existing explicit toggle choice is a real answer and must not be
-- lost. Only fills nulls, so a preference already written to `profiles` (by the
-- chooser shipped alongside this) is authoritative and never overwritten.
UPDATE public.profiles AS p
SET home_surface_preference = up.preferred_surface
FROM public.user_prefs AS up
WHERE up.user_id = p.id
  AND p.home_surface_preference IS NULL
  AND up.preferred_surface IN ('talent', 'workspace');

COMMENT ON COLUMN public.user_prefs.preferred_surface IS
  'DEPRECATED 2026-08-30. Superseded by profiles.home_surface_preference, which auth routing reads for free via ensure_profile_for_current_user(). Backfilled into profiles by migration 20261226000008. Do not add new writers; kept only until no code selects it.';

COMMENT ON COLUMN public.profiles.home_surface_preference IS
  'Which dashboard this account lands on when more than one is valid: workspace | talent | client. A UI preference with no capability meaning — capability stays on membership + capability (L10). Canonical since 20261226000008; a stale value is harmless because /admin resolves real membership and redirects anyone without one.';

COMMIT;
