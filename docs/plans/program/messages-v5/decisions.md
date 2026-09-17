# Decisions (append only)

D-MSG-1 · 2026-09-17 · Owner decisions 1–14 recorded in README.md are binding.

D-MSG-2 · 2026-09-17 · One thread-type rule. `inquiry_messages.thread_type` "private" is the CLIENT thread (staff + client/guest); "group" is the TALENT thread (staff + invited talent). Every staff-authored POS message, replies, cards and internal notes alike, is written to "private" (`threadTypeForStaffMessage` in `web/src/lib/messaging/thread-rule.ts`); the engine never writes "group". Internal notes are `message_kind = 'internal_note'` on "private" so staff see one conversation, and EVERY client-facing reader (workspace client page, `/api/client/messages`, guest dock + `/c/[inquiryId]`, `/c/t/[token]`, and the talent inbox reader) excludes that kind. Staff readers (POS `loadMessagingThread`, classic `loadInquiryMessages`) read everything and each POS ThreadMessage now carries `thread`. Evidence for the rule: before S1 the engine wrote replies to "group", which no client surface reads (a POS reply never reached the client), and wrote notes to "private", which `loadInquiryMessages` and the guest reader served unfiltered (a note reached the client). The DB trigger `messaging_touch_inquiry_from_message` already returns early on `internal_note`, so a note never flips conversation state. Enforced by `web/src/lib/messaging/client-readers.static.test.ts`.
D-MSG-2a · 2026-09-17 · SEAM (no migration in S1): RLS policy `inquiry_messages_private_select_participant_v2` (supabase/migrations/20260920000000_rls_messaging_coverage.sql) lets a client participant or `inquiries.client_user_id` SELECT any "private" row by thread alone; it has no `message_kind <> 'internal_note'` clause, so a client with a direct PostgREST/realtime query (not through our readers) can read staff notes. Every shipped client reader is server-side and now filters, so the app does not leak, but the policy should add the clause in a later migration. `message_reactions` policy (20260513210938) has the same shape. Filed for the integrator.
D-MSG-2b · 2026-09-17 · The classic admin shell (`admin-2.tsx`, `loadInquiryMessages` staff audience) now receives POS internal notes on the client tab (they were already there before S1); it has no `internal_note` renderer, so they show as plain text bubbles. Cosmetic, staff-only, resolved by D10 (old shells removed after v5 QA).

D-MSG-3 · 2026-09-17 (S4) · No `subject`/`title`/`project_label` column exists on `inquiries` —
grepped every `ALTER TABLE public.inquiries` and the init `CREATE TABLE` across all of
`supabase/migrations/*.sql`; the only free-text columns are `contact_name`, `company`,
`message`, `staff_notes`, none of which fit. Per Principle 0 / lane rules, `messagingRename`
does not add a column. Instead the internal name is event-sourced off `inquiry_action_log`
(`action_type = 'messaging_rename'`, `metadata: { old, new }`); the current name is the latest
successful rename's `metadata.new`, falling back to `contact_name` (the existing fallback
`loadMessagingInbox.subject` already uses). The write is still version-locked on the inquiry's
own `version` column even though no inquiry column's *value* changes — see
`web/src/lib/messaging/inquiry-name.ts` and `rename.ts`.

D-MSG-4 · 2026-09-17 (S4) · `inquiry_action_log`'s own migration comment says the table is
"Never user-visible in Phase 1" (distinct from `inquiry_events`, which is described as
user-visible/success-only). `loadConversationHistory` reads this as "never shown to the
CLIENT", not "never shown to staff" — it is a staff-only, `staff()`-guarded workspace reader
(`web/src/lib/messaging/history.ts`), not a customer-facing surface. Flagging this explicitly
since it is an interpretation of another lane's/an earlier migration's comment, not a rule this
lane wrote.

