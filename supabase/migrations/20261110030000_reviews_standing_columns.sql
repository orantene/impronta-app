-- STANDING reviews — additive column foundation (Phase 1a).
--
-- Adds the STANDING signal + integrity columns to talent_reviews and the split
-- aggregate columns to talent_profiles. This migration is PURELY ADDITIVE: no
-- triggers, RLS, or recompute logic change here, so it is safe to apply ahead of
-- the behaviour-changing integrity migration (arm's-length verification, edit
-- guard, column-guarded client UPDATE, split recompute, moderation audit) which
-- lands separately and is tested on its own.
--
-- `anon` is honoured immediately by the public loader (a review with anon = true
-- renders as "Verified client", no name). All other columns are inert until the
-- integrity + signals migrations wire them into triggers, reads, and UI.

BEGIN;

-- ---------------------------------------------------------------------------
-- talent_reviews — STANDING signal + integrity columns (all nullable/defaulted)
-- ---------------------------------------------------------------------------
ALTER TABLE public.talent_reviews
  ADD COLUMN IF NOT EXISTS would_book_again   BOOLEAN,
  ADD COLUMN IF NOT EXISTS attr_professionalism SMALLINT CHECK (attr_professionalism BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS attr_skill           SMALLINT CHECK (attr_skill BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS attr_communication   SMALLINT CHECK (attr_communication BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS attr_reliability      SMALLINT CHECK (attr_reliability BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS traits             TEXT[],
  ADD COLUMN IF NOT EXISTS private_note       TEXT,
  ADD COLUMN IF NOT EXISTS anon               BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transaction_id     UUID        REFERENCES public.booking_transactions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS skill_scope        TEXT,
  ADD COLUMN IF NOT EXISTS verified_paid      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_body         TEXT,
  ADD COLUMN IF NOT EXISTS reply_at           TIMESTAMPTZ;

COMMENT ON COLUMN public.talent_reviews.would_book_again IS
  'STANDING headline signal: would this client book this talent again (per completed booking).';
COMMENT ON COLUMN public.talent_reviews.anon IS
  'When true the public loader renders the reviewer as "Verified client" (no first name).';
COMMENT ON COLUMN public.talent_reviews.verified_paid IS
  'Set by the arm''s-length verification trigger (separate migration). Only verified_paid rows feed the public signal once that migration lands. Inert here.';
COMMENT ON COLUMN public.talent_reviews.skill_scope IS
  'Server-derived (booking_talent.role_label) skill bucket for per-skill honesty. Nullable = global bucket.';
COMMENT ON COLUMN public.talent_reviews.published_at IS
  'Immutable first-publish timestamp anchoring the client edit window (separate integrity migration).';
COMMENT ON COLUMN public.talent_reviews.reply_body IS
  'Talent right-of-reply text (one public reply). Wired by the integrity migration.';

-- ---------------------------------------------------------------------------
-- talent_profiles — split aggregate columns (public vs all-rows) + would-book-again %
-- ---------------------------------------------------------------------------
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS rating_all_avg      NUMERIC(3, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_all_count    INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS would_book_again_pct SMALLINT;

COMMENT ON COLUMN public.talent_profiles.rating_all_avg IS
  'Mean of ALL non-spam reviews regardless of status (laundering-detection baseline vs rating_avg). Maintained by the split recompute in the integrity migration.';
COMMENT ON COLUMN public.talent_profiles.would_book_again_pct IS
  'Percent of verified reviews with would_book_again = true. NULL until enough verified reviews exist.';

COMMIT;
