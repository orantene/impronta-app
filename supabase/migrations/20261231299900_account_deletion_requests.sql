-- Self-serve account deletion (legal plan item 3.1) + FK fixes so deleting a
-- user can never fail half way.
--
-- 1. public.account_deletion_requests
--    One row per request. A user asks, waits 14 days (grace, cancellable),
--    then the cron executor (/api/cron/process-account-deletions) anonymizes
--    their data and deletes the auth user. Blockers (future bookings, held
--    payouts, money owed) are recorded on the row; the request stays open and
--    simply does not execute until they clear.
--    user_id deliberately has NO foreign key: the row must outlive the auth
--    user as the record that the deletion happened (pseudonymous id only).
--    Service-role only: RLS on, NO policies (same pattern as
--    talent_translation_cache). Users read and write it only through server
--    actions that check the session.
--
-- 2. FK fixes. Deleting auth.users cascades to public.profiles. Any FK to
--    either table without ON DELETE CASCADE / SET NULL makes that delete fail
--    for every user who ever touched the referencing table:
--      inquiry_coordinators.user_id        ON DELETE RESTRICT (and part of the PK)
--      inquiry_action_log.actor_user_id    ON DELETE RESTRICT
--      talent_bookings.created_by_user_id  NO ACTION
--      talent_holds.created_by_user_id     NO ACTION
--      workspace_talent_commission_overrides.{requested_by,reviewed_by,set_by}_user_id NO ACTION
--      channel_connections.consented_by    NO ACTION
--    And two columns are NOT NULL with ON DELETE SET NULL, which fails the
--    same way (the SET NULL violates the NOT NULL):
--      inquiry_attachments.uploaded_by
--      talent_representation_requests.requested_by
--    All become nullable + ON DELETE SET NULL. History rows survive with a
--    null actor ("Deleted user" in the UI).
--
--    inquiry_coordinators.user_id is part of the composite primary key, and a
--    PK column cannot be null. The PK moves to a surrogate id; the
--    (inquiry_id, user_id) pair keeps a plain UNIQUE index, which is what every
--    `ON CONFLICT (inquiry_id, user_id)` in the coordinator triggers and RPCs
--    arbitrates against, so they keep working unchanged.
--
-- 3. Money rows survive. client_balance_ledger.user_id was ON DELETE CASCADE
--    to auth.users: deleting a client would erase their deposit/refund ledger,
--    which must be kept (5 years, anonymized). It becomes nullable + SET NULL.
--    booking_transactions already SET NULLs payer_user_id / created_by; its
--    booking_id is ON DELETE CASCADE and is NOT changed here (booking deletion
--    semantics stay as they are). The deletion executor never deletes
--    bookings or inquiries; it anonymizes them.
--
-- Constraint names are looked up from the catalog rather than assumed, so the
-- migration is correct even where a table was created with a non-default name.

-- ─── helper: re-point one FK column to ON DELETE SET NULL ────────────────────
CREATE OR REPLACE FUNCTION pg_temp.fk_set_null(
  p_table   regclass,
  p_column  text,
  p_target  regclass
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_con  text;
  v_tbl  text := p_table::text;
BEGIN
  FOR v_con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = p_table
      AND c.confrelid = p_target
      AND array_length(c.conkey, 1) = 1
      AND a.attname = p_column
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', v_tbl, v_con);
  END LOOP;

  EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', v_tbl, p_column);
  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE SET NULL',
    v_tbl,
    left(replace(v_tbl, 'public.', '') || '_' || p_column || '_fkey', 63),
    p_column,
    p_target::text
  );
END;
$$;

-- ─── 2a. inquiry_coordinators: surrogate PK, then nullable user_id ────────────
ALTER TABLE public.inquiry_coordinators
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

DO $$
DECLARE
  v_pk text;
