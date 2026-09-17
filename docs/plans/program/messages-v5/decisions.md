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

D-MSG-30 (S5) · 2026-09-17 · Catalog price change rule. A draft / offer line keeps `price_snapshot_cents` (the unit price it was added at) and `catalog_price_cents_at_add` (the raw offering / variant price at that moment, before any live phase). A later catalog change never changes an existing line: `addLine` stamps both at the add, `repriceAndValidate` is the only command that rewrites `unit_cents` and it never touches the snapshot, and the RPC `pos_mutate_draft_line` reads the catalog price itself on `add` so a caller cannot lie about it. The UI shows "catalog price now X" from the pure `priceDrift(line, catalogNow)` (`web/src/lib/pos/price-drift.ts`): the reference is the catalog stamp, then the snapshot, then `unit_cents` for pre-S5 rows; a null catalog price is a missing item, not a drift.
D-MSG-31 (S5) · 2026-09-17 · The new cents columns are `bigint`, not `integer` as the brief spelled them: every cents column on `order_lines` is bigint (`unit_cents`, `total_cents`, `tax_cents`, `refunded_cents`) and a narrower sibling would be the one that overflows first. `order_lines.tax_cents` already existed (20261228000142); the migration's `ADD COLUMN IF NOT EXISTS` is a no-op there and only `tax_label` is new on that table.
D-MSG-32 (S5) · 2026-09-17 · Who changed what is a DB fact, not an app guess. `order_line_events` is written by an AFTER trigger on `order_lines` (insert / update / delete, old + new units and cents), so the fallback writer, the RPC, `confirmLines` and any future writer all leave history. The actor comes from two transaction-local settings (`pos.actor_kind`, `pos.actor_id`) that `pos_mutate_draft_line` sets from `p_line.actor_kind` / `actor_id`; an insert with no setting is attributed to the line's own `proposed_by`, an update / delete with no setting to `staff` (the only writer outside the RPC is the service role behind a staff action). A stamp that changes nothing the customer reads (`price_phase_id`, `allocation_ids`, `refunded_cents`) writes no event. A cascade from the order's own delete writes no event either (the parent is gone; the history goes with the order via FK cascade).
D-MSG-33 (S5) · 2026-09-17 · Per-line `discount_cents` joins the order's own discount in the totals: the RPC sums `SUM(order_lines.discount_cents)` into `orders.discount_cents` (clamped to the subtotal), and the fallback writer in `draft.ts` does the same through `orderDiscountCents(order, before, after)`, which takes the previous line sum out of the stored value before adding the new one so a manual / promo discount survives. Nothing in this lane WRITES a per-line discount or tax yet: the RPC accepts them on `add` and `update`, `updateOfferDraft` carries them onto `inquiry_offer_line_items`, and the columns default to 0. Seam for whichever lane owns the discount sheet.
D-MSG-34 (S5) · 2026-09-17 · SEAM, not wired: `confirmLines(admin, { tenantId, orderId, lineIds, actor })` (`web/src/lib/pos/draft.ts`) sets `confirmed_at` / `confirmed_by` on a draft's lines (owner decision 3: picks hold, staff confirm). Exported only; S3's confirm calls it. Refuses a client actor, a line not on the sale, and a non-draft order; a repeat is idempotent (the first confirmation stands). `inquiry_offer_line_items.confirmed_*` has no writer yet either.
D-MSG-35 (S5) · 2026-09-17 · The client sees a label, a quantity and a line total. `proposed_by`, `confirmed_by`, `price_snapshot_cents`, `catalog_price_cents_at_add`, `discount_*`, `tax_*` never reach a client payload: `client-inquiry-details.ts` selects an explicit column list for offer lines, the pay page and the sent-basket snapshot select `label, units, unit_cents`, and `client-readers.static.test.ts` now holds all three closed (plus `talent_cost` / `coordinator_fee`). `proposed_by` / `confirmed_at` DO reach the staff diff sheet (`loadBasketDiff` reads them off `order_lines` and the history off `order_line_events`), which is the point.
D-MSG-36 (S5) · 2026-09-17 · Tooling: `npm run test:money` could not run on `program/messages-v5` at all — commit 1b1a6e962 fused two test paths into ONE quoted argument (`'…/door-client-never-silent.static.test.ts …/door-delivery-labels.static.test.ts'`), and `tsx --test` exits 1 with "Could not find" before running a single test. Fixed in this lane's `package.json` edit (the same line gains `draft-line-author.test.ts` and `price-drift.test.ts`). Any earlier lane reporting `test:money` green on this base did not run it.
D-MSG-37 (S5) · 2026-09-17 · `web/src/lib/supabase/database.types.ts` is hand-extended for `inquiry_offer_line_items` only (Row / Insert / Update gain the nine S5 columns) so the typed `updateOfferDraft` insert compiles; the generated file was already stale (its `order_lines` lacks `kind`, `price_phase_id`, `refunded_cents`-era siblings), the POS writers use the untyped `Admin` seam, and `check:types-fresh` is warn-only. `order_line_events` is not added to the types file; nothing reads it through the typed client. Regenerate after the integrator applies the migration.
