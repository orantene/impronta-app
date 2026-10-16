-- Ledger: one claim per group id, so two projection runs can never both post the same group.
--
-- WHY A CLAIM TABLE AND NOT A UNIQUE INDEX ON ledger_entries: a group is SEVERAL rows (one per leg),
-- so group_id cannot be unique there, and two legs of one group can legitimately look identical
-- (two lanes with the same fee). ledger_entries is append-only (an UPDATE/DELETE trigger refuses any
-- change), so a per-leg counter cannot be back-filled either. A separate table whose PRIMARY KEY is
-- the group id gives the same guarantee without touching the ledger: the writer claims the group
-- (INSERT, the PK refuses a second claim), writes the legs, then marks the claim complete. A claim
-- that is never completed (the run died mid-write) goes stale and can be taken over, so a crash
-- cannot block a group forever.
--
-- ADDITIVE ONLY: one new table, back-filled from the groups that already exist. No existing table,
-- column, policy or trigger changes. PM: db:push before the PR that uses it merges.
--
-- Written 2026-10-09 (docs/plans/ledger-entries-decision-2026-10-09.md, decision A).

CREATE TABLE IF NOT EXISTS public.ledger_group_claims (
  group_id     UUID PRIMARY KEY,
  -- The projection's own key (e.g. booking_payment:<txn id>); the group kind for back-filled rows.
  group_key    TEXT NOT NULL,
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.ledger_group_claims IS
  'One row per ledger group id (PRIMARY KEY): the atomic guard that stops two projection runs from both posting a group. completed_at is set when the legs are written; an unfinished claim older than ten minutes may be taken over. Added 2026-10-09.';

-- Existing groups are complete by definition: claim them so a re-run cannot claim them again.
INSERT INTO public.ledger_group_claims (group_id, group_key, claimed_at, completed_at)
SELECT group_id, MIN(group_kind), MIN(recorded_at), MIN(recorded_at)
FROM public.ledger_entries
GROUP BY group_id
ON CONFLICT (group_id) DO NOTHING;

ALTER TABLE public.ledger_group_claims ENABLE ROW LEVEL SECURITY;

-- Service role only (the projection). No policy: authenticated and anon see and write nothing.
REVOKE ALL ON public.ledger_group_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_group_claims TO service_role;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.ledger_group_claims', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ledger_group_claims', 'INSERT') THEN
    RAISE EXCEPTION 'ledger_group_claims: a revoke did not take';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.ledger_group_claims', 'INSERT') THEN
    RAISE EXCEPTION 'ledger_group_claims: service_role cannot claim groups, the projection would record nothing';
  END IF;
END $$;
