-- Hub self-coordination (2026-06-02): let a user SELECT their OWN
-- coordinator participant rows.
--
-- Context: a talent booked directly via the Tulala open hub becomes the
-- coordinator on their own inquiry — the engine (submitInquiry) adds a
-- role='coordinator' inquiry_participants row keyed on user_id. The
-- private/client-thread message policies
-- (inquiry_messages_private_select_participant_v2 +
--  inquiry_messages_private_insert_participant_v2) authorize via:
--
--     EXISTS (SELECT 1 FROM inquiry_participants p
--             WHERE p.inquiry_id = inquiry_messages.inquiry_id
--               AND p.user_id = auth.uid()
--               AND p.role IN ('client','coordinator')
--               AND p.status IN ('invited','active'))
--
-- That subquery is evaluated under the *querying user's* RLS on
-- inquiry_participants. A self-coordinating talent is NOT staff of the hub
-- tenant, and the existing inquiry_participants_talent_select policy only
-- exposes role='talent' rows — so the talent could not see their own
-- coordinator row, the EXISTS returned false, and they were blocked from
-- BOTH reading and posting to the client thread they are meant to run.
-- (Verified live 2026-06-02: a talent-coordinator's private-thread insert
-- failed with "new row violates row-level security policy".)
--
-- Agency coordinators already see their coordinator rows via
-- inquiry_participants_nontalent_tenant_staff (is_staff_of_tenant). This
-- policy adds the missing path for self-coordinating talents. It is harmless
-- for everyone else: it only ever exposes a user's OWN coordinator rows
-- (user_id = auth.uid()), never anyone else's, and never any other role.

CREATE POLICY inquiry_participants_own_coordinator_select
  ON public.inquiry_participants
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND role = 'coordinator'::inquiry_participant_role
  );
