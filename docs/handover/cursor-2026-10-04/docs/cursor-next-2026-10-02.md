# Cursor: full work order (rev 2, 2026-10-02)

Owner: Oran. Repo `orantene/impronta-app` (local `/Users/oranpersonal/Desktop/impronta-app`, app in `web/`). Vercel project `tulala`.
This file replaces the earlier `CURSOR-NEXT-2026-10-02.md`. Background detail: `CURSOR-HANDOFF-finish-line-2026-10-02.md` and `DESIGN-GALLERY-AUDIT-AND-REDESIGN-2026-10-02.md` (both on the owner's Desktop / in your Project Context).

**Run the tracks below IN PARALLEL** (separate worktrees, separate branches, separate PRs). Only the "Merge lane" is sequential: one merge to `main` at a time.

---

## 0. Binding rules (unchanged, read first)

1. **Branches / deploy**
   - Work only in worktrees off the latest `origin/main`: `git -C /Users/oranpersonal/Desktop/impronta-app worktree add .claude/worktrees/<name> -b <type>/<topic> origin/main`. Never `git switch` in the main checkout.
   - One PR per track. Merging to `main` does NOT deploy: `production` fast-forwards automatically on a green structural gate (`promote-production.yml`). Never push `production`, never force-push `main`, never admin-merge past red.
   - **Merge lane = ONE merge at a time**: wait for main CI green + production pointer advance before the next merge (parallel merges reddened main before).
2. **Gates**
   - `cd web && NODE_OPTIONS=--max-old-space-size=11264 npm run typecheck` and `npm run lint` (queue-routed; never call tsc/eslint directly).
   - Run the `npm run test:<lane>` lanes your files touch.
   - Check real exit codes.
   - File budgets (`src/lib/quality/file-size-ratchet.static.test.ts`): extract, never grow.
3. **Server**: ONE app server `localhost:3001` (worktree `.claude/worktrees/pm-apply`, launch config `pm-dashboard-prod-3001`, `bash scripts/qa-prod-local.sh build` then start). Stop it before a build. Never `pkill` by name; kill only your own PIDs. Mockup server `:3099`.
4. **Data**
   - localhost and production share ONE Supabase DB (`pluhdapdnuiulvxmyspd`). Every localhost write is a production write.
   - **Test talent = Jor's test copy `TAL-93900`** (`demo-jor-clone@impronta.test`). Never live Jor (`TAL-JORGBEAUTY`) for payments.
   - QA users Valeria `TAL-93901` (Free), `TAL-QAFIXFREE` may be written and restored.
   - Logins in `.claude/worktrees/pm-apply/web/.env.local` (`QA_*`); never paste passwords anywhere.
   - Stripe TEST keys only (`sk_test_`/`pk_test_`); cards 4242 4242 4242 4242 and 4000 0000 0000 0077 (instant available balance).
5. **Migrations**: version sorts after the newest file AND not taken remotely (check `schema_migrations`); apply before merge (`npm run db:push` or `web/scripts/apply-migration.mjs --env-file=.env.local`); verify objects with a select. Additive only unless the owner approves.
6. **Copy/design**
   - EN + ES (Mexican Spanish, tú), no em dashes, tokens not hex.
   - Talent surfaces follow the design rule: minimal words, icons + flow, explanations only in an ⓘ tooltip, ONE solid primary action per screen, no stacked black blocks, one exit pattern (← / ✕).
7. **Hard stops**: do not start the MCP / AI booking server. Lawyer items wait.
8. **Evidence**: screenshots + test counts in `docs/finish-line-2026-10-02/` (Project Context). Never claim a UI path works without clicking it.

## 1. Current state (2026-10-02 ~17:00 local)
- Production: `71b21c767`. main: `e424203af` (2 ahead, includes #2467 builder talent top bar; CI gate running → production advances automatically).
- **Turned ON in production env (apply on next deploy):** `TALENT_WEBSITE_SETTINGS_ENABLED=1` (Website Settings for everyone), `COMMISSION_PROCESSING_PASS_THROUGH=1` (fee rule). DB `platform_commission_config.processing_mode='pass_through'` already set (shared DB). Not launched publicly yet, so this is intended.
- localhost:3001 restarted with the fee rule on (`.env.local` has `COMMISSION_PROCESSING_PASS_THROUGH=1`, plus MX test keys).
- Open PRs: **#2466** (lead's cleanup: merges #2437 #2430 #2202 #2127 #2431; agent will close those 5 when merged), **#2000** Looks v2 (theme, being assessed; do not merge without owner), the 5 source PRs above (auto-closed after #2466).
- Owner decisions: D1 = TAL-93900 · fee rule live · Website Settings live · Free plan = no Add and no Move in the builder · Mexico tax withholding skipped for now (accountant TODO) · Stripe support email `hello@tulala.digital` · gallery redesign + lawyer items = last.

---

## TRACK A — Payments end-to-end on Stripe sandboxes (first real test) · priority 1

**Owner step (blocking):** Oran runs `stripe login` (orantenemx@gmail.com) in a terminal on the Mac. Ask him when you reach A2.

A1. Read `CURSOR-HANDOFF-finish-line-2026-10-02.md` section 3 (fee rule, MX platform, mechanics).
A2. Webhooks to localhost: from `.claude/worktrees/pm-apply`, `set -a; . web/.env.local; set +a`, then two long-running listeners (record PIDs):
```
stripe listen --api-key "$STRIPE_SECRET_KEY"    --forward-to localhost:3001/api/webhooks/stripe    --forward-connect-to localhost:3001/api/webhooks/stripe
stripe listen --api-key "$STRIPE_MX_SECRET_KEY" --forward-to localhost:3001/api/webhooks/stripe-mx --forward-connect-to localhost:3001/api/webhooks/stripe-mx
```
Put the printed `whsec_…` into `web/.env.local` as `STRIPE_WEBHOOK_SECRET` (+ `STRIPE_WEBHOOK_SECRET_CONNECT` if read) and `STRIPE_MX_WEBHOOK_SECRET` (+ `_CONNECT`). The old local webhook secret is stale and was once printed in a chat: replace it. Restart :3001. Smoke: `stripe trigger checkout.session.completed --api-key "$STRIPE_SECRET_KEY"` → 2xx.
A3. Snapshot TAL-93900's Stripe fields (`stripe_account_id`, `stripe_account_platform`, payout fields) before changes. Onboard US Express on the US sandbox through the app's payout flow (SSN 000-00-0000, routing 110000000, account 000123456789).
A4. **Check the #1 suspected bug first:** refunds read `processing_fee_cents` from the commission snapshot; payout writes it on `booking_payouts`. After one paid booking settles, confirm the snapshot field is filled. If not, fix (populate the snapshot at payout, or read `booking_payouts`) with tests.
A5. Checklist on TAL-93900 at :3001 (ES first, screenshots each):
  1. Seller pays: $100 service → client 101.50, fee lines on /pay → pay 0077 → webhook → booking PAID in Agenda + Money + client thread → payout = 100 − real fee; `booking_payouts.processing_fee_cents` set.
  2. Money toggle "client pays" → preview → book → client ≈104.84 → payout 100.00.
  3. Refunds: seller-pays full = 96.76 of 101.50; client-pays = 100.00 of 104.84; partial proportional; unknown fee → blocked with a clear message; transfer reversal equals the refund amount.
  4. Delayed method (if enabled on the sandbox): unpaid until `async_payment_succeeded`.
  5. Messages v5 gear drawer, tip bubble, USDC payout card (Argentina/Mexico).
  6. Receipt + confirmation PDF fee lines + "Fees are non-refundable".
  7. MX booking ONLY if the owner names an MX test profile (Connect country is immutable; a US-onboarded profile can't do MX).
A6. Cleanup: refund/cancel test bookings, close links, kill only your listener PIDs. Keep the fee rule ON (owner decision). Restore TAL-93900's Stripe fields only if the owner asks.
A7. Evidence `docs/finish-line-2026-10-02/p2-payments-e2e.md`. PR any fixes (one PR).

## TRACK B — Free plan: no Add, no Move in the talent page builder · parallel
- Builder files: `web/src/components/edit-chrome/**` (top bar now has the talent identity menu from #2467), Add gallery (already shows "Web Office" locks), drag/reorder handles, move up/down, duplicate, paste, structure-panel drag.
- For Free talents: hide or disable add / move / reorder / duplicate / paste, with an ⓘ "Disponible en Oficina Web" / "Available on Web Office" + "Ver planes". Editing text/images and hide/show stay allowed.
- Server-side: the save path (`free-site-tree-guard.ts` + builder gate) rejects a Free talent's tree whose block order or count differs from the published tree.
- Tests: render (controls hidden/disabled on Free, enabled on paid); server guard rejects reorder/add on Free. Agency/workspace builder unchanged (pin test).

## TRACK C — Stripe + email setup · parallel (mostly owner clicks)
- Set receipt/support email `hello@tulala.digital` on BOTH Stripe accounts (US `acct_1TdcQX5C0mUEeRd1`, MX `acct_1Q8V1402cKHAMrWo`) + both sandboxes. If no API path for the platform's own account, write the exact dashboard clicks for Oran.
- App config: one constant for the support email = `hello@tulala.digital`; replace other addresses in public copy.
- Email receiving: blocked on Oran creating a Resend **Full access** API key into `~/Desktop/impronta-app/web/.env.local` as `RESEND_ADMIN_API_KEY` (never in chat). Then: enable receiving on `tulala.digital` (`hello@`, `help@`, `support@`) and `demo.tulala.digital` (214 demo inboxes), add MX records in Vercel DNS (report exactly what was added), Gmail forwarding to orantene@gmail.com via a webhook PR, prove delivery (send to hello@ + one demo address + one demo password reset), flip the "support email can receive" switch.
- Verify Vercel `STRIPE_PRICE_*` (125 days old) against the Stripe US product catalog; list mismatches for Oran.
- Mexico: record the decision "no platform tax withholding for now; accountant review before live MX volume" in `docs/` and the payments plan.

## TRACK D — Booking / money small defects · parallel
1. Dinero month dropdown shows "Octubre De 2026" → locale month format.
2. Dinero "Te deben $0" next to "6 solicitudes de pago en espera" / "Con saldo 6" (cancelled test bookings counted as awaiting) → exclude cancelled/void.
3. "Mark transfer received" writes no ledger row → route through `recordBookingPayment` (`src/lib/bookings/manual-payment.ts`).
4. Cash part payment stored as `deposit` conflicts with the online-deposit flow → introduce a correct type or adjust the online check.
5. Draft bookings (offer accepted without a time) invisible in the agenda (loader reads `talent_bookings` by date) → show an "Sin hora" list/strip.
6. Hold placers that don't check agenda bookings: `reservation-propose.ts`, `messaging-client.ts`, `resources/tentative-holds.ts` → use `src/lib/scheduling/reservation-slot-free.ts`; reduce check-then-insert race (DB constraint or advisory lock if feasible).
7. `paid_after_cancellation` not surfaced in Money → "Reembolso pendiente" row/badge.
8. `engine_convert_to_booking` may create a second booking when offer accept already created one (accept doesn't set `inquiries.booked_at`) → set it on accept, test.
9. Ask CTAs hidden only client-side (brief flash) → server-side gate already partly in `talent-ask-visible.ts`; finish for header CTAs.
10. Another surface can still fire `tulala:offering-request` for a quote service and open the booking sheet → guard in `CatalogBookingSheet` open handler.
Tests for each; one PR.

## TRACK E — Authenticated QA pass on :3001 (P3.1 remainder) · parallel, read-mostly
On TAL-93900 / Valeria (approved): Dinero (Registrar pago cash full/partial, over-payment refused, Cobrado este mes + Efectivo after reload), custom-domain drawer (no purchase; ES errors), Messages gear, Website Settings screen (now ON for everyone: A1–A6 incl. 390 title, C pause banner, D chat/inquiry combos), booking cycle (chat → accept → offer → guest accepts → pay link → cancel → link closed), page builder talent top bar (back arrow → dashboard; identity menu quick links) and Free plan locks after Track B. Screenshots + list defects; route fixes into Tracks B/D.

## TRACK F — Cleanup · parallel, small
- After #2466 merges: confirm #2437 #2430 #2202 #2127 #2431 closed; report remaining `git branch -r --no-merged origin/main`.
- PR #2000 (Looks v2, theme): report whether superseded; owner decides.
- Leftover Jor test data (inquiries `6af9b754` `836960a0` `61735472` `3659993f` `fefe09e1`; guest records `qa-jor-booking-{a..i}@impronta.test`; order `345d9103` kept pending for manual refund; "QA PathA Bozo" 28 Sep bookings): list with ids → ask Oran before deleting anything on live Jor.
- Old Claude chats that can be archived (list only).

## TRACK G — Later (do NOT start until Oran says)
Gallery + library + Mi presencia redesign (4 waves in `DESIGN-GALLERY-AUDIT-AND-REDESIGN-2026-10-02.md`), Apps full flow, Talent Theme Studio, Website Settings follow-ups (bulk "follow my default", payments redesign P1/P3, one setting store, self-service cancel/reschedule, Maison combined services), intake photo upload, pixel parity, lawyer items (merchant of record, CFDI, chargebacks, talent refunds).

---

## Merge lane (sequential)
Order: #2466 (lead) → Track D → Track B → Track A fixes → Track C code. For each: rebase on latest main, gates green locally, PR, required checks green, merge, wait for main CI + `production` pointer (`git merge-base --is-ancestor <sha> origin/production`), then next. After the last merge: `cd web && npm run deploy:smoke` from a fresh `origin/main` worktree (exit 0), spot-check prod (tulala.digital, a talent site, /legal/*, Website Settings visible for a talent, fee lines on a /pay page).

## Report back
Per track: PR #, SHAs, tests (counts), screenshots folder, defects found, anything blocked on Oran (only: `stripe login`, Resend key, MX test profile, Stripe dashboard clicks, Jor data deletion).
