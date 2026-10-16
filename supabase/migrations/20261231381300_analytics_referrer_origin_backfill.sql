-- Backfill: reduce payload.referrer to its origin (scheme://host[:port]) on
-- view_site_page and view_talent_profile events (~712 rows, ~140 with a query
-- string). A non-http(s) value has the key removed. Touches ONLY
-- payload->'referrer'. Idempotent: rows already at origin form are skipped.
-- ~1k rows, single statement. PM applies after merge.
UPDATE public.analytics_events
SET payload = CASE
  WHEN payload->>'referrer' ~* '^https?://[^/?#]+'
    THEN jsonb_set(payload, '{referrer}', to_jsonb(substring(payload->>'referrer' from '(?i)^(https?://[^/?#]+)')))
  ELSE payload - 'referrer'
END
WHERE name IN ('view_site_page', 'view_talent_profile')
  AND payload ? 'referrer'
  AND (
    payload->>'referrer' IS DISTINCT FROM substring(payload->>'referrer' from '(?i)^(https?://[^/?#]+)')
  );
