# Front Door Chat v2 · execution plan + Cursor prompt (2026-09-18)

Design of record: https://claude.ai/artifact/8ZEetLo1Wk6fMhazV9h22K (boards F01–F08, Items per business, control→engine map).
Program: `docs/plans/program/messages-v5/` (README, PLAN, decisions D-MSG-200..212 for the dock, lanes.md).

## Where it stands (live on production, release ≥ b81bd90eb)

| Board | State |
|---|---|
| F01 Launcher + header (heart, plane, bubble, mobile header) | live |
| F02 Home (per-business label) | live, **Book again missing** (no writer) |
| F03 Items: catalog + Add/Buy/Ask | PR #2116 (`feat/dock-items-catalog`), verify live after merge |
| F03 Items: held tables/times rows | not done (a hold needs identity, D21) |
| F04 Chat cards (choices, offer, accept/change/decline) | live |
| F05 Payment card + Pay → /pay page | live, proven on staging |
| F05 Confirmed card, tickets QR, cancel | rendered by `ClientCard`, **not proven live** |
| F06 Inquiries list (one state line + one record + amount) | **not done** (old list) |
| F07 Identity: client name self-correction, link-expiry line | **not done** (needs a client writer / link page) |
| F08 Desktop dock 400px | live |

## Execution plan (order matters, one PR each, all off `origin/main`)

