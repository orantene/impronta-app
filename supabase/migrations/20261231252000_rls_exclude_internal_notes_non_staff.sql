-- Close D-MSG-2a: client / guest / talent RLS must not be able to SELECT
-- internal notes, regardless of app-layer filters.
--
-- BACKGROUND
-- ──────────
-- D-MSG-2 (docs/plans/program/messages-v5/decisions.md) made every staff
-- message — replies AND internal notes alike — write to thread_type =
-- 'private' with internal notes distinguished only by
-- message_kind = 'internal_note'. Every shipped client reader filters that
-- kind out server-side, but the RLS policy that backs direct PostgREST /
-- realtime reads of the 'private' thread does not: it grants SELECT by
-- thread membership alone (D-MSG-2a, filed against
-- 20260920000000_rls_messaging_coverage.sql).
--
-- Newest-wins audit across every migration touching these two tables
-- (grepped "ON public.inquiry_messages" / "ON public.message_reactions"):
--   inquiry_messages SELECT policies currently live:
--     • inquiry_messages_tenant_staff              (20260515184622) — FOR ALL,
--       is_staff_of_tenant(COALESCE(target_owning_party_id, tenant_id)).
--       STAFF. Untouched — staff keep full read of notes.
--     • inquiry_messages_group_select_participant   (last recreated
--       20260615200003, initplan optimize) — thread_type = 'group' only.
--       D-MSG-2: staff NEVER write internal_note to 'group' (only ever to
--       'private'), so this policy structurally cannot surface a note by
--       thread_type mismatch. Untouched, no clause needed.
--     • inquiry_messages_private_select_participant_v2 (last recreated
--       20260920000000 — this DROP+CREATE post-dates and re-widens the
--       20260615200003 initplan-optimized version, which is why the
--       version applied today is NOT auth.uid()-initplan-wrapped; noted,
--       not this lane's fix) — thread_type = 'private', participant
--       client/coordinator row OR inquiries.client_user_id. CLIENT-FACING.
--       This is the seam: rewritten below with
--       message_kind <> 'internal_note' added to the USING clause.
--   Guests never read under RLS at all (20261017090000: "RLS on
--   inquiry_messages stays auth.uid()-based; guests never write under
--   RLS" — the same is true for reads, guest_session_id has no RLS path).
--   Every guest read is a service-role server route that already filters
--   internal_note (D-MSG-2). No guest-specific RLS policy exists to touch.
--   Talent read the 'group' thread only (inquiry_messages_group_select_
--   participant, above) — never 'private', so talent already cannot reach
--   a note row via RLS.
--
--   message_reactions SELECT policies currently live:
--     • message_reactions_select (last recreated 20260615200003) — the
--       ONLY select policy on this table; no staff/tenant branch exists at
--       all (staff read reactions, if at all, via the same participant
--       check as everyone else — a pre-existing gap, not introduced or
--       fixed here). It grants SELECT on any reaction whose message the
--       caller is a participant on the inquiry for, with NO thread_type or
--       role restriction — looser than the message SELECT policies
--       themselves. Reactions on an internal_note message are reachable by
--       this policy today. The reaction UI (MessageReactions.tsx /
--       MessageReactionMenu) is unwired dead code (same family as
--       admin-4.tsx, D-MSG-8) — no live app surface lets anyone react to a
--       note — but the RLS gap is real for a direct PostgREST/realtime
--       query, same class of seam as D-MSG-2a. Rewritten below to exclude
--       reactions on internal_note messages. Since this policy has no
--       staff branch to preserve, the exclusion is unconditional; this
--       does not regress any working staff path (there wasn't one).
--
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE, safe to re-run.

BEGIN;

-- ── inquiry_messages: client / coordinator SELECT on the 'private' thread ──
DROP POLICY IF EXISTS inquiry_messages_private_select_participant_v2 ON public.inquiry_messages;

CREATE POLICY inquiry_messages_private_select_participant_v2 ON public.inquiry_messages
  FOR SELECT USING (
    thread_type = 'private'
    AND message_kind <> 'internal_note'
    AND (
      -- Path A: participant row exists (post-offer, or coordinator)
      EXISTS (
        SELECT 1 FROM public.inquiry_participants p
        WHERE p.inquiry_id = inquiry_messages.inquiry_id
          AND p.user_id    = auth.uid()
          AND p.role       IN ('client', 'coordinator')
          AND p.status     IN ('invited', 'active')
      )
      -- Path B: caller is the inquiry's client_user_id (pre-offer, no participant row yet)
      OR EXISTS (
        SELECT 1 FROM public.inquiries i
        WHERE i.id             = inquiry_messages.inquiry_id
          AND i.client_user_id = auth.uid()
      )
    )
  );

-- ── message_reactions: exclude reactions on internal-note messages ────────
DROP POLICY IF EXISTS message_reactions_select ON public.message_reactions;

CREATE POLICY message_reactions_select ON public.message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.inquiry_messages m
      JOIN public.inquiry_participants p
        ON p.inquiry_id = m.inquiry_id
        AND p.user_id = auth.uid()
        AND p.status IN ('active', 'invited')
      WHERE m.id = message_reactions.message_id
        AND m.message_kind <> 'internal_note'
    )
  );

COMMIT;
