-- D5.3 — Cross-tenant fan-out, slice 3: per-owning-party offer
-- acceptance rollup.
--
-- D5.1 + D5.2 split participant + message RLS by frozen owning_party.
-- This slice gives the UI the OBSERVABLE shape of that split: a per-
-- owning-party rollup of who has accepted, declined, or is still
-- pending on the current offer.
--
-- inquiry_approvals.participant_id already references inquiry_participants,
-- so we can JOIN through to get owning_party_id without schema changes.
-- One SQL function returns the per-tenant counts in a single round-trip.
--
-- Spec: web/docs/discover-and-unified-inquiry-2026-05-14.md §3.4 + §3.7
--   "2 of 3 confirmed · 1 pending Hub Berlin"
--   "All confirmed — ready to issue offer"
--
-- D5.1 / D5.2 are forward-compat (single-tenant world unaffected). Same
-- here: in a single-tenant inquiry, the result reduces to one row with
-- the workspace tenant + N accepted / pending / declined.

BEGIN;

-- ─── Helper: acceptance_summary_for_offer(offer_id) ──────────────────────
-- Returns one row per distinct owning_party on the offer with the
-- accepted / pending / declined counts and the derived per-party status.
-- The derived status follows the spec §3.4 vocabulary:
--   * 'all_accepted'   — every talent on this party row accepted
--   * 'all_declined'   — every talent on this party row declined
--   * 'mixed'          — some accepted, some not
--   * 'all_pending'    — nobody has decided yet
--   * 'partial'        — at least one accept + at least one pending (no decline)

CREATE OR REPLACE FUNCTION public.acceptance_summary_for_offer(p_offer_id UUID)
RETURNS TABLE (
  owning_party_type TEXT,
  owning_party_id UUID,
  talent_count INT,
  accepted_count INT,
  pending_count INT,
  declined_count INT,
  derived_status TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH per_party AS (
    SELECT
      p.owning_party_type,
      p.owning_party_id,
      COUNT(*)::INT AS talent_count,
      COUNT(*) FILTER (WHERE COALESCE(a.status::text, 'pending') = 'accepted')::INT AS accepted_count,
      COUNT(*) FILTER (WHERE COALESCE(a.status::text, 'pending') = 'pending')::INT AS pending_count,
      COUNT(*) FILTER (WHERE COALESCE(a.status::text, 'pending') = 'rejected')::INT AS declined_count
    FROM public.inquiry_participants p
    LEFT JOIN public.inquiry_approvals a
      ON a.participant_id = p.id
     AND a.offer_id = p_offer_id
    WHERE p.role = 'talent'
      AND p.owning_party_id IS NOT NULL
      AND p.inquiry_id = (
        SELECT inquiry_id FROM public.inquiry_offers WHERE id = p_offer_id
      )
    GROUP BY p.owning_party_type, p.owning_party_id
  )
  SELECT
    owning_party_type,
    owning_party_id,
    talent_count,
    accepted_count,
    pending_count,
    declined_count,
    CASE
      WHEN accepted_count = talent_count                              THEN 'all_accepted'
      WHEN declined_count = talent_count                              THEN 'all_declined'
      WHEN pending_count  = talent_count                              THEN 'all_pending'
      WHEN declined_count > 0 AND accepted_count + declined_count = talent_count
        THEN 'mixed'
      WHEN accepted_count > 0 AND declined_count = 0 AND pending_count > 0
        THEN 'partial'
      ELSE 'mixed'
    END AS derived_status
  FROM per_party
  ORDER BY owning_party_type, owning_party_id;
$$;

COMMENT ON FUNCTION public.acceptance_summary_for_offer IS
  'D5.3: per-owning-party rollup of inquiry_approvals on a given offer. Used by admin shell + client lineup for per-tenant status pills. Returns talent + accepted + pending + declined counts and a derived_status string. Pending counts include participants with no approval row yet (LEFT JOIN with COALESCE to pending).';

GRANT EXECUTE ON FUNCTION public.acceptance_summary_for_offer(UUID) TO authenticated;

-- ─── Helper: lineup_status_summary(inquiry_id) ──────────────────────────
-- Top-level rollup for the lineup banner ("2/3 confirmed" / "All
-- confirmed — ready to issue offer"). Reads the inquiry's
-- current_offer_id and delegates to acceptance_summary_for_offer.

CREATE OR REPLACE FUNCTION public.lineup_status_summary(p_inquiry_id UUID)
RETURNS TABLE (
  total_talents INT,
  total_accepted INT,
  total_pending INT,
  total_declined INT,
  derived_label TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_offer AS (
    SELECT current_offer_id FROM public.inquiries WHERE id = p_inquiry_id
  ),
  rollup AS (
    SELECT
      SUM(talent_count)::INT  AS total_talents,
      SUM(accepted_count)::INT AS total_accepted,
      SUM(pending_count)::INT  AS total_pending,
      SUM(declined_count)::INT AS total_declined
    FROM public.acceptance_summary_for_offer(
      (SELECT current_offer_id FROM current_offer)
    )
  )
  SELECT
    COALESCE(total_talents, 0)  AS total_talents,
    COALESCE(total_accepted, 0) AS total_accepted,
    COALESCE(total_pending, 0)  AS total_pending,
    COALESCE(total_declined, 0) AS total_declined,
    CASE
      WHEN COALESCE(total_talents, 0) = 0
        THEN 'No lineup yet'
      WHEN total_accepted = total_talents
        THEN 'All confirmed — ready to book'
      WHEN total_accepted + total_declined = total_talents AND total_declined > 0
        THEN total_accepted::TEXT || ' of ' || total_talents::TEXT || ' confirmed · ' || total_declined::TEXT || ' declined'
      WHEN total_pending = total_talents
        THEN 'Offer sent · awaiting response'
      ELSE total_accepted::TEXT || ' of ' || total_talents::TEXT || ' confirmed · '
        || total_pending::TEXT || ' pending'
        || CASE WHEN total_declined > 0 THEN ' · ' || total_declined::TEXT || ' declined' ELSE '' END
    END AS derived_label
  FROM rollup;
$$;

COMMENT ON FUNCTION public.lineup_status_summary IS
  'D5.3: top-level lineup rollup for an inquiry. Reads current_offer_id and aggregates across owning parties. Returns total counts + a human-readable derived_label suitable for direct rendering ("2 of 3 confirmed · 1 declined").';

GRANT EXECUTE ON FUNCTION public.lineup_status_summary(UUID) TO authenticated;

COMMIT;