1. **P1 · Verify F03 catalog live** (after #2116 merges): fast-forward `program/journeys-2026-09` to `main`, `vercel alias set <qa build> staging-qa-journeys.tulala.digital`, click the catalog on tenant `qa-journeys` at 375px: chips per category, Add to lineup, Add to inquiry (line appears under "Also in this inquiry" with "you chose"), Buy now → `/book` or `/events`, Ask → composer prefilled. Screenshots.
2. **P2 · F06 Inquiries list**: rebuild `GuestDockProjectsView` rows as name+time · subject · ONE state line · ONE record chip with amount, segments Needs you / Waiting on them / Done, "Same person?" row. Reader already exists (`listGuestInquiries` + `conversation_records` via `guest-thread-v5.ts`); reuse `lib/messaging/state.ts` families. No writer.
3. **P3 · F05 proof**: on the fixture tenant, finish a payment with a Stripe test card on staging (test mode only) and prove: Payment card "Paid", confirmed card (`order_confirmation` / `appointment_confirmation`), tickets QR (`tickets_card` on an event), cancel card + refund sentence. Fix rendering defects in `components/messages-v5/client/ClientCards.tsx` / `ClientCard.tsx` only.
4. **P4 · F03 holds as rows**: show a picked time/table (from `professional_times` payloads and `conversation_records` with `fulfilment_state = hold`) as a row with the countdown in the Items shelf (`GuestDockItemsShelf`). Read only.
5. **P5 · F07 identity**: add `messagingClientRename({ token, name })` in `lib/server-actions/messaging-client.ts` (history line via `inquiry_action_log`, semantics of `lib/messaging/rename.ts`); dock card "Your details" with name editable, email/phone read-only; link-expiry sentence on `/c/t/[token]` from `threadTokenExpiresAt`.
6. **P6 · Book again**: new sibling writer `messagingClientBookAgain({ token, recordId })` = `createDraftOrder` + `addLine` per confirmed line (`proposedBy: "client"`, `source_channel: "messages"`) on a NEW inquiry for the same client; Home card F02 + Inquiries "Book again". Owner decision 13.
7. **P7 · Tenant beta → default**: once P1–P3 are proven, flip `tenant_guest_chat_settings.cards_v5` default to on (`guest-chat-settings-shape.ts`, migration to backfill nulls), remove the "(beta)" label in the Guest chat drawer.

---

## CURSOR PROMPT (paste as the first message)

You are working in the Tulala/Impronta monorepo (`/Users/oranpersonal/Desktop/impronta-app`, Next.js app in `web/`, Supabase, Vercel). Read `CLAUDE.md`, `web/docs/development-workflow.md`, and `docs/plans/program/messages-v5/{README.md,decisions.md,lanes.md}` before touching code. Your job: finish the **Front Door Chat v2** (the public guest chat popup / "dock") against the design of record https://claude.ai/artifact/8ZEetLo1Wk6fMhazV9h22K and the plan in `docs/plans/program/messages-v5/FRONT-DOOR-CHAT-V2-CURSOR-PROMPT.md`. Work the plan in order P1 → P7, one PR per step, and do not stop between steps.

**Non-negotiable rules**
- Principle 0: Messages is a front door to the POS engine. Never insert into orders, bookings, admissions, payments or calendar tables from dock code. Client writes go through `web/src/lib/server-actions/messaging-client.ts` (thread-token identity; add sibling actions there, never edit the staff shell). The POS writers are `web/src/lib/pos/draft.ts` (`createDraftOrder`, `addLine`, `confirmLines`), `lib/scheduling/reservation-hold.ts`, `lib/inquiry/inquiry-engine-*`.
- One card renderer: every card in the dock is `web/src/components/messages-v5/client/ClientCard.tsx` with `use-client-card-actions.ts`. Never add a second renderer.
- Dock code lives in `web/src/app/t/[profileCode]/_chat/` (panel `MiniChatPanel.tsx` + `MiniChatPanelColumn.tsx` (800-line cap, put logic in `use-guest-dock-model.ts`), views `GuestDockHomeView.tsx`, `GuestDockLineupView.tsx`, `GuestDockProjectsView.tsx`, `GuestDockItemsShelf.tsx`, `GuestDockCatalog.tsx`, `GuestNextStep.tsx`, `GuestClientCards.tsx`), readers in `web/src/app/t/[profileCode]/_actions/` (`guest-chat-actions.ts` is past the size cap: add siblings like `guest-thread-v5.ts`, `guest-catalog-actions.ts`).
- The full thread load (`getGuestThreadMessages`, afterIso null) returns `v5: { threadToken, threadTokenExpiresAt, offers, payCode, items }` after `loadOwnedInquiry` proved the guest cookie owns the inquiry. That token is the client identity for every action.
- Tenant settings for the dock live on `tenant_guest_chat_settings` (`items_tab`, `cards_v5`) and the admin drawer `web/src/components/admin/shell/internal/drawers/guest-chat-settings.tsx`. The per-business Items label comes from the Words engine (`lib/words/chat-items-label.ts`, row `customers.chat_items`).
- Copy: every new string in `web/messages/{en,es,fr}.json` under `public.guestChat.*`; no em dashes; "client" not "buyer"; USD only. Colours: the dock uses the tenant accent; v5 kit tokens in `components/messages-v5/kit/tokens.css`; never dark green `#0f4f3e` or black controls.
- Migrations: only additive; version sorts after the last file in `supabase/migrations/`; run `cd web && node --env-file=.env.vercel.local scripts/check-migration-version-collisions.mjs --remote`; apply with `node scripts/apply-migration.mjs <file>` to production AND to the QA project (`NEXT_PUBLIC_SUPABASE_URL=https://fxlankepwnvelxjrahwk.supabase.co node scripts/apply-migration.mjs <file>`) BEFORE merging; prove with `scripts/qa-sql-query.mjs`.
- Gates before every commit, real exit codes: `cd web && npx eslint <changed files>`, `npm run test:messaging`, and a scoped tsc (`tsc -p` with an include list of the changed entry files + `src/**/*.d.ts`; ignore only the ambient `gtag`/`google`/`web-push` misses). Never run whole-repo `tsc --noEmit` on this machine without `web/scripts/tsc-queue.sh`.
- Git: branch off `origin/main` in a worktree (`git worktree add ../wt-<name> -b <type>/<name> origin/main`), never `git switch` the shared checkout, never push to `main` or `production`, never force. Open the PR with `gh pr create --base main`; merge only when `mergeStateStatus` is CLEAN and the Structural quality gate is SUCCESS. Merging to `main` does not deploy: the `production` pointer advances on green main CI; verify live with `git merge-base --is-ancestor <sha> $(curl -s https://tulala.digital/directory | grep -o 'sentry-release=[0-9a-f]*' | cut -d= -f2)`.
- Live QA writes only on the fixture tenant `qa-journeys` at `https://staging-qa-journeys.tulala.digital` (branch `program/journeys-2026-09`, its own Supabase project `fxlankepwnvelxjrahwk`; read the release from the page's `<meta name="baggage">`, curl gets a 302). Fast-forward that branch to `main` after each merge and re-alias the host to the new QA build (`npx vercel alias set <build>.vercel.app staging-qa-journeys.tulala.digital --scope oran-tenes-projects`, QA host only, never production domains). Never write to `improntamodels.com` or `tulala.digital` tenants; never enter real card data; Stripe test cards on staging only.
- Every finding outside the dock is filed, not fixed: append `D-MSG-<n>` lines (next free id ≥ 213) with file:line to `docs/plans/program/messages-v5/decisions.md`.
- Report each step with: PR link, gate exit codes, and screenshots at 375px and desktop of the exact screen. Never say "done" or "live" without the merge-base check and a screenshot.

**Definition of done per step**
- P1: catalog visible with per-tenant chips; Add to lineup / Add to inquiry / Buy now / Ask each clicked and proven on `qa-journeys`; a client-added line shows "you chose" in the Items shelf and in the admin thread's Items.
- P2: Inquiries tab shows segments Needs you / Waiting on them / Done, each row = name+time, subject, ONE state line, ONE record chip with amount; tap opens the thread.
- P3: screenshots of Paid, confirmed, tickets QR and cancel cards inside the dock on `qa-journeys`.
- P4: a picked time/table row with countdown in the Items shelf.
- P5: guest edits their name from the dock; history line visible to staff; link page shows the expiry sentence.
- P6: Book again creates a NEW inquiry + draft with the last confirmed lines; old record untouched; card visible on Home and Inquiries.
- P7: `cards_v5` on by default, "(beta)" gone, Impronta dock shows v5 cards (screenshot on improntamodels.com, read-only, no writes).

Start with P1. When each step is proven, commit the decision line to `decisions.md` and move to the next without asking.
