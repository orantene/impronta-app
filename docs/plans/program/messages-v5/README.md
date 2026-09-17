# Messages v5 program

Design of record: artifact https://claude.ai/artifact/MFiCnt6i2mssBNodewHgRS (boards D01–D23, C01–C02, M01–M10; pages Coverage audit, Lifecycle, Control map, Execution plan). A copy of the plan is `PLAN.md` beside this file; the three-shell audit with file:line evidence is `audit-reports.md`.

## Principle 0
Messages is a front door to the POS engine, not a second system. A thread never inserts into orders, bookings, admissions, payments or calendar tables. It calls the writer the POS already uses and reads the record the POS already keeps. A lane that needs a new writer stops and files a seam in `decisions.md`.

## Owner decisions (2026-09-17, "go")
1. Conversation lifecycle follows the record: open while a record is open or money is owed; auto-resolve 2 days after orders/appointments fulfil, 7 days after events; a later message starts a new conversation with a Book again card; two live events = two conversations on one client record; 30 days only for chat with no record; "Same person?" only when identity is uncertain.
2. No partial acceptance of an offer.
3. Choices never book; picks hold only times and seats; staff confirm.
4. Confirm before payment only when the offer has no deposit rule, otherwise with a typed override reason written to history.
5. Clients can correct their own name from the link (history line); phone and email are staff edits.
6. Client link lives until 30 days after the last record date; re-issued by any new payment or confirmation.
7. Tasks are derived from state; no free-text tasks in v1.
8. Venue contacts are notes, not participants, in v1.
9. Primary green #2b8a63 with white text; #0f4f3e only for text and selected borders. No black controls.
10. Old shells stay behind the per-tenant flag `messages_v5` until QA passes; one removal PR after.
11. Seams → kit → screens.
12. Live QA by the integrator only, on the fixture tenant.
13. Book again is a real card and action in v1 (new POS draft, new charges, old record untouched).
14. Auto-resolve grace 2 / 7 days, per-business adjustable later.

## Lane rules
- Branch `work/msg-<lane>` off `program/messages-v5`; one PR into `program/messages-v5`. Never touch `main` or `production`.
- No dev server, no `next build`, no full `tsc`. Gates: `npm run lint`, the unit lanes you touch (`test:messaging`, `test:inquiry-workspace`, `test:money`, `test:notifications`, `test:tenant-isolation`, `test:scheduling`, `test:commands`), and scoped tsc via `npm run typecheck` only if the machine load is under 9 (`uptime`). Report real exit codes.
- Migrations: file under `supabase/migrations/` with a version that sorts after the current last file; run `node --env-file=.env.capacity-isolated.local scripts/check-migration-version-collisions.mjs --remote` from `web/`; apply to the ISOLATED branch only (`cd web && npm run journeys:repair -- ../supabase/migrations/<file>.sql`); never to production (the integrator does that). Prove objects with a read query and paste the proof in your report.
- Extension functions live in the `extensions` schema (`extensions.gen_random_bytes(...)`).
- No new inline styles (ratchet). Copy keys in EN/ES/FR (`web/messages/*.json`). Refusals are sentences from the refusal catalogue.
- Write your decisions as `D-MSG-<n>` lines in `decisions.md` (append only). Write your lane summary in `lanes.md`.
- Commit messages end with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
