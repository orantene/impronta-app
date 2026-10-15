-- TUL-443: talents that still hold taxonomy terms their workspace switched off.
-- NOT APPLIED. The PM runs `npm run db:push` after reviewing the read-only report:
--   node --env-file=.env.local scripts/report-disabled-taxonomy-holders.mjs
--
-- Conservative by design (no migrate target was named on the card):
--   * drop the orphan row ONLY when the same talent still holds another term that
--     is enabled for that workspace, so nobody ends up with no service at all;
--   * if the dropped row was the primary, the earliest remaining row becomes primary;
--   * talents with NO other enabled term are left untouched and listed via NOTICE
--     (they need a decision: migrate target, via clear-disabled-taxonomy-holders.mjs
--     or a follow-up migration).
-- Rows are scoped to the switching tenant (tenant_id = tenant, or legacy NULL for
-- active roster members of that tenant). Other tenants' assignments are untouched.

DO $$
DECLARE
  r RECORD;
  dropped int := 0;
  stranded int := 0;
BEGIN
  FOR r IN
    SELECT tpt.ctid AS row_ctid,
           tpt.talent_profile_id,
           tpt.taxonomy_term_id,
           tpt.is_primary,
           s.tenant_id AS ws_tenant
      FROM public.talent_profile_taxonomy tpt
      JOIN public.agency_taxonomy_settings s
        ON s.taxonomy_term_id = tpt.taxonomy_term_id
       AND s.is_enabled = false
      JOIN public.agency_talent_roster ro
        ON ro.tenant_id = s.tenant_id
       AND ro.talent_profile_id = tpt.talent_profile_id
       AND ro.status = 'active'
     WHERE tpt.tenant_id = s.tenant_id OR tpt.tenant_id IS NULL
  LOOP
    IF EXISTS (
      SELECT 1
        FROM public.talent_profile_taxonomy o
       WHERE o.talent_profile_id = r.talent_profile_id
         AND o.taxonomy_term_id <> r.taxonomy_term_id
         AND NOT EXISTS (
           SELECT 1 FROM public.agency_taxonomy_settings x
            WHERE x.tenant_id = r.ws_tenant
              AND x.taxonomy_term_id = o.taxonomy_term_id
              AND x.is_enabled = false
         )
    ) THEN
      DELETE FROM public.talent_profile_taxonomy d
       WHERE d.ctid = r.row_ctid;
      dropped := dropped + 1;
      IF r.is_primary THEN
        UPDATE public.talent_profile_taxonomy p
           SET is_primary = true
         WHERE p.ctid = (
           SELECT o.ctid FROM public.talent_profile_taxonomy o
            WHERE o.talent_profile_id = r.talent_profile_id
              AND NOT EXISTS (
                SELECT 1 FROM public.agency_taxonomy_settings x
                 WHERE x.tenant_id = r.ws_tenant
                   AND x.taxonomy_term_id = o.taxonomy_term_id
                   AND x.is_enabled = false)
              AND NOT EXISTS (
                SELECT 1 FROM public.talent_profile_taxonomy q
                 WHERE q.talent_profile_id = r.talent_profile_id AND q.is_primary)
            LIMIT 1);
      END IF;
    ELSE
      stranded := stranded + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'TUL-443: dropped % orphan row(s); % row(s) left (talent has no other enabled term, needs a migrate target)', dropped, stranded;
END $$;
