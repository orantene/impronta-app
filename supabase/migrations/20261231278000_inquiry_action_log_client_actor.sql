-- D-MSG-340 (A5): let a GUEST action own a history row.
--
-- `inquiry_action_log.actor_user_id` was NOT NULL, so an action taken by a
-- visitor with no account could not be logged at all. D-MSG-220 worked around
-- it by skipping the row and posting a thread line instead, which means the
-- staff history has no record of what the client changed.
--
-- Additive and reversible:
--   * `actor_user_id` becomes nullable (readers already treat null as no user:
--     `lib/messaging/history.ts` falls back to a label rather than assuming a
--     profile), and
--   * `actor_kind` records WHO acted when there is no user id.
-- A row must still name an actor one way or the other, so a fully anonymous
-- row stays impossible.
--
-- Existing rows are untouched: they all carry `actor_user_id`, and a null
-- `actor_kind` continues to mean "a staff user, identified by actor_user_id".

ALTER TABLE public.inquiry_action_log
  ALTER COLUMN actor_user_id DROP NOT NULL;

ALTER TABLE public.inquiry_action_log
  ADD COLUMN IF NOT EXISTS actor_kind text;

ALTER TABLE public.inquiry_action_log
  DROP CONSTRAINT IF EXISTS inquiry_action_log_actor_kind_known;

ALTER TABLE public.inquiry_action_log
  ADD CONSTRAINT inquiry_action_log_actor_kind_known CHECK (
    actor_kind IS NULL OR actor_kind IN ('staff', 'client', 'system')
  );

ALTER TABLE public.inquiry_action_log
  DROP CONSTRAINT IF EXISTS inquiry_action_log_has_an_actor;

ALTER TABLE public.inquiry_action_log
  ADD CONSTRAINT inquiry_action_log_has_an_actor CHECK (
    actor_user_id IS NOT NULL OR actor_kind IS NOT NULL
  );

COMMENT ON COLUMN public.inquiry_action_log.actor_kind IS
  'Who acted when there is no actor_user_id: client (a guest acting through a thread token) or system. NULL with an actor_user_id means a staff user (D-MSG-340).';