D-MSG-5 · 2026-09-17 (S4) · `messagingMerge`'s "refuses if either has a paid or confirmed
record" guard is real only for `order` (`orders.status` paid/fulfilled/partially_refunded) and
`offer` (`inquiry_offers.status` accepted) — the two record kinds with an actual status column
reachable in one hop. `appointment` / `reservation` / `class_enrolment` / `tickets` / `project`
have no dedicated status table wired into Messages v5 yet; `RecordChip.paymentState` /
`fulfilmentState` are `null` everywhere in the existing engine too (see `inbox.ts loadChips`,
`essentials.ts` — pre-existing, not introduced by S4). Those five kinds are **not checked** by
the merge guard; a merge that should have been blocked on one of them will not be. Documented
in `web/src/lib/messaging/merge.ts`, not silently assumed safe. A future lane that wires a
status table for one of these kinds should extend `eitherHasPaidOrConfirmedRecord`.

D-MSG-6 · 2026-09-17 (S4) · `loadConversationHistory` needs assignment/handover/resolve/
reopen/close-lost events, but `messaging_assign_owner`, `messaging_set_conversation_state` and
`messaging_close_lost` (the existing RPCs in `20261231222000_pos_messaging_state.sql`) write
only to `inquiries`, never to `inquiry_action_log` or `inquiry_events`. Editing those RPCs
would be a migration; instead `messagingAssignOwner`/`messagingHandOver`/`messagingResolve`/
`messagingReopen`/`messagingCloseLost` in `messaging-engine.ts` now write a best-effort
`inquiry_action_log` row themselves, right after the RPC succeeds (never before, never blocking
the RPC's own result on the log write). `messagingAssignOwner` and `messagingHandOver` share
one `assignOwnerCore(input, handover: boolean)` so the log can tell the two apart.

D-MSG-7 · 2026-09-17 (S4) · Tooling note: this worktree's `web/node_modules` symlink was found
pointing at an incomplete install (missing `tsx`, `eslint` binaries; `next`'s compiled
`server-only` stub directory was empty), so `npm run test:messaging` / `test:inquiry-workspace`
/ `lint` all failed with `ENOENT`/`MODULE_NOT_FOUND` — reproduced identically on pre-existing,
untouched files (`inbox-unread.test.ts`, `sheets.test.ts`), so it was environmental, not this
lane's code. The coordinator repointed the symlink mid-session; all three gates then passed
clean (see lanes.md for exit codes). Logic was verified independently beforehand with a
throwaway `server-only`-stub `--require` shim (not committed) run against `src/lib/messaging/*.test.ts`
directly via `npx tsx --test`: 74/74 passing before the symlink fix, confirming the earlier
failures were infra, not S4 code.

D-MSG-8 (S7) · 2026-09-17 · S7 · Voice notes insert as `inquiry_messages.message_kind = "text"`, never `"voice"`. `inquiry_messages_message_kind_check` (supabase/migrations/20261231222000_pos_messaging_state.sql) never listed `"voice"` — `insertVoiceRows` (web/src/lib/server-actions/voice-notes.ts) was writing a value the CHECK would reject wherever it's actually enforced. No migration: the voice identity already lives on `metadata.voice` (web/src/lib/messages/voice-meta.ts's `readVoiceMetaFromMessageMetadata`), so every bubble renderer now detects a voice message from that metadata, not from `message_kind`. Touched: ClientMessagesShell.tsx, talent-thread-stream.tsx. NOT touched: `src/components/admin/shell/internal/messages/admin-4.tsx` — grepped for importers, found none; it's an unreferenced mockup-catalog file, same family as the other `internal/messages/*` numbered files, not live code.
D-MSG-9 (S7) · 2026-09-17 · S7 · Thread link expiry (owner decision 6) is computed once at mint time and baked into the token payload as an absolute `exp` (epoch ms); `verifyThreadToken` compares `now` against `payload.exp` only — it never re-queries the DB, staying a pure/DB-free check on every guest request. `resolveThreadTokenExpiry` (web/src/lib/messaging/thread-token.ts) takes 30 days after the LATEST live `conversation_records` date for the inquiry: `orders.created_at` for kind `order`; `admissions.starts_at` for `appointment` / `reservation` / `tickets` / `class_enrolment` (admissions is the one booking-holder table across Sessions & Classes, Reservations and Events/Ticketing — confirmed via web/src/lib/reservations/store.ts's `seatWalkIn`, which inserts a reservation directly as an admissions row carrying `starts_at`). `project` / `offer` have no date column anywhere yet and are skipped (not an error) — a record kind with no date semantics simply doesn't extend the window. No links, or none resolve -> falls back to `mint + 30d`, matching the pre-D-MSG-6 behaviour. Tokens minted before `exp` existed in the payload fall back to `iat + 30d` on verify, so nothing already issued breaks on deploy.
D-MSG-10 (S7) · 2026-09-17 · S7 · SEAM, not wired in: `refreshThreadToken(admin, inquiryId, tenantId)` (web/src/lib/messaging/thread-token.ts) mints a token with the D-MSG-6 expiry and is exported for "re-issued by any new payment or confirmation" (decision 6, second clause). This lane does not call it from any payment/confirm path — a follow-up lane wires it into wherever those actions land (messaging-engine.ts and/or the payment webhook/confirm handlers) and hands the refreshed token to whatever surface shows the customer their link.

D-MSG-50 (S8) · 2026-09-17 · S8 · Closed the D-MSG-2a seam. Migration `supabase/migrations/20261231252000_rls_exclude_internal_notes_non_staff.sql` recreates two policies, newest-wins audit across every migration touching `inquiry_messages`/`message_reactions` (grepped "ON public.inquiry_messages" / "ON public.message_reactions"): (1) `inquiry_messages_private_select_participant_v2` (client/coordinator SELECT on the 'private' thread, live version was from `20260920000000_rls_messaging_coverage.sql`) — added `AND message_kind <> 'internal_note'` to the USING clause; staff keep full read via the separate, untouched `inquiry_messages_tenant_staff` (FOR ALL, `is_staff_of_tenant(...)`) policy, which is OR'd in as its own permissive policy. The 'group' (talent) thread policy needs no change — D-MSG-2 already guarantees staff never write `internal_note` to `thread_type = 'group'`, so it's structurally unreachable there. Guests never read under RLS at all (`20261017090000`: guest reads are service-role only) — no guest policy to touch. (2) `message_reactions_select` (live version from `20260615200003_rls_initplan_optimize.sql`) — added `AND m.message_kind <> 'internal_note'` to the EXISTS join; this policy had no staff/tenant branch to begin with (staff reactions read, if reachable at all, goes through the same participant check as everyone else — pre-existing gap, not introduced or fixed here), and the reaction UI (`MessageReactions.tsx`/`MessageReactionMenu`) is unwired dead code (same family as `admin-4.tsx`, D-MSG-8) — but the RLS gap was real for a direct query, same class of seam as D-MSG-2a, so closed unconditionally. Applied to the isolated `qa-journeys` branch only (`journeys:repair`), never production. Proof: `pg_policies.qual` for both policies now contains `message_kind <> 'internal_note'::text` (pasted in lanes.md); a rolled-back transactional probe simulating an authenticated client (`SET LOCAL ROLE authenticated` + `request.jwt.claims` sub = the inquiry's `client_user_id`) inserted a real internal-note message + a reaction on it + an ordinary reply, then read all three under that RLS context: client saw 0/1 internal notes, 1/1 ordinary replies, 0/1 reactions on the note; a plain (RLS-bypassing) read confirmed both test rows existed. Nothing persisted (ROLLBACK). Static guard: `web/src/lib/messaging/rls-internal-note-exclusion.static.test.ts` greps the newest migration defining each policy name for the `message_kind <> 'internal_note'` predicate, so a later migration cannot silently drop it; registered automatically via the existing `test:messaging` glob (`src/lib/messaging/*.test.ts`), no package.json change. Writers untouched (INSERT policies, `messaging-engine.ts`, `insert-message.ts` — none of this lane's changes touch a write path).