BEGIN
  SELECT conname INTO v_pk
  FROM pg_constraint
  WHERE conrelid = 'public.inquiry_coordinators'::regclass AND contype = 'p';

  -- Only swap when the PK is still the composite one.
  IF v_pk IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conname = v_pk AND c.conrelid = 'public.inquiry_coordinators'::regclass
      AND a.attname = 'id'
  ) THEN
    -- The UNIQUE index must exist before the PK goes, so ON CONFLICT
    -- (inquiry_id, user_id) always has an arbiter.
    CREATE UNIQUE INDEX IF NOT EXISTS inquiry_coordinators_inquiry_user_unique
      ON public.inquiry_coordinators (inquiry_id, user_id);
    EXECUTE format('ALTER TABLE public.inquiry_coordinators DROP CONSTRAINT %I', v_pk);
    ALTER TABLE public.inquiry_coordinators ADD CONSTRAINT inquiry_coordinators_pkey PRIMARY KEY (id);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS inquiry_coordinators_inquiry_user_unique
  ON public.inquiry_coordinators (inquiry_id, user_id);

SELECT pg_temp.fk_set_null('public.inquiry_coordinators', 'user_id', 'public.profiles');

-- ─── 2b. the other blockers ───────────────────────────────────────────────────
SELECT pg_temp.fk_set_null('public.inquiry_action_log', 'actor_user_id', 'auth.users');
SELECT pg_temp.fk_set_null('public.talent_bookings', 'created_by_user_id', 'auth.users');
SELECT pg_temp.fk_set_null('public.talent_holds', 'created_by_user_id', 'auth.users');
SELECT pg_temp.fk_set_null('public.workspace_talent_commission_overrides', 'requested_by_user_id', 'public.profiles');
SELECT pg_temp.fk_set_null('public.workspace_talent_commission_overrides', 'reviewed_by_user_id', 'public.profiles');
SELECT pg_temp.fk_set_null('public.workspace_talent_commission_overrides', 'set_by_user_id', 'public.profiles');
SELECT pg_temp.fk_set_null('public.channel_connections', 'consented_by', 'public.profiles');
SELECT pg_temp.fk_set_null('public.inquiry_attachments', 'uploaded_by', 'public.profiles');
SELECT pg_temp.fk_set_null('public.talent_representation_requests', 'requested_by', 'public.profiles');

-- ─── 3. money ledger survives the user ────────────────────────────────────────
SELECT pg_temp.fk_set_null('public.client_balance_ledger', 'user_id', 'auth.users');

-- ─── 1. account_deletion_requests ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No FK on purpose (see header): the row outlives the auth user.
  user_id         UUID        NOT NULL,
  -- Which settings screen the request came from. Informational only.
  surface         TEXT        NOT NULL DEFAULT 'talent'
                                CHECK (surface IN ('talent', 'client', 'workspace', 'admin')),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Always requested_at + 14 days; set by trigger so no caller can shorten it.
  scheduled_for   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  cancelled_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'blocked', 'processing', 'completed', 'cancelled', 'failed')),
  -- [{ "code": "future_booking", "count": 2 }, ...] as last evaluated.
  blockers        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  attempt_count   INT         NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error      TEXT,
  CONSTRAINT account_deletion_requests_blockers_array
    CHECK (jsonb_typeof(blockers) = 'array'),
  CONSTRAINT account_deletion_requests_cancel_consistent
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CONSTRAINT account_deletion_requests_complete_consistent
    CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

COMMENT ON TABLE public.account_deletion_requests IS
  'Self-serve account deletion requests. 14-day grace, cancellable; executed by /api/cron/process-account-deletions. Service-role only (RLS on, no policies).';

CREATE OR REPLACE FUNCTION public.account_deletion_requests_set_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.scheduled_for := NEW.requested_at + interval '14 days';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_account_deletion_requests_schedule ON public.account_deletion_requests;
CREATE TRIGGER trg_account_deletion_requests_schedule
  BEFORE INSERT OR UPDATE OF requested_at, scheduled_for ON public.account_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.account_deletion_requests_set_schedule();

-- At most one open request per user.
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_open
  ON public.account_deletion_requests (user_id)
  WHERE status IN ('pending', 'blocked', 'processing', 'failed');

-- Executor scan: due, open requests.
CREATE INDEX IF NOT EXISTS account_deletion_requests_due_idx
  ON public.account_deletion_requests (scheduled_for)
  WHERE status IN ('pending', 'blocked', 'failed');

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_requests FROM anon, authenticated;
