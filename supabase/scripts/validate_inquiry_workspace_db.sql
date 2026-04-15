-- One-off validation for inquiry workspace DB rules (run on branch DB after migrations).
-- Does not modify data. Review all rows returned; fix source data before production if any appear.
--
-- Run (example):
--   psql "$DATABASE_URL" -f supabase/scripts/validate_inquiry_workspace_db.sql
-- Or from repo root (loads web/.env.local; needs DATABASE_URL, DIRECT_URL, or SUPABASE_DB_URL):
--   npm run validate:inquiry-workspace-db --prefix web
-- That npm script uses `psql` when installed; if `psql` is missing (ENOENT), it runs the same
-- three checks via Node + `pg` (devDependency in web/). Exit 1 when any check returns rows (pg path only).
--
-- If any SELECT returns rows, record: query number (1–3), inquiry_id (and columns shown),
-- root cause, and the corrective SQL or engine fix. Rerun until all three queries return zero rows.

-- 1) Multiple "active" offers per inquiry (draft | sent | accepted)
SELECT inquiry_id, COUNT(*) AS active_offer_rows
FROM public.inquiry_offers
WHERE status IN ('draft', 'sent', 'accepted')
GROUP BY inquiry_id
HAVING COUNT(*) > 1
ORDER BY active_offer_rows DESC, inquiry_id;

-- 2) current_offer_id points to missing row or wrong inquiry
SELECT i.id AS inquiry_id, i.status AS inquiry_status, i.current_offer_id
FROM public.inquiries i
LEFT JOIN public.inquiry_offers o ON o.id = i.current_offer_id
WHERE i.current_offer_id IS NOT NULL
  AND (o.id IS NULL OR o.inquiry_id IS DISTINCT FROM i.id);

-- 3) Broken pairs that would fail enforce_inquiry_status_offer_pair (mirror trigger logic)
WITH o AS (
  SELECT id, inquiry_id, status FROM public.inquiry_offers
)
SELECT
  i.id AS inquiry_id,
  i.status::text AS inquiry_status,
  i.current_offer_id,
  o.status::text AS offer_status
FROM public.inquiries i
LEFT JOIN o ON o.id = i.current_offer_id
WHERE
  (i.current_offer_id IS NULL AND i.status::text IN ('offer_pending', 'approved', 'booked', 'converted'))
  OR (
    i.current_offer_id IS NOT NULL
    AND o.status IS NOT NULL
    AND o.status <> 'superseded'::public.inquiry_offer_status
    AND NOT (
      (o.status = 'draft' AND i.status::text IN (
        'reviewing', 'coordination', 'in_progress', 'waiting_for_client', 'talent_suggested'
      ))
      OR (o.status = 'sent' AND i.status::text = 'offer_pending')
      OR (o.status = 'accepted' AND i.status::text IN ('approved', 'booked', 'converted'))
      OR (o.status = 'rejected' AND i.status::text IN (
        'reviewing', 'coordination', 'in_progress', 'waiting_for_client', 'talent_suggested'
      ))
      OR (o.status = 'invalidated' AND i.status::text IN (
        'reviewing', 'coordination', 'in_progress', 'waiting_for_client', 'talent_suggested',
        'offer_pending', 'closed_lost'
      ))
    )
  );
