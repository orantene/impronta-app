-- Phase 2 final cutover: backfill `inquiry_talent` rows into `inquiry_participants`,
-- ensure every inquiry has a client participant, mark every inquiry `uses_new_engine=true`,
-- then drop the legacy `inquiry_talent` table (and the unused `guest_submit_inquiry` RPC
-- that only existed to write to it).
--
-- After this migration:
--   * Every inquiry is guaranteed to surface in talent-facing reads
--     (/talent/home, /talent/messages, /talent/inquiries) because those queries
--     exclusively use `inquiry_participants`.
--   * No code path reads `inquiry_talent`. Any remaining fallback branches can be
--     removed from the application layer.
--   * `uses_new_engine` remains a column for now (it is referenced by several RPC
--     guards), but it is uniformly TRUE — no v1 inquiries exist post-migration.

BEGIN;

-- ── 1. Backfill talent participants from legacy `inquiry_talent` ─────────────
-- For every (inquiry, talent_profile) pair in `inquiry_talent` that has no matching
-- active row in `inquiry_participants`, insert one. Uses `active` status so the
-- talent immediately shows up in their inbox / home "Recent requests".
INSERT INTO public.inquiry_participants (
  inquiry_id,
  talent_profile_id,
  user_id,
  role,
  status,
  sort_order,
  added_by_user_id,
  created_at,
  updated_at
)
SELECT
  it.inquiry_id,
  it.talent_profile_id,
  tp.user_id,
  'talent'::public.inquiry_participant_role,
  'active'::public.inquiry_participant_status,
  COALESCE(it.sort_order, 0),
  it.added_by_staff_id,
  NOW(),
  NOW()
FROM public.inquiry_talent it
LEFT JOIN public.talent_profiles tp ON tp.id = it.talent_profile_id
WHERE it.talent_profile_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.inquiry_participants ip
    WHERE ip.inquiry_id = it.inquiry_id
      AND ip.talent_profile_id = it.talent_profile_id
      AND ip.role = 'talent'
  );

-- ── 2. Ensure every inquiry has a client participant ────────────────────────
-- Legacy inquiries that predate the participants model may be missing the
-- client participant row that new engine actions rely on.
INSERT INTO public.inquiry_participants (
  inquiry_id,
  user_id,
  role,
  status,
  created_at,
  updated_at
)
SELECT
  i.id,
  i.client_user_id,
  'client'::public.inquiry_participant_role,
  'active'::public.inquiry_participant_status,
  NOW(),
  NOW()
FROM public.inquiries i
WHERE i.client_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.inquiry_participants ip
    WHERE ip.inquiry_id = i.id AND ip.role = 'client'
  );

-- ── 3. Flip every inquiry to the v2 engine ──────────────────────────────────
-- Guards like `IF inq.uses_new_engine IS NOT TRUE THEN RAISE EXCEPTION 'legacy_inquiry'`
-- will now never fire.
UPDATE public.inquiries
SET uses_new_engine = TRUE
WHERE uses_new_engine IS DISTINCT FROM TRUE;

-- ── 4. Drop the unused guest_submit_inquiry RPC ─────────────────────────────
-- The app submits inquiries directly via the public directory action
-- (web/src/app/(public)/directory/actions.ts), which inserts into
-- `inquiry_participants`. The RPC only exists because it wrote to
-- `inquiry_talent`; dropping it removes the last non-app dependency.
DROP FUNCTION IF EXISTS public.guest_submit_inquiry(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, DATE, TEXT, INT, TEXT, TEXT, TEXT, TEXT
);

DROP FUNCTION IF EXISTS public.guest_submit_inquiry(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, DATE, TEXT, INT, TEXT, TEXT
);

DROP FUNCTION IF EXISTS public.guest_submit_inquiry;

-- ── 5. Drop the legacy `inquiry_talent` table ───────────────────────────────
-- CASCADE also drops the old RLS policies (`inquiry_talent_select`,
-- `inquiry_talent_staff`, `inquiry_talent_insert_client`) and any indexes.
DROP TABLE IF EXISTS public.inquiry_talent CASCADE;

COMMIT;
