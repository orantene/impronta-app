-- What the buyer was told about age, and what they answered.
--
-- THE DEFECT THIS CLOSES. `events.age_gate` (20261229000361) and
-- `talent_offering_variants.age_gate` (20261229000364) have both existed for
-- the whole of this phase. The public event page renders "Ages 18+". No other
-- code path has ever read either column — not the purchase pipeline, not the
-- ticket picker, not the door. The restriction was typography.
--
-- The application half of the fix refuses a gated purchase that carries no
-- attestation. These three columns are the record of it.
--
--
-- WHY A STATED AGE AND NOT A DATE OF BIRTH
-- ════════════════════════════════════════
-- Nothing in this schema holds a buyer's date of birth, and adding one would
-- mean collecting a special category of personal data from every buyer of every
-- product in order to gate the small minority of events that need it. Guest
-- checkout here is genuinely account-less by design; a DOB requirement would
-- end that for everyone.
--
-- So what is recorded is what can honestly be recorded: the minimum that was in
-- force, the age the buyer stated against it, and when. An attestation is a
-- promise rather than proof, and the real check remains a human looking at an
-- ID at the door — which is exactly why the minimum is stored, so the door
-- knows a check is owed.
--
--
-- WHY SNAPSHOTTED ONTO THE ORDER AND NOT JOINED AT READ TIME
-- ═════════════════════════════════════════════════════════
-- Both halves move independently of the order. A venue can lower an event's
-- gate the week after the show, or retire the tier the ticket was bought from.
-- The question a chargeback, a licensing inspector or a refund argument asks is
-- what THIS buyer was told and answered on the day — which a join against
-- today's `events` row cannot answer. Same reasoning as the price snapshot on
-- accepted orders.
--
-- NULL is the ordinary case and means "nothing in this basket was gated". It is
-- deliberately not defaulted to 0: zero would read as a gate of zero years,
-- which is a claim, whereas NULL is the absence of one.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS age_gate_min_age       int,
  ADD COLUMN IF NOT EXISTS age_gate_confirmed_age int,
  ADD COLUMN IF NOT EXISTS age_gate_confirmed_at  timestamptz;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_age_gate_range;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_age_gate_range CHECK (
    (age_gate_min_age       IS NULL OR age_gate_min_age       BETWEEN 1 AND 99)
    AND (age_gate_confirmed_age IS NULL OR age_gate_confirmed_age BETWEEN 1 AND 120)
  );

-- The pair that must not come apart. A row claiming a confirmed age against no
-- minimum is a purchase that asked a question it had no reason to ask; a row
-- with a minimum and no confirmation is the defect this migration exists to
-- close, written down. Either is a bug in the writer, and a CHECK is how it
-- surfaces at the write instead of six months later in a report.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_age_gate_paired;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_age_gate_paired CHECK (
    (age_gate_min_age IS NULL AND age_gate_confirmed_age IS NULL AND age_gate_confirmed_at IS NULL)
    OR (age_gate_min_age IS NOT NULL AND age_gate_confirmed_age IS NOT NULL AND age_gate_confirmed_at IS NOT NULL)
  )
  NOT VALID;

-- NOT VALID, then validated separately: every order written before this
-- migration has all three columns NULL and satisfies the constraint trivially,
-- but stating that as a fact rather than assuming it is the difference between
-- a migration that works and one that worked on my machine.
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_age_gate_paired;

COMMENT ON COLUMN public.orders.age_gate_min_age IS
  'The strictest age minimum in force across this order''s lines at the moment of sale, snapshotted '
  'because the event and tier rows it came from can change afterwards. NULL means nothing in the '
  'basket was gated.';
COMMENT ON COLUMN public.orders.age_gate_confirmed_age IS
  'The age the buyer stated at checkout. An attestation, not proof: the real check is an ID at the '
  'door, and age_gate_min_age is what tells the door a check is owed.';

COMMIT;
